import express, { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, getMaterial, updateMaterial, allRooms } from '../data/roomsStore.js';
import {
  getRecords, getRecord, rawRecord, addRecord, updateRecord, removeRecord, addAttachment, removeAttachment, filePath, FILE_DIR,
  nextId, statusOf, INTERVAL_DAYS, CONDITIONS, ACTION_STATUSES, TEAMS,
} from '../data/surveillanceStore.js';
import { MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import { listUsers, listOrder } from './users.js';
import { logAudit, diff, currentUser } from '../data/auditStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';

const router = Router();

const DAY = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SURVEYED = ['ACM Present', 'Assumed ACM']; // only known/assumed ACM is under periodic surveillance
const SIGNERS = ['inspector', 'ehs-manager', 'facilities-manager'];
const MAX_SIGNATURE_CHARS = 300_000; // PNG data URL from the signature pad
const DUE_SOON_DAYS = 30;

// Looked up live so schools added in the app are found
const schoolName = { get: (id) => schools.find((s) => s.id === id)?.name };
const buildingName = new Map(buildings.map((b) => [b.id, b.name]));
const todayMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayMs = (iso) => Date.parse(`${iso}T00:00:00`);
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const link = (r) => `/surveillance/records/${r.id}`;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Where a material is, for list rows and the form's side panel
function placeLookup() {
  const floors = new Map(getAllFloors().map((f) => [f.id, f]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  return (x) => {
    const room = rooms.get(x.roomId);
    return {
      schoolName: schoolName.get(x.schoolId) ?? x.schoolId,
      buildingName: buildingName.get(x.buildingId) ?? x.buildingId,
      floorName: floors.get(x.floorId)?.name ?? '',
      roomNumber: room?.number ?? '',
      roomName: room?.name ?? '',
    };
  };
}

const materialInfo = (m) => (m ? {
  id: m.id, name: m.name, materialType: m.materialType, location: m.location, quantity: m.quantity, unit: m.unit,
  friability: m.friability, classification: m.classification, condition: m.condition, acmStatus: m.acmStatus,
  riskRanking: m.riskRanking, assessmentDate: m.assessmentDate,
} : null);

function rows() {
  const place = placeLookup();
  const mats = new Map(getMaterials().map((m) => [m.id, m]));
  return getRecords().map((r) => {
    const m = mats.get(r.materialId);
    return { ...r, ...place(r), materialName: m?.name ?? '(deleted material)', materialType: m?.materialType ?? '' };
  });
}

function filterRows(list, { school, building, floor, condition, status, material, q }) {
  const term = q?.trim().toLowerCase();
  return list.filter((r) => (!school || r.schoolId === school)
    && (!building || r.buildingId === building)
    && (!floor || r.floorId === floor)
    && (!condition || r.condition === condition)
    && (!status || r.status === status)
    && (!material || r.materialId === material)
    && (!term || [r.id, r.materialId, r.materialName, r.materialType, r.roomNumber, r.roomName, r.inspectorName, r.schoolName]
      .some((v) => String(v ?? '').toLowerCase().includes(term))));
}

// One row per surveyed material: when it was last surveyed and when the next one is due
function schedule() {
  const place = placeLookup();
  const latest = new Map();
  for (const r of getRecords()) {
    if (r.state === 'draft') continue;
    const cur = latest.get(r.materialId);
    if (!cur || r.date > cur.date) latest.set(r.materialId, r);
  }
  const today = todayMs();
  return getMaterials().filter((m) => SURVEYED.includes(m.acmStatus)).map((m) => {
    const last = latest.get(m.id);
    // Never surveyed: the first one is due six months after the assessment
    const nextDue = last?.nextDue ?? (m.assessmentDate ? isoDay(dayMs(m.assessmentDate) + INTERVAL_DAYS * DAY) : isoDay(today));
    const t = dayMs(nextDue);
    const status = t < today ? 'overdue' : t <= today + DUE_SOON_DAYS * DAY ? 'dueSoon' : 'scheduled';
    return {
      materialId: m.id, materialName: m.name, materialType: m.materialType, acmStatus: m.acmStatus, condition: m.condition,
      schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId, ...place(m),
      lastDate: last?.date ?? null, lastId: last?.id ?? null, lastCondition: last?.condition ?? null, lastInspector: last?.inspectorName ?? null,
      nextDue, status, daysUntil: Math.round((t - today) / DAY),
    };
  });
}

const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const paginate = (list, q) => {
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  return { total: list.length, page, pageSize, pages, items: list.slice((page - 1) * pageSize, page * pageSize) };
};

const SORTS = {
  id: (r) => r.id, date: (r) => r.date, nextDue: (r) => r.nextDue ?? '', material: (r) => r.materialName,
  facility: (r) => `${r.schoolName} ${r.buildingName}`, condition: (r) => CONDITIONS.indexOf(r.condition), status: (r) => r.status,
};
function sortRows(list, sort, dir) {
  const key = SORTS[sort] ? sort : 'date';
  const d = (dir ?? (key === 'date' ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
  const get = SORTS[key];
  return {
    key, dir: d === 1 ? 'asc' : 'desc',
    rows: [...list].sort((a, b) => {
      const x = get(a); const y = get(b);
      return d * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) || b.id.localeCompare(a.id, 'en', { numeric: true });
    }),
  };
}

router.get('/meta', (req, res) => res.json({
  conditions: CONDITIONS,
  actionStatuses: ACTION_STATUSES,
  teams: TEAMS,
  intervalDays: INTERVAL_DAYS,
  nextId: nextId(),
  inspectors: listUsers().filter((u) => SIGNERS.includes(u.roleId) && u.status === 'active')
    .map((u) => ({ id: u.id, name: u.name, title: u.jobTitle })).sort(listOrder),
}));

// Materials that can be surveyed, for the "Associated ACM" picker
router.get('/materials', (req, res) => {
  const place = placeLookup();
  res.json(getMaterials().filter((m) => SURVEYED.includes(m.acmStatus)).map((m) => {
    const p = place(m);
    return { id: m.id, name: m.name, acmStatus: m.acmStatus, place: `${p.schoolName} / ${p.buildingName} / ${p.floorName} / ${p.roomNumber} ${p.roomName}`.trim() };
  }).sort((a, b) => a.place.localeCompare(b.place, 'en', { numeric: true })));
});

// Everything the form's side panel needs about one material
function materialContext(materialId, excludeId = null) {
  const m = getMaterial(materialId);
  if (!m) return null;
  const history = getRecords().filter((r) => r.materialId === m.id && r.id !== excludeId && r.state !== 'draft')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ id, date, condition, inspectorName, status }) => ({ id, date, condition, inspectorName, status }));
  return {
    material: materialInfo(m),
    location: { schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId, ...placeLookup()(m) },
    history,
  };
}

router.get('/material/:materialId', (req, res) => {
  const ctx = materialContext(req.params.materialId);
  if (!ctx) return res.status(404).json({ error: 'Material not found' });
  res.json(ctx);
});

// GET /api/surveillance?school=&building=&floor=&condition=&status=&material=&q=&sort=&dir=&page=&pageSize=
router.get('/', (req, res) => {
  const all = rows();
  const filtered = filterRows(all, req.query);
  const { key, dir, rows: sorted } = sortRows(filtered, req.query.sort, req.query.dir);
  const recorded = filtered.filter((r) => r.status !== 'draft');
  const n = (c) => recorded.filter((r) => r.condition === c).length;
  const sched = schedule().filter((s) => (!req.query.school || s.schoolId === req.query.school)
    && (!req.query.building || s.buildingId === req.query.building) && (!req.query.floor || s.floorId === req.query.floor));
  const { items, ...page } = paginate(sorted, req.query);
  res.json({
    ...page, sort: key, dir,
    stats: {
      total: filtered.length,
      good: n('Good'), goodPct: pct(n('Good'), recorded.length),
      damaged: n('Damaged'), damagedPct: pct(n('Damaged'), recorded.length),
      significantlyDamaged: n('Significantly Damaged'), significantlyDamagedPct: pct(n('Significantly Damaged'), recorded.length),
      actionRequired: filtered.filter((r) => r.status === 'actionRequired').length,
      drafts: filtered.filter((r) => r.status === 'draft').length,
      dueNext30: sched.filter((s) => s.status === 'dueSoon').length,
      overdue: sched.filter((s) => s.status === 'overdue').length,
    },
    records: items,
  });
});

router.get('/schedule', (req, res) => {
  const { school, building, floor, status, q } = req.query;
  const term = q?.trim().toLowerCase();
  const scoped = schedule().filter((s) => (!school || s.schoolId === school) && (!building || s.buildingId === building)
    && (!floor || s.floorId === floor)
    && (!term || [s.materialId, s.materialName, s.roomNumber, s.roomName, s.schoolName].some((v) => String(v ?? '').toLowerCase().includes(term))));
  const list = (status ? scoped.filter((s) => s.status === status) : scoped).sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const { items, ...page } = paginate(list, req.query);
  const c = (st) => scoped.filter((s) => s.status === st).length;
  res.json({ ...page, stats: { total: scoped.length, overdue: c('overdue'), dueSoon: c('dueSoon'), scheduled: c('scheduled'), never: scoped.filter((s) => !s.lastDate).length }, items });
});

// Corrective action items from recorded surveillances (routine "continue surveillance" items are left out)
router.get('/findings', (req, res) => {
  const { school, building, floor, status, q } = req.query;
  const term = q?.trim().toLowerCase();
  const today = isoDay(todayMs());
  const items = filterRows(rows(), { school, building, floor }).filter((r) => r.state !== 'draft' && r.correctiveAction)
    .flatMap((r) => r.actionItems.map((a) => ({
      ...a, recordId: r.id, recordDate: r.date, condition: r.condition, materialId: r.materialId, materialName: r.materialName,
      schoolName: r.schoolName, buildingName: r.buildingName, floorName: r.floorName, roomNumber: r.roomNumber, roomName: r.roomName,
      overdue: a.status !== 'Closed' && a.dueDate < today,
    })))
    .filter((a) => !term || [a.text, a.recordId, a.materialName, a.assignedTo, a.schoolName, a.roomNumber].some((v) => String(v ?? '').toLowerCase().includes(term)));
  const list = (status ? items.filter((a) => (status === 'overdue' ? a.overdue : a.status === status)) : items)
    .sort((a, b) => (a.status === 'Closed') - (b.status === 'Closed') || a.dueDate.localeCompare(b.dueDate));
  const { items: pageItems, ...page } = paginate(list, req.query);
  const c = (st) => items.filter((a) => a.status === st).length;
  res.json({ ...page, stats: { total: items.length, open: c('Open'), inProgress: c('In Progress'), closed: c('Closed'), overdue: items.filter((a) => a.overdue).length }, items: pageItems });
});

router.get('/export.csv', (req, res) => {
  const { rows: list } = sortRows(filterRows(rows(), req.query), req.query.sort, req.query.dir);
  logAudit(req, { action: 'export', module: 'Surveillance', recordId: 'surveillance.csv', summary: `Exported ${list.length} surveillance records to CSV` });
  const header = ['Surveillance ID', 'ACM ID', 'Material', 'School', 'Building', 'Floor', 'Room', 'Date', 'Inspector', 'Condition', 'Changed', 'Corrective Action', 'Next Due', 'Status', 'Open Action Items', 'Comments'];
  const lines = list.map((r) => [r.id, r.materialId, r.materialName, r.schoolName, r.buildingName, r.floorName, `${r.roomNumber} ${r.roomName}`.trim(),
    r.date, r.inspectorName, r.condition, r.changed ? 'Yes' : 'No', r.correctiveAction ? 'Yes' : 'No', r.nextDue, r.status,
    r.actionItems.filter((a) => a.status !== 'Closed').length, r.comments]);
  res.type('text/csv').attachment('surveillance.csv').send([header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n'));
});

router.get('/records/:id', (req, res) => {
  const r = getRecord(req.params.id);
  if (!r) return res.status(404).json({ error: 'Surveillance record not found' });
  res.json({ record: r, ...materialContext(r.materialId, r.id) });
});

/**
 * Validates a record. Drafts only need the material; recording needs every required field, a signature,
 * and at least one action item when corrective action is required.
 */
function validate(body, existing) {
  const errors = {};
  const pick = (k, d) => (body[k] !== undefined ? body[k] : existing?.[k] ?? d);
  const draft = body.state === 'draft';
  const material = getMaterial(pick('materialId', ''));
  if (!material) errors.materialId = 'Choose the ACM being surveyed';
  else if (!SURVEYED.includes(material.acmStatus) && !existing) errors.materialId = 'Only ACM Present or Assumed ACM materials are surveyed';

  const inspectorId = pick('inspectorId', '');
  const inspector = listUsers().find((u) => u.id === inspectorId && SIGNERS.includes(u.roleId));
  const sig = pick('signature', {}) ?? {};
  const r = {
    materialId: material?.id ?? null,
    schoolId: material?.schoolId, buildingId: material?.buildingId, floorId: material?.floorId, roomId: material?.roomId,
    date: String(pick('date', '') ?? ''),
    inspectorId: inspector?.id ?? null,
    inspectorName: inspector?.name ?? null,
    condition: pick('condition', null),
    changed: pick('changed', null),
    correctiveAction: pick('correctiveAction', null),
    nextDue: String(pick('nextDue', '') ?? ''),
    comments: String(pick('comments', '') ?? '').trim().slice(0, 1000),
    signature: {
      name: inspector?.name ?? null,
      date: String(sig.date ?? ''),
      image: typeof sig.image === 'string' ? sig.image : null,
    },
    actionItems: [],
    state: draft ? 'draft' : 'recorded',
  };

  const items = pick('actionItems', []);
  if (!Array.isArray(items) || items.length > 20) errors.actionItems = 'Up to 20 action items';
  else {
    r.actionItems = items.map((a, i) => ({
      id: /^AI-\d{1,3}$/.test(a?.id) ? a.id : `AI-${i + 1}`,
      text: String(a?.text ?? '').trim().slice(0, 200),
      dueDate: String(a?.dueDate ?? ''),
      assignedTo: a?.assignedTo ?? '',
      status: a?.status ?? 'Open',
    }));
    const ids = new Set();
    r.actionItems.forEach((a, i) => {
      if (ids.has(a.id)) a.id = `AI-${i + 1}-${Date.now() % 1000}`;
      ids.add(a.id);
      if (!a.text) errors[`actionItems.${i}.text`] = 'Describe the action';
      if (a.dueDate && !ISO_DAY.test(a.dueDate)) errors[`actionItems.${i}.dueDate`] = 'Invalid date';
      if (!draft && !a.dueDate) errors[`actionItems.${i}.dueDate`] = 'Due date required';
      if (!TEAMS.includes(a.assignedTo)) errors[`actionItems.${i}.assignedTo`] = 'Choose who is responsible';
      if (!ACTION_STATUSES.includes(a.status)) errors[`actionItems.${i}.status`] = 'Invalid status';
    });
  }
  if (r.signature.image && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.signature.image) || r.signature.image.length > MAX_SIGNATURE_CHARS)) {
    errors.signature = 'Signature could not be read; clear it and sign again';
  }
  if (r.date && (!ISO_DAY.test(r.date) || Number.isNaN(dayMs(r.date)))) errors.date = 'Enter a valid date';
  else if (r.date && dayMs(r.date) > todayMs()) errors.date = 'Surveillance date can’t be in the future';
  if (r.nextDue && (!ISO_DAY.test(r.nextDue) || Number.isNaN(dayMs(r.nextDue)))) errors.nextDue = 'Enter a valid date';
  else if (r.nextDue && r.date && r.nextDue <= r.date) errors.nextDue = 'Must be after the surveillance date';
  if (r.condition !== null && !CONDITIONS.includes(r.condition)) errors.condition = 'Choose a condition';
  if (r.signature.date && !ISO_DAY.test(r.signature.date)) errors['signature.date'] = 'Enter a valid date';

  if (!draft) {
    if (!r.date) errors.date = 'Surveillance date is required';
    if (!inspector) errors.inspectorId = 'Choose who performed the surveillance';
    if (!r.condition) errors.condition = 'Choose the current condition';
    if (typeof r.changed !== 'boolean') errors.changed = 'Answer this question';
    if (typeof r.correctiveAction !== 'boolean') errors.correctiveAction = 'Answer this question';
    if (!r.nextDue) errors.nextDue = 'Next due date is required';
    else if (r.date && dayMs(r.nextDue) > dayMs(r.date) + INTERVAL_DAYS * DAY) errors.nextDue = 'AHERA requires surveillance at least every 6 months';
    // Imported/sample records were signed on paper (name only); everything recorded in the app needs a drawn signature
    const signedOnPaper = existing?.state === 'recorded' && !existing.signature?.image;
    if (!r.signature.image && !signedOnPaper) errors.signature = 'The surveillance must be signed';
    if (!r.signature.date) errors['signature.date'] = 'Signature date is required';
    if (r.correctiveAction && !r.actionItems.length) errors.actionItems = 'Add at least one corrective action item';
  }
  return { r, material, errors };
}

const auditView = (x) => ({
  Date: x.date || '—', Inspector: x.inspectorName || '—', Condition: x.condition || '—', 'Changed Since Last': x.changed == null ? '—' : x.changed ? 'Yes' : 'No',
  'Corrective Action': x.correctiveAction == null ? '—' : x.correctiveAction ? 'Yes' : 'No', 'Next Due': x.nextDue || '—', Comments: x.comments || '—',
  'Action Items': String(x.actionItems?.length ?? 0), Signed: x.signature?.image ? 'Yes' : 'No', Status: statusOf(x),
});

// Recording a surveillance keeps the material's condition in the ACM inventory current
async function syncMaterialCondition(req, r, material) {
  if (r.state === 'draft' || !material || material.condition === r.condition) return null;
  const from = material.condition;
  await updateMaterial(material.id, { condition: r.condition });
  logAudit(req, {
    action: 'update', module: 'ACM Inventory', recordId: material.id,
    link: `/schools/${material.schoolId}/buildings/${material.buildingId}/floors/${material.floorId}?room=${material.roomId}`,
    summary: `Condition of ${material.name} updated from surveillance ${r.id}`, changes: [{ field: 'Condition', from, to: r.condition }],
  });
  return { from, to: r.condition };
}

router.post('/', async (req, res, next) => {
  try {
    const { r, material, errors } = validate(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const created = await addRecord({ ...r, attachments: [], createdAt: new Date().toISOString(), createdBy: { id: currentUser().id, name: currentUser().name }, sample: false });
    const conditionChange = await syncMaterialCondition(req, created, material);
    logAudit(req, {
      action: 'create', module: 'Surveillance', recordId: created.id, link: link(created),
      summary: `${created.state === 'draft' ? 'Saved draft' : 'Recorded'} surveillance of ${material.name}`,
      changes: Object.entries(auditView(created)).map(([field, to]) => ({ field, to })),
    });
    res.status(201).json({ record: created, conditionChange });
  } catch (err) {
    next(err);
  }
});

router.put('/records/:id', async (req, res, next) => {
  try {
    const existing = rawRecord(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Surveillance record not found' });
    if (req.body?.materialId && req.body.materialId !== existing.materialId && existing.state !== 'draft') {
      return res.status(400).json({ error: 'The ACM of a recorded surveillance can’t be changed', fields: { materialId: 'Locked once recorded' } });
    }
    // A recorded surveillance can't go back to being a draft
    const body = existing.state === 'recorded' ? { ...req.body, state: 'recorded' } : req.body;
    const { r, material, errors } = validate(body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const before = auditView(existing);
    const updated = await updateRecord(existing.id, r);
    const conditionChange = await syncMaterialCondition(req, updated, material);
    const changes = diff(before, auditView(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Surveillance', recordId: updated.id, link: link(updated),
        summary: existing.state === 'draft' && updated.state === 'recorded' ? `Recorded surveillance of ${material.name}` : `Updated surveillance of ${material.name}`,
        changes,
      });
    }
    res.json({ record: updated, conditionChange });
  } catch (err) {
    next(err);
  }
});

// Quick status change of one action item (Findings tab)
router.patch('/records/:id/actions/:actionId', async (req, res, next) => {
  try {
    const existing = rawRecord(req.params.id);
    const item = existing?.actionItems.find((a) => a.id === req.params.actionId);
    if (!item) return res.status(404).json({ error: 'Action item not found' });
    const status = req.body?.status;
    if (!ACTION_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const from = item.status;
    const updated = await updateRecord(existing.id, { actionItems: existing.actionItems.map((a) => (a.id === item.id ? { ...a, status } : a)) });
    logAudit(req, { action: 'update', module: 'Surveillance', recordId: existing.id, link: link(existing), summary: `Action item “${item.text}” set to ${status}`, changes: [{ field: 'Action Item Status', from, to: status }] });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/records/:id', async (req, res, next) => {
  try {
    const r = rawRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Surveillance record not found' });
    await removeRecord(r.id);
    logAudit(req, { action: 'delete', module: 'Surveillance', recordId: r.id, summary: `Deleted ${r.state === 'draft' ? 'draft ' : ''}surveillance ${r.id}`, changes: Object.entries(auditView(r)).map(([field, from]) => ({ field, from })) });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Documents: raw body (PNG / JPEG / WebP / PDF, max 10 MB) with ?name=
router.post('/records/:id/attachments', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const r = rawRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Surveillance record not found' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF file' });
    if (r.attachments.length >= 20) return res.status(409).json({ error: 'At most 20 documents per surveillance' });
    const file = await storeUpload(FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: currentUser().id, name: currentUser().name } });
    await addAttachment(r.id, file);
    logAudit(req, { action: 'create', module: 'Surveillance', recordId: r.id, link: link(r), summary: `Attached ${file.name} to surveillance ${r.id}`, changes: [{ field: 'Document', to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/records/:id/attachments/:fileId', (req, res) => {
  const f = rawRecord(req.params.id)?.attachments.find((x) => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'Document not found' });
  sendStored(res, f, filePath(f.storedName), req.query.download === '1');
});

router.delete('/records/:id/attachments/:fileId', async (req, res, next) => {
  try {
    const r = rawRecord(req.params.id);
    const f = r?.attachments.find((x) => x.id === req.params.fileId);
    if (!f) return res.status(404).json({ error: 'Document not found' });
    await removeAttachment(r.id, f.id);
    logAudit(req, { action: 'delete', module: 'Surveillance', recordId: r.id, link: link(r), summary: `Removed ${f.name} from surveillance ${r.id}`, changes: [{ field: 'Document', from: f.name, to: '(deleted)' }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
