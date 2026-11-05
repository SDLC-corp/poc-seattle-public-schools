import express, { Router } from 'express';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildings } from '../data/store.js';
import {
  getFloors, getAllFloors, getFloor, addFloor, updateFloor, removeFloor, setPlanImage, present, planPath, PLAN_DIR,
} from '../data/floorsStore.js';
import { getRooms, removeFloorRooms } from '../data/roomsStore.js';
import { syncFloorRooms } from '../data/floorRoomsSync.js';
import { logAudit, diff } from '../data/auditStore.js';

const MAX_PLAN_BYTES = 5 * 1024 * 1024;
const MAX_SHAPES = 200;
// Plan images are checked by their first bytes, not just the declared type
const IMAGE_TYPES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const int = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const buildingOf = (id) => buildings.find((b) => b.id === id);
const link = (b) => `/schools/${b.schoolId}/buildings/${b.id}/floors`;

// Room polygons detected on an uploaded plan (OpenCV in the browser); points are 0–1 fractions
function validateShapes(raw, errors) {
  if (!Array.isArray(raw) || raw.length > MAX_SHAPES) { errors.shapes = `At most ${MAX_SHAPES} room shapes per floor`; return []; }
  const ok = raw.every((s) => Array.isArray(s?.points) && s.points.length >= 6 && s.points.length <= 400 && s.points.length % 2 === 0
    && s.points.every((v) => typeof v === 'number' && v >= 0 && v <= 1));
  if (!ok) { errors.shapes = 'Invalid room shapes'; return []; }
  return raw.map((s, i) => ({
    id: String(s.id ?? `S${i + 1}`).slice(0, 20),
    name: String(s.name ?? `Room ${i + 1}`).trim().slice(0, 60) || `Room ${i + 1}`,
    points: s.points.map((v) => +v.toFixed(4)),
    area: Math.min(1, Math.max(0, Number(s.area) || 0)),
  }));
}

// Tables found on the plan by the chairs around them (tessera-style); boxes are 0–1 fractions of the plan
const MAX_TABLES = 300;
function validateTables(raw, errors) {
  const frac = (v) => typeof v === 'number' && v >= 0 && v <= 1;
  if (!Array.isArray(raw) || raw.length > MAX_TABLES || !raw.every((t) => frac(t?.x) && frac(t?.y) && frac(t?.w) && frac(t?.h))) {
    errors.tables = 'Invalid tables';
    return [];
  }
  return raw.map((t, i) => ({
    id: String(t.id ?? `T${i + 1}`).slice(0, 20),
    x: +t.x.toFixed(4), y: +t.y.toFixed(4), w: +t.w.toFixed(4), h: +t.h.toFixed(4),
    chairs: Math.min(99, Math.max(0, Math.round(Number(t.chairs) || 0))),
  }));
}

const MAX_FLOOR_NUMBER = 200;

function validateFloor(body, existing) {
  const errors = {};
  const buildingId = existing?.buildingId ?? body.buildingId;
  const building = buildingOf(buildingId);
  if (!building) return { errors: { buildingId: 'Choose a building' } };
  const f = {
    buildingId,
    schoolId: building.schoolId,
    number: int(body.number ?? existing?.number),
    name: String(body.name ?? existing?.name ?? '').trim().slice(0, 60),
    shapes: validateShapes(body.shapes ?? existing?.shapes ?? [], errors),
    tables: validateTables(body.tables ?? existing?.tables ?? [], errors),
  };
  if (existing?.layoutSeed) f.layoutSeed = existing.layoutSeed;
  // Floors added in the app take their room / ACM counts from the rooms mapped on their plan
  // (see refreshFloorCounts); older sample floors keep the counts they were generated with.
  if (!existing) Object.assign(f, { derivedCounts: true, rooms: 0, acmRooms: 0, acmStatus: 'Not Assessed' });
  const siblings = getFloors(buildingId).filter((x) => x.id !== existing?.id);
  if (!Number.isInteger(f.number) || f.number < 0 || f.number > MAX_FLOOR_NUMBER) errors.number = `Floor number must be 0 to ${MAX_FLOOR_NUMBER} (0 = ground floor)`;
  else if (siblings.some((x) => x.number === f.number)) errors.number = `Floor ${f.number} already exists in ${building.name}`;
  if (!f.name) errors.name = 'Floor name is required';
  return { f, building, errors };
}
const view = (x) => ({
  'Floor No.': x.number, Name: x.name, Rooms: x.rooms, 'ACM Rooms': x.acmRooms, 'ACM Status': x.acmStatus,
  'Detected Room Shapes': x.shapes?.length ?? 0,
  'Detected Tables': x.tables?.length ?? 0,
});

// Mapped rooms on the floor plan and how many have ACM (from the rooms store)
function roomStats(list) {
  const count = (s) => list.filter((r) => r.acmStatus === s).length;
  return { mapped: list.length, acmPresent: count('ACM Present'), assumed: count('Assumed ACM'), noAcm: count('No ACM'), notAssessed: count('Not Assessed') };
}
const withRooms = (f) => ({ ...present(f), roomStats: roomStats(getRooms({ floorId: f.id })) });

const router = Router();

