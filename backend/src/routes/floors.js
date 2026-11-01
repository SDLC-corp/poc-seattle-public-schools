import express, { Router } from 'express';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildings } from '../data/store.js';
import {
  getFloors, getAllFloors, getFloor, addFloor, updateFloor, removeFloor, setPlanImage, present, planPath, PLAN_DIR,
} from '../data/floorsStore.js';
import { MAX_FLOORS, ACM_STATUSES, ACM_CONDITIONS } from '../data/buildingGeometry.js';
import { floorLayout } from '../data/floorLayout.js';
import { logAudit, diff } from '../data/auditStore.js';

const MAX_PLAN_BYTES = 5 * 1024 * 1024;
const MAX_LABELS = 100;
const MAX_SHAPES = 200;
// Plan images are checked by their first bytes, not just the declared type
const IMAGE_TYPES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const SEED = /^[\w:-]{1,60}$/;
const int = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const buildingOf = (id) => buildings.find((b) => b.id === id);
const link = (b) => `/schools/${b.schoolId}/buildings/${b.id}/floors`;

function validateLabels(raw, errors) {
  if (!Array.isArray(raw)) { errors.labels = 'Labels must be a list'; return []; }
  if (raw.length > MAX_LABELS) { errors.labels = `At most ${MAX_LABELS} labelled rooms per floor`; return []; }
  return raw.map((l, i) => {
    const label = {
      id: String(l.id ?? `L${i + 1}`).slice(0, 20),
      roomId: l.roomId ? String(l.roomId).slice(0, 20) : null,
      name: String(l.name ?? '').trim().slice(0, 60),
      x: Number(l.x),
      y: Number(l.y),
      acmStatus: l.acmStatus ?? 'No ACM',
      material: String(l.material ?? '').trim().slice(0, 80),
      condition: l.condition ?? (l.acmStatus === 'Assumed ACM' ? 'Not assessed' : 'Good'),
    };
    if (!label.name) errors.labels = `Room label ${i + 1} needs a name`;
    if (!(label.x >= 0 && label.x <= 1 && label.y >= 0 && label.y <= 1)) errors.labels = `Room label ${i + 1} is outside the plan`;
    if (!ACM_STATUSES.includes(label.acmStatus)) errors.labels = `Room label ${i + 1} has an invalid ACM status`;
    if (!ACM_CONDITIONS.includes(label.condition)) errors.labels = `Room label ${i + 1} has an invalid condition`;
    return label;
  });
}

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

function validateFloor(body, existing) {
  const errors = {};
  const buildingId = existing?.buildingId ?? body.buildingId;
  const building = buildingOf(buildingId);
  if (!building) return { errors: { buildingId: 'Choose a building' } };
  const pickInt = (k) => int(body[k] ?? existing?.[k]);
  const f = {
    buildingId,
    schoolId: building.schoolId,
    number: pickInt('number'),
    name: String(body.name ?? existing?.name ?? '').trim().slice(0, 60),
    rooms: pickInt('rooms'),
    acmRooms: pickInt('acmRooms'),
    acmStatus: body.acmStatus ?? existing?.acmStatus,
    labels: validateLabels(body.labels ?? existing?.labels ?? [], errors),
    shapes: validateShapes(body.shapes ?? existing?.shapes ?? [], errors),
  };
  if (existing?.layoutSeed) f.layoutSeed = existing.layoutSeed;
  else if (!existing && body.layoutSeed !== undefined) {
    if (SEED.test(String(body.layoutSeed))) f.layoutSeed = String(body.layoutSeed);
    else errors.layoutSeed = 'Invalid layout';
  }
  const siblings = getFloors(buildingId).filter((x) => x.id !== existing?.id);
  if (!existing && siblings.length >= MAX_FLOORS) errors.number = `${building.name} already has the maximum of ${MAX_FLOORS} floors`;
  else if (!Number.isInteger(f.number) || f.number < 1 || f.number > MAX_FLOORS) errors.number = `Floor number must be 1 to ${MAX_FLOORS}`;
  else if (siblings.some((x) => x.number === f.number)) errors.number = `Floor ${f.number} already exists in ${building.name}`;
  if (!f.name) errors.name = 'Floor name is required';
  if (!Number.isInteger(f.rooms) || f.rooms < 1 || f.rooms > 500) errors.rooms = 'Rooms must be 1 to 500';
  if (!ACM_STATUSES.includes(f.acmStatus)) errors.acmStatus = 'Choose an ACM status';
  if (f.acmStatus === 'No ACM') f.acmRooms = 0;
  else if (!Number.isInteger(f.acmRooms) || f.acmRooms < 1) errors.acmRooms = 'Enter at least 1 ACM room, or choose No ACM';
  else if (f.acmRooms > f.rooms) errors.acmRooms = 'Can’t exceed the number of rooms';
  return { f, building, errors };
}

