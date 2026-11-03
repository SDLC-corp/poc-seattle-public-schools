import express, { Router } from 'express';
import { buildings, schools } from '../data/store.js';
import { getFloor } from '../data/floorsStore.js';
import {
  getRoom, rawRoom, getMaterials, getMaterial, addMaterial, updateMaterial, removeMaterial, materialsForRoom,
  addFile, removeFile, filePath, FILE_DIR,
} from '../data/roomsStore.js';
import * as META from '../data/acmMeta.js';
import { logAudit, diff, CURRENT_USER } from '../data/auditStore.js';
import { notify } from '../data/notificationsStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';
import { refreshBuildingFloors } from '../data/floorRoomsSync.js';

const buildingOf = (id) => buildings.find((b) => b.id === id);
const schoolName = (id) => schools.find((s) => s.id === id)?.name ?? null;
const link = (m) => `/schools/${m.schoolId}/buildings/${m.buildingId}/floors/${m.floorId}?room=${m.roomId}`;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function withPlace(m) {
  const room = rawRoom(m.roomId);
  const b = buildingOf(m.buildingId);
  return {
    ...m,
    roomNumber: room?.number ?? null, roomName: room?.name ?? null,
    floorName: getFloor(m.floorId)?.name ?? null, buildingName: b?.name ?? null, schoolName: schoolName(m.schoolId),
  };
}

function validateMaterial(body, existing) {
  const errors = {};
  const room = rawRoom(existing?.roomId ?? body.roomId);
  if (!room) return { errors: { roomId: 'Choose a room' } };
  const pick = (k, d) => (body[k] !== undefined ? body[k] : existing?.[k] ?? d);
  const m = {
    roomId: room.id, floorId: room.floorId, buildingId: room.buildingId, schoolId: room.schoolId,
    scope: pick('scope', 'room'),
    name: String(pick('name', '')).trim().slice(0, 80),
    materialType: pick('materialType', ''),
    location: String(pick('location', '')).trim().slice(0, 120),
    quantity: Number(pick('quantity', NaN)),
    unit: pick('unit', 'Sq ft'),
    friability: pick('friability', ''),
    classification: pick('classification', ''),
    condition: pick('condition', ''),
    riskRanking: pick('riskRanking', ''),
    assessmentDate: String(pick('assessmentDate', '') ?? ''),
    acmStatus: pick('acmStatus', ''),
    notes: String(pick('notes', '') ?? '').trim().slice(0, 500),
    relatedTracking: pick('relatedTracking', []),
  };
  const oneOf = (k, list, msg) => { if (!list.includes(m[k])) errors[k] = msg; };
  if (!m.name) errors.name = 'Material name is required';
  oneOf('scope', META.SCOPES, 'Choose a mapping scope');
  oneOf('materialType', META.MATERIAL_TYPES, 'Choose a material type');
  if (!m.location) errors.location = 'Location in room is required';
  if (!Number.isFinite(m.quantity) || m.quantity <= 0 || m.quantity > 1e6) errors.quantity = 'Enter a quantity greater than 0';
  oneOf('unit', META.UNITS, 'Choose a unit');
  oneOf('friability', META.FRIABILITY, 'Choose friability');
  oneOf('classification', META.CLASSIFICATIONS, 'Choose a classification');
  oneOf('condition', META.CONDITIONS, 'Choose a condition');
  oneOf('riskRanking', META.RISK_RANKINGS, 'Choose a risk ranking');
  oneOf('acmStatus', META.MATERIAL_STATUSES, 'Choose an ACM status');
  if (!ISO_DAY.test(m.assessmentDate) || Number.isNaN(Date.parse(m.assessmentDate))) errors.assessmentDate = 'Enter the assessment date';
  else if (Date.parse(`${m.assessmentDate}T00:00:00`) > Date.now()) errors.assessmentDate = 'Assessment date can’t be in the future';
  if (!Array.isArray(m.relatedTracking) || m.relatedTracking.some((t) => !META.RELATED_TRACKING.includes(t))) errors.relatedTracking = 'Invalid related tracking';
  // Consistency checks that matter for AHERA records
  if (m.acmStatus === 'ACM Present' && m.classification === 'Negative') errors.classification = 'A negative result can’t be “ACM Present”';
  if (m.acmStatus === 'No ACM' && m.classification !== 'Negative') errors.classification = 'Use “Negative” for materials with no ACM';
  if (Number.isFinite(m.quantity)) m.quantity = Math.round(m.quantity * 100) / 100;
  return { m, room, errors };
}

const view = (x) => ({
  Name: x.name, Type: x.materialType, Location: x.location, Quantity: `${x.quantity} ${x.unit}`, Friability: x.friability,
  Classification: x.classification, Condition: x.condition, 'Risk Ranking': x.riskRanking, 'Assessment Date': x.assessmentDate,
  'ACM Status': x.acmStatus, Scope: x.scope, Notes: x.notes || '—', 'Related Tracking': x.relatedTracking.join(', ') || '—',
});

const router = Router();

router.get('/meta', (req, res) => res.json({
  roomTypes: META.ROOM_TYPES, roomStatuses: META.ROOM_STATUSES, statuses: META.MATERIAL_STATUSES, names: META.MATERIAL_NAMES,
  types: META.MATERIAL_TYPES, units: META.UNITS, friability: META.FRIABILITY, classifications: META.CLASSIFICATIONS,
  conditions: META.CONDITIONS, riskRankings: META.RISK_RANKINGS, scopes: META.SCOPES, relatedTracking: META.RELATED_TRACKING,
  attachmentTypes: META.ATTACHMENT_TYPES, maxAttachmentBytes: META.MAX_ATTACHMENT_BYTES,
}));

