import express, { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, getMaterial, allRooms } from '../data/roomsStore.js';
import { getPeople, recordStatus } from '../data/personnelStore.js';
import { programById } from '../data/trainingPrograms.js';
import * as S from '../data/omStore.js';
import * as M from '../data/omMeta.js';
import { MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import { logAudit, CURRENT_USER } from '../data/auditStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';

const router = Router();
const MODULE = 'Operations & Maintenance';
const DAY = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v) => ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`));
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const link = (a) => `/operations/activities/${a.id}`;
const SURVEYED = ['ACM Present', 'Assumed ACM'];

// Looked up live so schools added in the app are found
const schoolName = { get: (id) => schools.find((s) => s.id === id)?.name };
const buildingName = new Map(buildings.map((b) => [b.id, b.name]));
function placeLookup() {
  const floors = new Map(getAllFloors().map((f) => [f.id, f]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  return (x) => {
    const room = rooms.get(x.roomId);
    return {
      schoolName: schoolName.get(x.schoolId) ?? x.schoolId, buildingName: buildingName.get(x.buildingId) ?? x.buildingId,
      floorName: floors.get(x.floorId)?.name ?? '', roomNumber: room?.number ?? '', roomName: room?.name ?? '',
    };
  };
}

// overdue is derived: not completed and past the due date
const statusOf = (a, today = todayIso()) => (a.state !== 'completed' && a.dueDate < today ? 'overdue' : a.state);

// Does this person hold current training for the work? (16-hour O&M or 2-hour awareness)
function trainingCheck(person, type) {
  const programId = M.trainingFor(type);
  const latest = (person?.records ?? []).filter((r) => r.programId === programId).sort((a, b) => b.completedOn.localeCompare(a.completedOn))[0];
  const st = latest ? recordStatus(latest) : 'missing';
  return { programId, program: programById[programId].name, status: st, ok: st === 'valid' || st === 'dueSoon', expiresOn: latest?.expiresOn ?? null };
}

const assignees = () => getPeople().filter((p) => M.ASSIGNEE_CATEGORIES.includes(p.category) && p.status === 'active');

function rows() {
  const place = placeLookup();
  const mats = new Map(getMaterials().map((m) => [m.id, m]));
  const today = todayIso();
  return S.all('activities').map((a) => {
    const m = mats.get(a.materialId);
    const status = statusOf(a, today);
    return {
      id: a.id, type: a.type, description: a.description, priority: a.priority, dueDate: a.dueDate,
      assignedToId: a.assignedToId, assignedToName: a.assignedToName, state: a.state, status, statusLabel: M.STATUS_LABELS[status],
      completedAt: a.completedAt, materialId: a.materialId, materialName: m?.name ?? '(deleted material)', materialType: m?.materialType ?? '',
      schoolId: a.schoolId, buildingId: a.buildingId, floorId: a.floorId, roomId: a.roomId, ...place(a),
      attachments: a.attachments?.length ?? 0, createdAt: a.createdAt,
    };
  });
}

function filterRows(list, { school, building, floor, type, status, assignee, q }) {
  const term = q?.trim().toLowerCase();
  return list.filter((r) => (!school || r.schoolId === school) && (!building || r.buildingId === building) && (!floor || r.floorId === floor)
    && (!type || r.type === type) && (!assignee || r.assignedToId === assignee)
    && (!status || (status === 'open' ? r.status !== 'completed' : r.status === status))
    && (!term || [r.id, r.materialId, r.materialName, r.roomNumber, r.roomName, r.description, r.assignedToName, r.schoolName]
      .some((v) => String(v ?? '').toLowerCase().includes(term))));
}

const SORTS = {
  id: (r) => r.id, type: (r) => r.type, facility: (r) => `${r.schoolName} ${r.buildingName}`, material: (r) => r.materialName,
  dueDate: (r) => r.dueDate, assignee: (r) => r.assignedToName ?? '', status: (r) => ['overdue', 'inProgress', 'pending', 'completed'].indexOf(r.status),
  completedAt: (r) => r.completedAt ?? '',
};
const paginate = (list, q) => {
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  return { total: list.length, page, pageSize, pages, items: list.slice((page - 1) * pageSize, page * pageSize) };
};

// --- Meta & pickers ---

router.get('/meta', (req, res) => {
  res.json({
    types: M.ACTIVITY_TYPES.map((t) => ({ ...t, trainingName: programById[t.training].name })),
    priorities: M.PRIORITIES, statusLabels: M.STATUS_LABELS, controls: M.CONTROLS, sopCategories: M.SOP_CATEGORIES,
    nextId: S.nextActivityId(),
    assignees: assignees().map((p) => ({
      id: p.id, name: p.name, category: p.categoryLabel, organization: p.organization,
      training: { 'om-16': trainingCheck(p, 'Minor Repair'), awareness: trainingCheck(p, 'Cleaning (O&M)') },
    })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

router.get('/materials', (req, res) => {
  const place = placeLookup();
  res.json(getMaterials().filter((m) => SURVEYED.includes(m.acmStatus)).map((m) => {
    const p = place(m);
    return { id: m.id, name: m.name, acmStatus: m.acmStatus, place: `${p.schoolName} / ${p.buildingName} / ${p.floorName} / ${p.roomNumber} ${p.roomName}`.trim() };
  }).sort((a, b) => a.place.localeCompare(b.place, 'en', { numeric: true })));
});

// --- Activities ---

// GET /api/om/activities?school=&building=&floor=&type=&status=(pending|inProgress|completed|overdue|open)&assignee=&q=&sort=&dir=&page=&pageSize=
router.get('/activities', (req, res) => {
  const all = rows();
  const filtered = filterRows(all, req.query);
  const key = SORTS[req.query.sort] ? req.query.sort : 'dueDate';
  const d = (req.query.dir ?? (key === 'dueDate' || key === 'completedAt' ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
  const get = SORTS[key];
  const sorted = [...filtered].sort((a, b) => {
    const x = get(a); const y = get(b);
    return d * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) || b.id.localeCompare(a.id);
  });
  // Tiles show the full breakdown for the other filters
  const scoped = req.query.status ? filterRows(all, { ...req.query, status: '' }) : filtered;
  const c = (st) => scoped.filter((r) => r.status === st).length;
  const { items, ...page } = paginate(sorted, req.query);
  res.json({
    ...page, sort: key, dir: d === 1 ? 'asc' : 'desc',
    stats: { total: scoped.length, completed: c('completed'), inProgress: c('inProgress'), pending: c('pending'), overdue: c('overdue') },
    activities: items,
  });
});

router.get('/activities/export.csv', (req, res) => {
  const list = filterRows(rows(), req.query).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  logAudit(req, { action: 'export', module: MODULE, recordId: 'om-activities.csv', summary: `Exported ${list.length} O&M activities to CSV` });
  const header = ['Activity ID', 'Activity Type', 'Description', 'School', 'Building', 'Floor', 'Room', 'ACM ID', 'ACM Material', 'Priority', 'Due Date', 'Assigned To', 'Status', 'Completed'];
  const lines = list.map((r) => [r.id, r.type, r.description, r.schoolName, r.buildingName, r.floorName, `${r.roomNumber} ${r.roomName}`.trim(),
    r.materialId, r.materialName, r.priority, r.dueDate, r.assignedToName, r.statusLabel, r.completedAt?.slice(0, 10) ?? '']);
  res.type('text/csv').attachment('om-activities.csv').send([header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n'));
});

// Latest events across all activities (Recent O&M Activity panel)
router.get('/recent', (req, res) => {
  const events = S.all('activities').flatMap((a) => (a.history ?? []).map((h) => ({ ...h, activityId: a.id, type: a.type })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.min(20, Number(req.query.limit) || 6));
  res.json(events);
});

function activityDetail(a) {
  const m = getMaterial(a.materialId);
  const person = getPeople().find((p) => p.id === a.assignedToId);
  const plan = S.find('plans', `PLAN-${a.schoolId}`);
  const status = statusOf(a);
  return {
    activity: { ...a, status, statusLabel: M.STATUS_LABELS[status] },
    material: m ? { id: m.id, name: m.name, materialType: m.materialType, acmStatus: m.acmStatus, friability: m.friability, condition: m.condition, quantity: m.quantity, unit: m.unit, location: m.location } : null,
    location: { schoolId: a.schoolId, buildingId: a.buildingId, floorId: a.floorId, roomId: a.roomId, ...placeLookup()(a) },
    assigneeTraining: person ? { ...trainingCheck(person, a.type), name: person.name, category: person.categoryLabel } : null,
    plan: plan ? { id: plan.id, name: plan.name, version: plan.version, nextReview: plan.nextReview } : null,
  };
}

router.get('/activities/:id', (req, res) => {
  const a = S.find('activities', req.params.id);
  if (!a) return res.status(404).json({ error: 'O&M activity not found' });
  res.json(activityDetail(a));
});

/**
 * Validates an activity. Completing it (state → completed) needs the work record: date performed,
 * what was done, and the work-practice controls answered.
 */
function validate(body, existing) {
  const errors = {};
  const pick = (k, d) => (body[k] !== undefined ? body[k] : existing?.[k] ?? d);
  const material = getMaterial(pick('materialId', ''));
  if (!material) errors.materialId = 'Choose the ACM this work affects';
  const person = assignees().find((p) => p.id === pick('assignedToId', ''));
  const a = {
    type: pick('type', ''), description: String(pick('description', '') ?? '').trim().slice(0, 500),
    materialId: material?.id ?? null, schoolId: material?.schoolId, buildingId: material?.buildingId, floorId: material?.floorId, roomId: material?.roomId,
    priority: pick('priority', 'Medium'), dueDate: String(pick('dueDate', '') ?? ''),
    assignedToId: person?.id ?? null, assignedToName: person?.name ?? null, state: pick('state', 'pending'),
  };
  if (!M.TYPE_VALUES.includes(a.type)) errors.type = 'Choose the activity type';
  if (!a.description) errors.description = 'Describe the work';
  if (!M.PRIORITIES.includes(a.priority)) errors.priority = 'Choose a priority';
  if (!validDay(a.dueDate)) errors.dueDate = 'Choose the due date';
  if (!person) errors.assignedToId = 'Assign someone responsible';
  if (!M.STATES.includes(a.state)) errors.state = 'Invalid status';

  const w = body.work !== undefined ? body.work : existing?.work;
  if (w) {
    a.work = {
      performedOn: String(w.performedOn ?? ''), hours: w.hours === '' || w.hours == null ? null : Number(w.hours),
      notes: String(w.notes ?? '').trim().slice(0, 1000),
      controls: Object.fromEntries(M.CONTROLS.map((c) => [c.key, Boolean(w.controls?.[c.key])])),
    };
    if (a.work.performedOn && !validDay(a.work.performedOn)) errors['work.performedOn'] = 'Enter a valid date';
    else if (a.work.performedOn > todayIso()) errors['work.performedOn'] = 'Can’t be in the future';
    if (a.work.hours != null && (!Number.isFinite(a.work.hours) || a.work.hours < 0 || a.work.hours > 200)) errors['work.hours'] = 'Enter hours between 0 and 200';
  }
  if (a.state === 'completed') {
    if (!a.work?.performedOn) errors['work.performedOn'] = 'Date the work was performed is required';
    if (!a.work?.notes) errors['work.notes'] = 'Describe the work performed';
  }
  return { a, person, errors };
}

router.post('/activities', async (req, res, next) => {
  try {
    const { a, person, errors } = validate({ ...req.body, state: req.body?.state === 'inProgress' ? 'inProgress' : 'pending' });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const now = new Date().toISOString();
    const created = await S.add('activities', {
      id: S.nextActivityId(), ...a, work: null, completedAt: null, completedBy: null, attachments: [],
      history: [{ at: now, by: CURRENT_USER.name, action: 'Created' }, { at: now, by: CURRENT_USER.name, action: `Assigned to ${person.name}` }],
      createdAt: now, createdBy: { id: CURRENT_USER.id, name: CURRENT_USER.name }, sample: false,
    });
    logAudit(req, {
      action: 'create', module: MODULE, recordId: created.id, link: link(created), summary: `Created ${created.type.toLowerCase()} ${created.id}`,
      changes: [{ field: 'Type', to: created.type }, { field: 'Assigned To', to: person.name }, { field: 'Due Date', to: created.dueDate }],
    });
    res.status(201).json(activityDetail(created));
  } catch (err) {
    next(err);
  }
});

router.put('/activities/:id', async (req, res, next) => {
  try {
    const existing = S.find('activities', req.params.id);
    if (!existing) return res.status(404).json({ error: 'O&M activity not found' });
    if (existing.state === 'completed') return res.status(409).json({ error: 'Completed activities are kept as history and can’t be changed' });
    const { a, person, errors } = validate(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const now = new Date().toISOString();
    const events = [];
    const changes = [];
    const track = (field, from, to) => { if (from !== to) changes.push({ field, from: from ?? '—', to: to ?? '—' }); };
    track('Type', existing.type, a.type);
    track('Description', existing.description, a.description);
    track('Priority', existing.priority, a.priority);
    track('Due Date', existing.dueDate, a.dueDate);
    track('Assigned To', existing.assignedToName, a.assignedToName);
    track('Status', M.STATUS_LABELS[existing.state], M.STATUS_LABELS[a.state]);
    if (existing.assignedToId !== a.assignedToId) events.push({ at: now, by: CURRENT_USER.name, action: `Assigned to ${person.name}` });
    if (existing.state !== a.state) events.push({ at: now, by: CURRENT_USER.name, action: a.state === 'completed' ? 'Completed' : `Status → ${M.STATUS_LABELS[a.state]}` });
    if (!events.length && changes.length) events.push({ at: now, by: CURRENT_USER.name, action: 'Updated details' });
    const patch = {
      ...a,
      completedAt: a.state === 'completed' ? now : null,
      completedBy: a.state === 'completed' ? CURRENT_USER.name : null,
      history: [...(existing.history ?? []), ...events],
    };
    const updated = await S.update('activities', existing.id, patch);
    if (changes.length || a.work) {
      logAudit(req, {
        action: 'update', module: MODULE, recordId: updated.id, link: link(updated),
        summary: a.state === 'completed' && existing.state !== 'completed' ? `Completed ${updated.type.toLowerCase()} ${updated.id}` : `Updated O&M activity ${updated.id}`,
        changes: changes.length ? changes : [{ field: 'Work Record', to: 'Updated' }],
      });
    }
    res.json(activityDetail(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/activities/:id', async (req, res, next) => {
  try {
    const a = S.find('activities', req.params.id);
    if (!a) return res.status(404).json({ error: 'O&M activity not found' });
    if (a.state !== 'pending') return res.status(409).json({ error: 'Only activities that haven’t started can be deleted' });
    await S.remove('activities', a.id);
    logAudit(req, { action: 'delete', module: MODULE, recordId: a.id, summary: `Deleted O&M activity ${a.id}`, changes: [{ field: 'Type', from: a.type }, { field: 'Assigned To', from: a.assignedToName }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Photos & documents on an activity: raw body (PNG / JPEG / WebP / PDF, max 10 MB) with ?name=
router.post('/activities/:id/attachments', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const a = S.find('activities', req.params.id);
    if (!a) return res.status(404).json({ error: 'O&M activity not found' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF file' });
    if (a.attachments.length >= 30) return res.status(409).json({ error: 'At most 30 files per activity' });
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name } });
    await S.update('activities', a.id, { attachments: [...a.attachments, file], history: [...a.history, { at: new Date().toISOString(), by: CURRENT_USER.name, action: `Attached ${file.name}` }] });
    logAudit(req, { action: 'create', module: MODULE, recordId: a.id, link: link(a), summary: `Attached ${file.name} to ${a.id}`, changes: [{ field: 'Document', to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/activities/:id/attachments/:fileId', (req, res) => {
  const f = S.find('activities', req.params.id)?.attachments.find((x) => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  sendStored(res, f, S.filePath(f.storedName), req.query.download === '1');
});

router.delete('/activities/:id/attachments/:fileId', async (req, res, next) => {
  try {
    const a = S.find('activities', req.params.id);
    const f = a?.attachments.find((x) => x.id === req.params.fileId);
    if (!f) return res.status(404).json({ error: 'File not found' });
    if (a.state === 'completed') return res.status(409).json({ error: 'Completed activities are kept as history' });
    await S.removeFile('activities', a.id, f.id);
    logAudit(req, { action: 'delete', module: MODULE, recordId: a.id, link: link(a), summary: `Removed ${f.name} from ${a.id}`, changes: [{ field: 'Document', from: f.name, to: '(deleted)' }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- O&M plans (district + facility) ---

const planStatus = (p, today = todayIso()) => (p.nextReview < today ? 'reviewOverdue' : Date.parse(`${p.nextReview}T00:00:00`) - Date.parse(`${today}T00:00:00`) <= 60 * DAY ? 'reviewDue' : 'current');

router.get('/plans', (req, res) => {
  const term = req.query.q?.trim().toLowerCase();
  const open = new Map();
  for (const r of rows()) if (r.status !== 'completed') open.set(r.schoolId, (open.get(r.schoolId) ?? 0) + 1);
  const list = S.all('plans').map((p) => ({ ...p, status: planStatus(p), openActivities: p.schoolId ? open.get(p.schoolId) ?? 0 : null, attachments: p.attachments ?? [] }))
    .filter((p) => !term || [p.name, p.version, p.owner].some((v) => String(v ?? '').toLowerCase().includes(term)));
  const district = list.find((p) => !p.schoolId) ?? null;
  const facility = list.filter((p) => p.schoolId).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ district, facility, stats: { total: facility.length, current: facility.filter((p) => p.status === 'current').length, reviewDue: facility.filter((p) => p.status === 'reviewDue').length, reviewOverdue: facility.filter((p) => p.status === 'reviewOverdue').length } });
});

router.put('/plans/:id', async (req, res, next) => {
  try {
    const p = S.find('plans', req.params.id);
    if (!p) return res.status(404).json({ error: 'O&M plan not found' });
    const b = req.body ?? {};
    const errors = {};
    const next = {
      version: String(b.version ?? p.version).trim().slice(0, 20), effectiveDate: String(b.effectiveDate ?? p.effectiveDate),
      nextReview: String(b.nextReview ?? p.nextReview), owner: String(b.owner ?? p.owner).trim().slice(0, 80), notes: String(b.notes ?? p.notes ?? '').trim().slice(0, 500),
    };
    if (!next.version) errors.version = 'Version is required';
    if (!validDay(next.effectiveDate)) errors.effectiveDate = 'Enter a valid date';
    if (!validDay(next.nextReview)) errors.nextReview = 'Enter a valid date';
    else if (next.nextReview <= next.effectiveDate) errors.nextReview = 'Must be after the effective date';
    if (!next.owner) errors.owner = 'Plan owner is required';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const changes = Object.entries(next).filter(([k, v]) => (p[k] ?? '') !== v).map(([field, to]) => ({ field, from: p[field] || '—', to: to || '—' }));
    const updated = await S.update('plans', p.id, { ...next, sample: p.sample && !changes.length });
    if (changes.length) logAudit(req, { action: 'update', module: MODULE, recordId: p.id, link: '/operations/plans', summary: `Updated ${p.name}`, changes });
    res.json({ ...updated, status: planStatus(updated) });
  } catch (err) {
    next(err);
  }
});

router.post('/plans/:id/attachments', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const p = S.find('plans', req.params.id);
    if (!p) return res.status(404).json({ error: 'O&M plan not found' });
    const type = sniff(req.body, ['pdf']);
    if (!type) return res.status(400).json({ error: 'Upload the plan as a PDF' });
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name } });
    await S.update('plans', p.id, { attachments: [...(p.attachments ?? []), file] });
    logAudit(req, { action: 'create', module: MODULE, recordId: p.id, link: '/operations/plans', summary: `Uploaded ${file.name} to ${p.name}`, changes: [{ field: 'Plan Document', to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/plans/:id/attachments/:fileId', (req, res) => {
  const f = S.find('plans', req.params.id)?.attachments?.find((x) => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  sendStored(res, f, S.filePath(f.storedName), req.query.download === '1');
});

// --- Procedures & SOPs ---

router.get('/procedures', (req, res) => {
  const term = req.query.q?.trim().toLowerCase();
  const { category } = req.query;
  res.json(S.all('procedures').filter((p) => (!category || p.category === category)
    && (!term || [p.id, p.title, p.description, p.category].some((v) => String(v ?? '').toLowerCase().includes(term))))
    .sort((a, b) => a.id.localeCompare(b.id)));
});

// Upload a new SOP: raw PDF body with ?title=&category=&version=&description=&name=
router.post('/procedures', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const { title, category, version, description, effectiveDate } = req.query;
    const errors = {};
    if (!String(title ?? '').trim()) errors.title = 'Title is required';
    if (!M.SOP_CATEGORIES.includes(category)) errors.category = 'Choose a category';
    if (effectiveDate && !validDay(effectiveDate)) errors.effectiveDate = 'Enter a valid date';
    const type = sniff(req.body, ['pdf']);
    if (!type) errors.file = 'Attach the procedure as a PDF';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name } });
    const sop = await S.add('procedures', {
      id: S.nextSopId(), title: String(title).trim().slice(0, 120), category, description: String(description ?? '').trim().slice(0, 300),
      version: String(version ?? '1.0').trim().slice(0, 20) || '1.0', effectiveDate: effectiveDate || todayIso(), file,
      createdAt: new Date().toISOString(), createdBy: { id: CURRENT_USER.id, name: CURRENT_USER.name }, sample: false,
    });
    logAudit(req, { action: 'create', module: MODULE, recordId: sop.id, link: '/operations/procedures', summary: `Uploaded procedure ${sop.id} “${sop.title}”`, changes: [{ field: 'Category', to: category }, { field: 'File', to: file.name }] });
    res.status(201).json(sop);
  } catch (err) {
    next(err);
  }
});

// Replace the document of an existing SOP (e.g. a sample SOP without one)
router.post('/procedures/:id/file', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const p = S.find('procedures', req.params.id);
    if (!p) return res.status(404).json({ error: 'Procedure not found' });
    const type = sniff(req.body, ['pdf']);
    if (!type) return res.status(400).json({ error: 'Attach the procedure as a PDF' });
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name } });
    await S.update('procedures', p.id, { file });
    logAudit(req, { action: 'update', module: MODULE, recordId: p.id, link: '/operations/procedures', summary: `Uploaded document for ${p.id}`, changes: [{ field: 'File', from: p.file?.name ?? '—', to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/procedures/:id/file', (req, res) => {
  const p = S.find('procedures', req.params.id);
  if (!p?.file) return res.status(404).json({ error: 'No document for this procedure' });
  sendStored(res, p.file, S.filePath(p.file.storedName), req.query.download === '1');
});

export default router;