const view = (x) => ({
  'Floor No.': x.number, Name: x.name, Rooms: x.rooms, 'ACM Rooms': x.acmRooms, 'ACM Status': x.acmStatus,
  'Labelled Rooms': x.labels.map((l) => l.name).join(', ') || '—',
  'Detected Room Shapes': x.shapes?.length ?? 0,
});

const router = Router();

// GET /api/floors?buildingId=       → that building's floors, with layouts
// GET /api/floors?schoolId=         → district-wide list (all floors when no filter), without layouts
router.get('/', (req, res) => {
  const { buildingId, schoolId } = req.query;
  if (buildingId) {
    const list = getFloors(buildingId).map(present);
    return res.json({ count: list.length, maxFloors: MAX_FLOORS, floors: list });
  }
  const byId = new Map(buildings.map((b) => [b.id, b]));
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
      };
    })
    .sort((a, b) => (a.schoolName ?? '').localeCompare(b.schoolName ?? '') || (a.buildingCode ?? '').localeCompare(b.buildingCode ?? '') || a.number - b.number);
  res.json({ count: list.length, maxFloors: MAX_FLOORS, floors: list });
});

// Sample layout for a floor that hasn't been saved yet (Add Floor panel)
router.get('/layout-preview', (req, res) => {
  const layoutSeed = String(req.query.seed ?? '');
  const number = int(req.query.number);
  if (!SEED.test(layoutSeed) || !(number >= 1 && number <= MAX_FLOORS)) return res.status(400).json({ error: 'seed and number (1–3) are required' });
  res.json(floorLayout({ layoutSeed, number }));
});

router.get('/:id', (req, res) => {
  const f = getFloor(req.params.id);
  if (!f) return res.status(404).json({ error: 'Floor not found' });
  res.json(present(f));
});

router.post('/', async (req, res, next) => {
  try {
    const { f, building, errors } = validateFloor(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid floor', fields: errors });
    const { floor, building: updated } = await addFloor({ id: `${building.id}-f${Date.now().toString(36)}`, ...f });
    logAudit(req, {
      action: 'create', module: 'Schools & Facilities', recordId: floor.id, link: link(building),
      summary: `Added ${floor.name} – ${building.name}, ${building.schoolName}`,
      changes: diff({}, view(floor)).map(({ field, to }) => ({ field, to })),
      related: { school: building.schoolName, building: building.name },
    });
    res.status(201).json({ floor: present(floor), building: updated });
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
    const changes = diff(view(existing), view(floor));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Schools & Facilities', recordId: floor.id, link: link(building),
        summary: `Updated ${floor.name} – ${building.name}, ${building.schoolName}`,
        changes,
        related: { school: building.schoolName, building: building.name },
      });
    }
    res.json({ floor: present(floor), building: updated });
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
    const building = buildingOf(f.buildingId);
    logAudit(req, {
      action: 'update', module: 'Schools & Facilities', recordId: f.id, link: link(building),
      summary: `Uploaded floor plan – ${f.name}, ${building.name}`,
      changes: [{ field: 'Floor Plan', from: f.planImage?.name ?? 'Sample layout', to: name }],
      related: { school: building.schoolName, building: building.name },
    });
    res.json(present(floor));
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
    if (!f.planImage) return res.json(present(f));
    const { floor } = await setPlanImage(f.id, null);
    const building = buildingOf(f.buildingId);
    logAudit(req, {
      action: 'update', module: 'Schools & Facilities', recordId: f.id, link: link(building),
      summary: `Removed floor plan image – ${f.name}, ${building.name}`,
      changes: [{ field: 'Floor Plan', from: f.planImage.name, to: 'Sample layout' }],
      related: { school: building.schoolName, building: building.name },
    });
    res.json(present(floor));
  } catch (err) {
    next(err);
  }
});

export default router;