// GET /api/acm-materials?roomId= (includes floor/building-wide materials) | floorId= | buildingId= | schoolId= &acmStatus=&q=
router.get('/', (req, res) => {
  const { roomId, floorId, buildingId, schoolId, acmStatus, q } = req.query;
  const room = roomId ? getRoom(roomId) : null;
  if (roomId && !room) return res.status(404).json({ error: 'Room not found' });
  const term = q?.trim().toLowerCase();
  const list = (room ? materialsForRoom(room) : getMaterials({ floorId, buildingId, schoolId }))
    .filter((m) => (!acmStatus || m.acmStatus === acmStatus) && (!term || [m.name, m.materialType, m.location, m.notes].some((v) => v?.toLowerCase().includes(term))))
    .map(withPlace);
  res.json({ count: list.length, materials: list });
});

router.get('/:id', (req, res) => {
  const m = getMaterial(req.params.id);
  if (!m) return res.status(404).json({ error: 'Material not found' });
  res.json(withPlace(m));
});

router.post('/', async (req, res, next) => {
  try {
    const { m, room, errors } = validateMaterial(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Check the highlighted fields', fields: errors });
    const created = await addMaterial({ ...m, createdBy: { id: CURRENT_USER.id, name: CURRENT_USER.name } });
    await refreshBuildingFloors(created.buildingId); // room / floor ACM status may have changed
    const place = `room ${room.number} ${room.name}, ${getFloor(room.floorId)?.name}, ${buildingOf(room.buildingId)?.name}`;
    logAudit(req, {
      action: 'create', module: 'ACM Inventory', recordId: created.id, link: link(created),
      summary: `Added ACM material ${created.name} (${created.acmStatus}) – ${place}`,
      changes: Object.entries(view(created)).map(([field, to]) => ({ field, to })),
      related: { school: schoolName(room.schoolId), building: buildingOf(room.buildingId)?.name },
    });
    // Damaged friable ACM is a response-action trigger under AHERA
    if (created.acmStatus !== 'No ACM' && created.riskRanking === 'High') {
      notify({
        type: 'compliance', priority: 'high', title: 'High-Risk ACM Recorded', link: link(created), linkLabel: 'View Room',
        message: `${created.name} (${created.condition.toLowerCase()}, ${created.friability.toLowerCase()}) in ${place}.`,
        schoolId: room.schoolId, schoolName: schoolName(room.schoolId), buildingName: buildingOf(room.buildingId)?.name,
        description: 'High-risk ACM may need a response action (repair, encapsulation, enclosure or removal) under AHERA.',
      });
    }
    res.status(201).json(withPlace(created));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = getMaterial(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Material not found' });
    const { m, errors } = validateMaterial(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Check the highlighted fields', fields: errors });
    const updated = await updateMaterial(existing.id, m);
    await refreshBuildingFloors(updated.buildingId);
    const changes = diff(view(existing), view(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'ACM Inventory', recordId: updated.id, link: link(updated),
        summary: `Updated ACM material ${updated.name}`, changes,
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
    const m = getMaterial(req.params.id);
    if (!m) return res.status(404).json({ error: 'Material not found' });
    await removeMaterial(m.id);
    await refreshBuildingFloors(m.buildingId);
    logAudit(req, {
      action: 'delete', module: 'ACM Inventory', recordId: m.id, link: link(m),
      summary: `Deleted ACM material ${m.name}`,
      changes: [{ field: 'Material', from: `${m.name} (${m.acmStatus})`, to: '(deleted)' }],
      related: { school: schoolName(m.schoolId), building: buildingOf(m.buildingId)?.name },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Attachments: raw body (PNG / JPEG / WebP / PDF, max 10 MB) with ?name=&type=&description=
router.post('/:id/attachments', express.raw({ type: () => true, limit: META.MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const m = getMaterial(req.params.id);
    if (!m) return res.status(404).json({ error: 'Material not found' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF file' });
    if (m.attachments.length >= 30) return res.status(409).json({ error: 'At most 30 attachments per material' });
    const kind = META.ATTACHMENT_TYPES.includes(req.query.type) ? req.query.type : type.ext === 'pdf' ? 'Other' : 'Photo';
    const file = await storeUpload(FILE_DIR, req.body, type, {
      name: req.query.name, type: kind, description: String(req.query.description ?? '').trim().slice(0, 120),
      uploadedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name },
    });
    await addFile('attachment', m.id, file);
    logAudit(req, { action: 'create', module: 'ACM Inventory', recordId: m.id, link: link(m), summary: `Attached ${kind.toLowerCase()} to ${m.name}`, changes: [{ field: 'Attachment', to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/attachments/:fileId', (req, res) => {
  const f = getMaterial(req.params.id)?.attachments.find((x) => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'Attachment not found' });
  sendStored(res, f, filePath(f.storedName), req.query.download === '1');
});

router.delete('/:id/attachments/:fileId', async (req, res, next) => {
  try {
    const m = getMaterial(req.params.id);
    const f = m?.attachments.find((x) => x.id === req.params.fileId);
    if (!f) return res.status(404).json({ error: 'Attachment not found' });
    await removeFile('attachment', m.id, f.id);
    logAudit(req, { action: 'delete', module: 'ACM Inventory', recordId: m.id, link: link(m), summary: `Removed attachment from ${m.name}`, changes: [{ field: 'Attachment', from: f.name, to: '(deleted)' }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