// GET /api/floors?buildingId=       → that building's floors, with layouts
// GET /api/floors?schoolId=         → district-wide list (all floors when no filter), without layouts
router.get('/', (req, res) => {
  const { buildingId, schoolId } = req.query;
  if (buildingId) {
    const list = getFloors(buildingId).map(withRooms);
    return res.json({ count: list.length, floors: list });
  }
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const roomsByFloor = Map.groupBy(getRooms({ schoolId }), (r) => r.floorId);
  const list = getAllFloors()
    .filter((f) => !schoolId || f.schoolId === schoolId)
    .map((f) => {
      const b = byId.get(f.buildingId);
      return {
        ...f,
        buildingName: b?.name ?? null,
        buildingCode: b?.code ?? null,
        schoolName: b?.schoolName ?? null,
        planUrl: f.planImage ? `/api/floors/${f.id}/plan?v=${encodeURIComponent(f.planImage.uploadedAt)}` : null,
        roomStats: roomStats(roomsByFloor.get(f.id) ?? []),
      };
    })
    .sort((a, b) => (a.schoolName ?? '').localeCompare(b.schoolName ?? '') || (a.buildingCode ?? '').localeCompare(b.buildingCode ?? '') || a.number - b.number);
  res.json({ count: list.length, floors: list });
});

router.get('/:id', (req, res) => {
  const f = getFloor(req.params.id);
  if (!f) return res.status(404).json({ error: 'Floor not found' });
  res.json(withRooms(f));
});

router.post('/', async (req, res, next) => {
  try {
    const { f, building, errors } = validateFloor(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid floor', fields: errors });
    const { floor, building: updated } = await addFloor({ id: `${building.id}-f${Date.now().toString(36)}`, ...f });
    await syncFloorRooms(floor);
    logAudit(req, {
      action: 'create', module: 'Schools & Facilities', recordId: floor.id, link: link(building),
      summary: `Added ${floor.name} – ${building.name}, ${building.schoolName}`,
      changes: diff({}, view(floor)).map(({ field, to }) => ({ field, to })),
      related: { school: building.schoolName, building: building.name },
    });
    // Counts may have changed while syncing rooms, so return the fresh floor and building
    res.status(201).json({ floor: withRooms(getFloor(floor.id)), building: buildingOf(floor.buildingId) ?? updated });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = getFloor(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Floor not found' });
    const { f, building, errors } = validateFloor(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid floor', fields: errors });
    const { floor, building: updated } = await updateFloor(existing.id, f);
    await syncFloorRooms(floor);
    const changes = diff(view(existing), view(floor));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Schools & Facilities', recordId: floor.id, link: link(building),
        summary: `Updated ${floor.name} – ${building.name}, ${building.schoolName}`,
        changes,
        related: { school: building.schoolName, building: building.name },
      });
    }
    res.json({ floor: withRooms(getFloor(floor.id)), building: buildingOf(floor.buildingId) ?? updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const f = getFloor(req.params.id);
    if (!f) return res.status(404).json({ error: 'Floor not found' });
    const building = buildingOf(f.buildingId);
    if (getFloors(f.buildingId).length <= 1) return res.status(409).json({ error: 'A building needs at least one floor' });
    const { building: updated } = await removeFloor(f.id);
    await removeFloorRooms(f.id);
    logAudit(req, {
      action: 'delete', module: 'Schools & Facilities', recordId: f.id, link: link(building),
      summary: `Deleted ${f.name} – ${building.name}, ${building.schoolName}`,
      changes: [{ field: 'Floor', from: `${f.number} · ${f.name}`, to: '(deleted)' }],
      related: { school: building.schoolName, building: building.name },
    });
    res.json({ building: updated });
  } catch (err) {
    next(err);
  }
});

// Floor plan image: raw PNG / JPEG / WebP body, max 5 MB
router.post('/:id/plan', express.raw({ type: () => true, limit: MAX_PLAN_BYTES }), async (req, res, next) => {
  try {
    const f = getFloor(req.params.id);
    if (!f) return res.status(404).json({ error: 'Floor not found' });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = body.length >= 12 ? IMAGE_TYPES.find((t) => t.test(body)) : null;
    if (!type) return res.status(400).json({ error: 'Upload a PNG, JPEG or WebP image', fields: { plan: 'Upload a PNG, JPEG or WebP image' } });
    const storedName = `${f.id}-${Date.now()}.${type.ext}`;
    await writeFile(path.join(PLAN_DIR, storedName), body);
    const name = String(req.query.name ?? '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || storedName;
    const { floor } = await setPlanImage(f.id, { storedName, name, mime: type.mime, size: body.length, uploadedAt: new Date().toISOString() });
    await syncFloorRooms(floor);
    const building = buildingOf(f.buildingId);
    logAudit(req, {
      action: 'update', module: 'Schools & Facilities', recordId: f.id, link: link(building),
      summary: `Uploaded floor plan – ${f.name}, ${building.name}`,
      changes: [{ field: 'Floor Plan', from: f.planImage?.name ?? (f.derivedCounts ? '(none)' : 'Sample layout'), to: name }],
      related: { school: building.schoolName, building: building.name },
    });
    res.json(withRooms(getFloor(floor.id)));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/plan', (req, res) => {
  const f = getFloor(req.params.id);
  const file = planPath(f);
  if (!file) return res.status(404).json({ error: 'No floor plan image' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(f.planImage.mime).sendFile(file);
});

router.delete('/:id/plan', async (req, res, next) => {
  try {
    const f = getFloor(req.params.id);
    if (!f) return res.status(404).json({ error: 'Floor not found' });
    if (!f.planImage) return res.json(withRooms(f));
    const { floor } = await setPlanImage(f.id, null);
    await syncFloorRooms(floor);
    const building = buildingOf(f.buildingId);
    logAudit(req, {
      action: 'update', module: 'Schools & Facilities', recordId: f.id, link: link(building),
      summary: `Removed floor plan image – ${f.name}, ${building.name}`,
      changes: [{ field: 'Floor Plan', from: f.planImage.name, to: f.derivedCounts ? '(none)' : 'Sample layout' }],
      related: { school: building.schoolName, building: building.name },
    });
    res.json(withRooms(getFloor(floor.id)));
  } catch (err) {
    next(err);
  }
});

export default router;
