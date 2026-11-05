import express, { Router } from 'express';
import { buildings, schools } from '../data/store.js';
import { getFloor } from '../data/floorsStore.js';
import {
  getRooms, getRoom, rawRoom, addRooms, updateRoom, removeRoom, materialsForRoom, addFile, removeFile, filePath, FILE_DIR,
} from '../data/roomsStore.js';
import { ROOM_TYPES, ROOM_STATUSES, MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import { logAudit, diff } from '../data/auditStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';
import { refreshFloorCounts } from '../data/floorRoomsSync.js';

const buildingOf = (id) => buildings.find((b) => b.id === id);
const schoolName = (id) => schools.find((s) => s.id === id)?.name ?? null;
const link = (r) => `/schools/${r.schoolId}/buildings/${r.buildingId}/floors/${r.floorId}?room=${r.id}`;
const int = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// Location names for lists and the details screen
function withPlace(r) {
  const b = buildingOf(r.buildingId);
  const f = getFloor(r.floorId);
  return { ...r, schoolName: schoolName(r.schoolId), buildingName: b?.name ?? null, buildingCode: b?.code ?? null, floorName: f?.name ?? null, floorNumber: f?.number ?? null };
}

export function validPolygon(p) {
  return Array.isArray(p) && p.length >= 6 && p.length <= 400 && p.length % 2 === 0 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
}

function validateRoom(body, existing) {
  const errors = {};
  const floor = getFloor(existing?.floorId ?? body.floorId);
  if (!floor) return { errors: { floorId: 'Choose a floor' } };
  const pick = (k, d) => (body[k] !== undefined ? body[k] : existing?.[k] ?? d);
  const r = {
    floorId: floor.id, buildingId: floor.buildingId, schoolId: floor.schoolId,
    name: String(pick('name', '')).trim().slice(0, 80),
    number: String(pick('number', '')).trim().slice(0, 12),
    type: pick('type', 'Other'),
    description: String(pick('description', '') ?? '').trim().slice(0, 500),
    maxOccupancy: int(pick('maxOccupancy', null)),
    status: pick('status', 'Active'),
    polygon: pick('polygon', null),
  };
  if (!r.name) errors.name = 'Room name is required';
  if (!r.number) errors.number = 'Room number is required';
  else if (getRooms({ floorId: floor.id }).some((x) => x.number === r.number && x.id !== existing?.id)) errors.number = `Room ${r.number} already exists on this floor`;
  if (!ROOM_TYPES.includes(r.type)) errors.type = 'Choose a room type';
  if (!ROOM_STATUSES.includes(r.status)) errors.status = 'Choose a status';
  if (r.maxOccupancy !== null && (!Number.isInteger(r.maxOccupancy) || r.maxOccupancy < 0 || r.maxOccupancy > 2000)) errors.maxOccupancy = 'Enter 0 to 2,000';
  if (r.polygon !== null && !validPolygon(r.polygon)) errors.polygon = 'Invalid room outline';
  if (r.polygon) r.polygon = r.polygon.map((v) => +v.toFixed(4));
  return { r, floor, errors };
}

const view = (x) => ({
  Name: x.name, Number: x.number, Type: x.type, Description: x.description || '—', 'Max Occupancy': x.maxOccupancy ?? '—', Status: x.status,
  Outline: x.polygon ? 'On plan' : 'Not placed',
});

const router = Router();

// GET /api/rooms?floorId=&buildingId=&schoolId=&q=&acmStatus=
router.get('/', (req, res) => {
  const { floorId, buildingId, schoolId, q, acmStatus } = req.query;
  const term = q?.trim().toLowerCase();
  const list = getRooms({ floorId, buildingId, schoolId })
    .filter((r) => (!acmStatus || r.acmStatus === acmStatus) && (!term || [r.name, r.number, r.type].some((v) => v?.toLowerCase().includes(term))))
    .map(withPlace);
  res.json({ count: list.length, rooms: list });
});

router.get('/:id', (req, res) => {
  const r = getRoom(req.params.id);
  if (!r) return res.status(404).json({ error: 'Room not found' });
  res.json({ ...withPlace(r), materials: materialsForRoom(r) });
});

router.post('/', async (req, res, next) => {
  try {
    const { r, floor, errors } = validateRoom(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid room', fields: errors });
    const [created] = await addRooms([{ ...r, areaSqFt: null, shapeId: null, layoutRoomId: null }]);
    await refreshFloorCounts(floor.id);
    logAudit(req, {
      action: 'create', module: 'Schools & Facilities', recordId: created.id, link: link(created),
      summary: `Added room ${created.number} ${created.name} – ${floor.name}, ${buildingOf(floor.buildingId)?.name}`,
      changes: Object.entries(view(created)).map(([field, to]) => ({ field, to })),
      related: { school: schoolName(floor.schoolId), building: buildingOf(floor.buildingId)?.name },
    });
    res.status(201).json(withPlace(created));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = rawRoom(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Room not found' });
    const { r, errors } = validateRoom(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid room', fields: errors });
    // A redrawn outline belongs to the plan now, not the generated sample layout
    const redrawn = req.body?.polygon !== undefined && JSON.stringify(r.polygon) !== JSON.stringify(existing.polygon);
    const updated = await updateRoom(existing.id, redrawn ? { ...r, layoutRoomId: null } : r);
    const changes = diff(view(existing), view(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Schools & Facilities', recordId: updated.id, link: link(updated),
        summary: `Updated room ${updated.number} ${updated.name}`, changes,
        related: { school: schoolName(updated.schoolId), building: buildingOf(updated.buildingId)?.name },
      });
    }
    res.json(withPlace(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const r = rawRoom(req.params.id);
    if (!r) return res.status(404).json({ error: 'Room not found' });
    const removedMaterials = await removeRoom(r.id);
    await refreshFloorCounts(r.floorId);
    logAudit(req, {
      action: 'delete', module: 'Schools & Facilities', recordId: r.id, link: `/schools/${r.schoolId}/buildings/${r.buildingId}/floors/${r.floorId}`,
      summary: `Deleted room ${r.number} ${r.name}${removedMaterials ? ` and ${removedMaterials} ACM material record(s)` : ''}`,
      changes: [{ field: 'Room', from: `${r.number} ${r.name}`, to: '(deleted)' }],
      related: { school: schoolName(r.schoolId), building: buildingOf(r.buildingId)?.name },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Room photos: raw image body (PNG / JPEG / WebP, max 10 MB), ?name=
router.post('/:id/photos', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const r = rawRoom(req.params.id);
    if (!r) return res.status(404).json({ error: 'Room not found' });
    const type = sniff(req.body, ['png', 'jpg', 'webp']);
    if (!type) return res.status(400).json({ error: 'Upload a PNG, JPEG or WebP photo' });
    if ((r.photos ?? []).length >= 20) return res.status(409).json({ error: 'A room can have at most 20 photos' });
    const file = await storeUpload(FILE_DIR, req.body, type, { name: req.query.name });
    await addFile('photo', r.id, file);
    logAudit(req, { action: 'create', module: 'Schools & Facilities', recordId: r.id, link: link(r), summary: `Added photo to room ${r.number} ${r.name}`, changes: [{ field: 'Photo', to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/photos/:fileId', (req, res) => {
  const f = rawRoom(req.params.id)?.photos?.find((x) => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'Photo not found' });
  sendStored(res, f, filePath(f.storedName), req.query.download === '1');
});

router.delete('/:id/photos/:fileId', async (req, res, next) => {
  try {
    const r = rawRoom(req.params.id);
    const f = r?.photos?.find((x) => x.id === req.params.fileId);
    if (!f) return res.status(404).json({ error: 'Photo not found' });
    await removeFile('photo', r.id, f.id);
    logAudit(req, { action: 'delete', module: 'Schools & Facilities', recordId: r.id, link: link(r), summary: `Removed photo from room ${r.number} ${r.name}`, changes: [{ field: 'Photo', from: f.name, to: '(deleted)' }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
