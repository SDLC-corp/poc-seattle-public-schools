import express, { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, getMaterial, allRooms } from '../data/roomsStore.js';
import { getPeople, recordStatus } from '../data/personnelStore.js';
import { programById } from '../data/trainingPrograms.js';
import * as S from '../data/omStore.js';
import * as M from '../data/omMeta.js';
import { MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import { logAudit, currentUser } from '../data/auditStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';
import { getRecord, getRecords, updateRecord } from '../data/inspectionRecordsStore.js';
import { listUsers } from './users.js';
import { syncInspectionStages } from '../data/inspectionLifecycle.js';

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

// An activity created from an inspection keeps that inspection's action item (and so its stage) in step
const ACTION_STATUS = { pending: 'Pending', inProgress: 'In Progress', completed: 'Completed' };
async function syncInspection(activity, { removed = false } = {}) {
  const r = activity.inspectionId && getRecord(activity.inspectionId);
  if (!r) return;
  const items = removed
    ? r.actionItems.filter((x) => x.omActivityId !== activity.id)
    : r.actionItems.map((x) => (x.omActivityId === activity.id ? { ...x, status: ACTION_STATUS[activity.state] ?? x.status, dueDate: activity.dueDate, assignee: activity.assignedToName } : x));
  const updated = await updateRecord(r.id, { actionItems: items });
  await syncInspectionStages(updated);
}

const assignees = () => getPeople().filter((p) => M.ASSIGNEE_CATEGORIES.includes(p.category) && p.status === 'active');

/**
 * The inspection's sample of the activity's ACM: its sample ID and, once it has gone to the lab, where it's listed
 * (Lab & Sampling Results, or Air Monitoring for an air sample — ids as inspectionSamples.js makes them).
 */
const NO_SAMPLE = { sampleId: null, sampleLink: null, labSampleId: null, labReportNo: null, sampleResult: null };
function sampleOf(r, materialId) {
  if (!r) return NO_SAMPLE;
  const acms = [r, ...(r.extra ?? [])];
  const i = acms.findIndex((x) => x.materialId === materialId);
  const s = acms[i]?.sampling;
  if (s?.required !== 'Yes') return NO_SAMPLE;
  const sent = Boolean(s.sentToLabAt) || !r.reviewGates;
  const air = s.sampleType === 'Air Sample';
  return {
    sampleId: s.sampleId || `${r.id}-${i + 1}`,
    sampleLink: !sent ? null : air ? `/air-monitoring/events/AIR-${r.id}-${i + 1}` : `/sampling/samples/ins-${r.id}-${i}`,
    labSampleId: s.labSampleId || null, labReportNo: s.labReportNo || null, sampleResult: s.result || null,
  };
}

// Submitted inspections indexed by ACM (own and extra), room, building and school, newest first — to find the
// inspection related to an activity raised outside one
function inspectionsByAcm() {
  const idx = { acm: new Map(), room: new Map(), building: new Map(), school: new Map() };
  const add = (map, key, r) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(r); };
  for (const r of [...getRecords()].filter((x) => x.state !== 'draft').sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))) {
    for (const id of new Set([r.materialId, ...(r.extra ?? []).map((x) => x.materialId)])) add(idx.acm, id, r);
    add(idx.room, r.roomId, r);
    add(idx.building, r.buildingId, r);
    add(idx.school, r.schoolId, r);
  }
  return idx;
}
// An inspection's first sample (of any ACM), for a related inspection that didn't sample this activity's ACM
const anySample = (r) => {
  const acms = [r, ...(r.extra ?? [])];
  const x = acms.find((y) => y.sampling?.required === 'Yes');
  return x ? sampleOf(r, x.materialId) : NO_SAMPLE;
};
/**
 * The inspection an activity belongs to: its own; or, for one raised in O&M, the latest inspection of the same ACM —
 * else of the same room, building or school — on or before the activity was created (else the latest). The sample
 * is that inspection's sample of the ACM, or its first sample when the ACM wasn't sampled.
 */
function inspectionLinks(a, records, idx) {
  if (a.inspectionId) return { inspectionId: a.inspectionId, relatedInspection: false, ...sampleOf(records.get(a.inspectionId), a.materialId) };
  const day = String(a.createdAt ?? '').slice(0, 10);
  const pick = (list = []) => list.find((x) => String(x.date ?? '') <= day) ?? list[0] ?? null;
  const r = pick(idx.acm.get(a.materialId)) ?? pick(idx.room.get(a.roomId)) ?? pick(idx.building.get(a.buildingId)) ?? pick(idx.school.get(a.schoolId));
  if (!r) return { inspectionId: null, relatedInspection: false, ...NO_SAMPLE };
  const own = sampleOf(r, a.materialId);
  return { inspectionId: r.id, relatedInspection: true, ...(own.sampleId ? own : anySample(r)) };
}

function rows() {
  const place = placeLookup();
  const mats = new Map(getMaterials().map((m) => [m.id, m]));
  const records = new Map(getRecords().map((r) => [r.id, r]));
  const byAcm = inspectionsByAcm();
  const today = todayIso();
  const nowIso = new Date().toISOString();
  return S.all('activities').map((a) => {
    const m = mats.get(a.materialId);
    const status = statusOf(a, today);
    return {
      id: a.id, type: a.type, description: a.description, priority: a.priority, dueDate: a.dueDate,
      assignedToId: a.assignedToId, assignedToName: a.assignedToName, state: a.state, status, statusLabel: M.STATUS_LABELS[status],
      completedAt: a.completedAt, materialId: a.materialId, materialName: m?.name ?? '(deleted material)', materialType: m?.materialType ?? '',
      schoolId: a.schoolId, buildingId: a.buildingId, floorId: a.floorId, roomId: a.roomId, ...place(a),
      attachments: a.attachments?.length ?? 0, createdAt: a.createdAt,
      // Latest real activity (created, or its last history event); seeded demo dates in the future don't count
      lastActivity: [a.createdAt, ...(a.history ?? []).map((h) => h.at)].filter((t) => t && t <= nowIso).sort().at(-1) ?? '',
      workCategory: a.workCategory || null, contractorName: a.contractorName || null,
      ...inspectionLinks(a, records, byAcm),
    };
  });
}

function filterRows(list, { school, building, floor, type, status, assignee, q }) {
  const term = q?.trim().toLowerCase();
  return list.filter((r) => (!school || r.schoolId === school) && (!building || r.buildingId === building) && (!floor || r.floorId === floor)
    && (!type || r.type === type) && (!assignee || r.assignedToId === assignee)
    && (!status || (status === 'open' ? r.status !== 'completed' : r.status === status))
    && (!term || [r.id, r.materialId, r.materialName, r.roomNumber, r.roomName, r.description, r.assignedToName, r.schoolName, r.inspectionId, r.sampleId, r.contractorName]
      .some((v) => String(v ?? '').toLowerCase().includes(term))));
}

const SORTS = {
  recent: (r) => r.lastActivity,
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
    workCategories: M.WORK_CATEGORIES, reasons: M.REASONS, outcomes: M.OUTCOMES,
    // Contractor companies (from personnel) and app users, offered for Contractor / Supervisor / Reviewed By
    contractors: [...new Set(getPeople().filter((p) => p.kind === 'Contractor' && p.status === 'active').map((p) => p.organization).filter(Boolean))].sort(),
    users: listUsers().filter((u) => u.status === 'active').map((u) => ({ name: u.name, role: u.jobTitle || u.roleId })).sort((x, y) => x.name.localeCompare(y.name)),
    nextId: S.nextActivityId(),
    assignees: assignees().map((p) => ({
      id: p.id, name: p.name, category: p.categoryLabel, organization: p.organization,
      training: { 'om-16': trainingCheck(p, 'Minor Repair'), awareness: trainingCheck(p, 'Cleaning (O&M)') },
    })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

// ?inspection= limits the list to that inspection's ACMs (new activities are created from an inspection)
router.get('/materials', (req, res) => {
  const place = placeLookup();
  const r = req.query.inspection ? getRecord(req.query.inspection) : null;
  const only = r ? new Set(inspectionAcms(r)) : null;
  res.json(getMaterials().filter((m) => (only ? only.has(m.id) : SURVEYED.includes(m.acmStatus))).map((m) => {
    const p = place(m);
    return { id: m.id, name: m.name, acmStatus: m.acmStatus, place: `${p.schoolName} / ${p.buildingName} / ${p.floorName} / ${p.roomNumber} ${p.roomName}`.trim() };
  }).sort((a, b) => a.place.localeCompare(b.place, 'en', { numeric: true })));
});

// Inspections that can be attached to an activity: those of the ACM's school, the ACM's own first, newest first
router.get('/inspections', (req, res) => {
  const m = getMaterial(req.query.material);
  if (!m) return res.json([]);
  const list = getRecords().filter((r) => r.schoolId === m.schoolId && r.state !== 'draft')
    .sort((x, y) => Number(y.materialId === m.id) - Number(x.materialId === m.id) || String(y.date ?? '').localeCompare(String(x.date ?? '')));
  res.json(list.slice(0, 200).map((r) => ({ id: r.id, type: r.type, date: r.date ?? null, sameAcm: r.materialId === m.id || (r.extra ?? []).some((x) => x.materialId === m.id) })));
});

// --- Activities ---

// GET /api/om/activities?school=&building=&floor=&type=&status=(pending|inProgress|completed|overdue|open)&assignee=&q=&sort=&dir=&page=&pageSize=
router.get('/activities', (req, res) => {
  const all = rows();
  const filtered = filterRows(all, req.query);
  // Default: most recent first, so a newly added (or just updated) task is at the top
  const key = SORTS[req.query.sort] ? req.query.sort : 'recent';
  const d = (req.query.dir ?? (['recent', 'dueDate', 'completedAt'].includes(key) ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
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
  const header = ['Activity ID', 'Inspection ID', 'Sample ID', 'Activity Type', 'Work Category', 'Description', 'School', 'Building', 'Floor', 'Room', 'ACM ID', 'ACM Material', 'Priority', 'Due Date', 'Assigned To', 'Contractor', 'Status', 'Completed'];
  const lines = list.map((r) => [r.id, r.inspectionId ?? '', r.sampleId ?? '', r.type, r.workCategory ?? '', r.description, r.schoolName, r.buildingName, r.floorName, `${r.roomNumber} ${r.roomName}`.trim(),
    r.materialId, r.materialName, r.priority, r.dueDate, r.assignedToName, r.contractorName ?? '', r.statusLabel, r.completedAt?.slice(0, 10) ?? '']);
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
    // fromInspection: created from the inspection's O&M tasks, so the inspection link is fixed
    activity: { ...a, status, statusLabel: M.STATUS_LABELS[status], fromInspection: Boolean(a.inspectionId && getRecord(a.inspectionId)?.actionItems?.some((x) => x.omActivityId === a.id)) },
    material: m ? { id: m.id, name: m.name, materialType: m.materialType, acmStatus: m.acmStatus, friability: m.friability, condition: m.condition, quantity: m.quantity, unit: m.unit, location: m.location } : null,
    location: { schoolId: a.schoolId, buildingId: a.buildingId, floorId: a.floorId, roomId: a.roomId, ...placeLookup()(a) },
    assigneeTraining: person ? { ...trainingCheck(person, a.type), name: person.name, category: person.categoryLabel } : null,
    plan: plan ? { id: plan.id, name: plan.name, version: plan.version, nextReview: plan.nextReview } : null,
    // The inspection and its sample of this ACM (the activity's own inspection, or the latest of the ACM)
    inspection: inspectionLinks(a, new Map(getRecords().map((r) => [r.id, r])), inspectionsByAcm()),
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
  // Activity details and the people involved (all optional; older activities have none)
  const text = (k, max) => String(pick(k, '') ?? '').trim().slice(0, max);
  Object.assign(a, {
    workCategory: text('workCategory', 60), activityDate: text('activityDate', 10), reason: text('reason', 60), disturbance: text('disturbance', 3),
    contractorName: text('contractorName', 120), supervisor: text('supervisor', 80), trainingVerified: text('trainingVerified', 3),
  });
  if (a.workCategory && !M.WORK_CATEGORIES.includes(a.workCategory)) errors.workCategory = 'Choose a work category';
  if (a.reason && !M.REASONS.includes(a.reason)) errors.reason = 'Choose the reason';
  if (a.activityDate && !validDay(a.activityDate)) errors.activityDate = 'Enter a valid date';
  for (const k of ['disturbance', 'trainingVerified']) if (a[k] && !M.YES_NO.includes(a[k])) errors[k] = 'Choose Yes or No';
  // The inspection this work belongs to: kept when the activity was created from one; otherwise any inspection of
  // the ACM's school can be attached
  const fromInspection = existing?.inspectionId && getRecord(existing.inspectionId)?.actionItems?.some((x) => x.omActivityId === existing.id);
  const inspectionId = fromInspection ? existing.inspectionId : text('inspectionId', 40) || null;
  if (inspectionId && !fromInspection) {
    const r = getRecord(inspectionId);
    if (!r) errors.inspectionId = 'Inspection not found';
    else if (material && r.schoolId !== material.schoolId) errors.inspectionId = 'Choose an inspection of the same school';
  }
  a.inspectionId = inspectionId;

  if (!M.TYPE_VALUES.includes(a.type)) errors.type = 'Choose the activity type';
  if (!a.description) errors.description = 'Describe the work';
  if (!M.PRIORITIES.includes(a.priority)) errors.priority = 'Choose a priority';
  if (!validDay(a.dueDate)) errors.dueDate = 'Choose the due date';
  if (!person) errors.assignedToId = 'Assign someone responsible';
  if (!M.STATES.includes(a.state)) errors.state = 'Invalid status';

  const w = body.work !== undefined ? body.work : existing?.work;
  if (w) {
    const s = (v, max) => String(v ?? '').trim().slice(0, max);
    a.work = {
      performedOn: String(w.performedOn ?? ''), hours: w.hours === '' || w.hours == null ? null : Number(w.hours),
      notes: s(w.notes, 1000),
      controls: Object.fromEntries(M.CONTROLS.map((c) => [c.key, Boolean(w.controls?.[c.key])])),
      // Completion & documentation
      startTime: s(w.startTime, 5), endTime: s(w.endTime, 5), outcome: s(w.outcome, 30), followUpRequired: s(w.followUpRequired, 3),
      followUpNotes: s(w.followUpNotes, 500), wasteDetails: s(w.wasteDetails, 500), reviewedBy: s(w.reviewedBy, 80),
    };
    if (a.work.performedOn && !validDay(a.work.performedOn)) errors['work.performedOn'] = 'Enter a valid date';
    else if (a.work.performedOn > todayIso()) errors['work.performedOn'] = 'Can’t be in the future';
    if (a.work.hours != null && (!Number.isFinite(a.work.hours) || a.work.hours < 0 || a.work.hours > 200)) errors['work.hours'] = 'Enter hours between 0 and 200';
    const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const k of ['startTime', 'endTime']) if (a.work[k] && !TIME.test(a.work[k])) errors[`work.${k}`] = 'Enter a valid time';
    if (a.work.startTime && a.work.endTime && !errors['work.endTime'] && a.work.endTime <= a.work.startTime) errors['work.endTime'] = 'End time must be after the start time';
    if (a.work.outcome && !M.OUTCOMES.includes(a.work.outcome)) errors['work.outcome'] = 'Choose the outcome';
    if (a.work.followUpRequired && !M.YES_NO.includes(a.work.followUpRequired)) errors['work.followUpRequired'] = 'Choose Yes or No';
    if (a.work.followUpRequired === 'Yes' && !a.work.followUpNotes) errors['work.followUpNotes'] = 'Describe the follow-up needed';
  }
  if (a.state === 'completed') {
    if (!a.work?.performedOn) errors['work.performedOn'] = 'Completion date is required';
    if (!a.work?.notes) errors['work.notes'] = 'Describe the work performed';
    if (!a.work?.outcome) errors['work.outcome'] = 'Choose the work outcome';
    if (!a.work?.followUpRequired) errors['work.followUpRequired'] = 'Say whether follow-up is required';
  }
  return { a, person, errors };
}

// The ACMs an inspection covers (its own and any extra ones)
const inspectionAcms = (r) => [r.materialId, ...(r.extra ?? []).map((x) => x.materialId)].filter(Boolean);

/**
 * New O&M activities are created from an inspection (its O&M Tasks): the inspection must be submitted, the ACM one
 * of the inspection's, and the activity becomes one of the inspection's O&M tasks (action items) so its stage follows.
 */
router.post('/activities', async (req, res, next) => {
  try {
    const { a, person, errors } = validate({ ...req.body, state: req.body?.state === 'inProgress' ? 'inProgress' : 'pending' });
    const r = a.inspectionId ? getRecord(a.inspectionId) : null;
    if (!a.inspectionId) errors.inspectionId = 'O&M activities are created from an inspection';
    else if (r && r.state !== 'submitted' && r.state !== 'approved') errors.inspectionId = 'O&M tasks can be added once the inspection has been submitted';
    else if (r && a.materialId && !inspectionAcms(r).includes(a.materialId)) errors.materialId = 'Choose one of the inspection’s ACMs';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const now = new Date().toISOString();
    const created = await S.add('activities', {
      id: S.nextActivityId(), ...a, work: null, completedAt: null, completedBy: null, attachments: [],
      history: [{ at: now, by: currentUser().name, action: `Created from inspection ${r.id}` }, { at: now, by: currentUser().name, action: `Assigned to ${person.name}` }],
      createdAt: now, createdBy: { id: currentUser().id, name: currentUser().name }, sample: false,
    });
    // One of the inspection's O&M tasks
    const items = [...(r.actionItems ?? [])];
    const n = items.reduce((m, x) => Math.max(m, Number(String(x.id).split('-')[1]) || 0), 0);
    items.push({
      id: `AI-${n + 1}`, action: `${created.type}: ${created.description}`, assignedTo: 'O&M – Maintenance', assignee: person.name,
      priority: created.priority === 'Urgent' ? 'Critical' : created.priority, dueDate: created.dueDate, status: 'Pending', omActivityId: created.id, materialId: created.materialId,
    });
    const updated = await updateRecord(r.id, { actionItems: items });
    await syncInspectionStages(updated);
    logAudit(req, {
      action: 'create', module: MODULE, recordId: created.id, link: link(created), summary: `Created ${created.type.toLowerCase()} ${created.id} from inspection ${r.id}`,
      changes: [{ field: 'Type', to: created.type }, { field: 'Inspection', to: r.id }, { field: 'Assigned To', to: person.name }, { field: 'Due Date', to: created.dueDate }],
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
    track('Inspection', existing.inspectionId ?? null, a.inspectionId);
    track('Work Category', existing.workCategory || null, a.workCategory || null);
    track('Activity Date', existing.activityDate || null, a.activityDate || null);
    track('Reason', existing.reason || null, a.reason || null);
    track('Disturbance to ACM', existing.disturbance || null, a.disturbance || null);
    track('Contractor', existing.contractorName || null, a.contractorName || null);
    track('Supervisor', existing.supervisor || null, a.supervisor || null);
    track('Training Verified', existing.trainingVerified || null, a.trainingVerified || null);
    track('Status', M.STATUS_LABELS[existing.state], M.STATUS_LABELS[a.state]);
    if (existing.assignedToId !== a.assignedToId) events.push({ at: now, by: currentUser().name, action: `Assigned to ${person.name}` });
    if (existing.state !== a.state) events.push({ at: now, by: currentUser().name, action: a.state === 'completed' ? 'Completed' : `Status → ${M.STATUS_LABELS[a.state]}` });
    if (!events.length && changes.length) events.push({ at: now, by: currentUser().name, action: 'Updated details' });
    const patch = {
      ...a,
      completedAt: a.state === 'completed' ? now : null,
      completedBy: a.state === 'completed' ? currentUser().name : null,
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
    await syncInspection(updated);
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
    await syncInspection(a, { removed: true });
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
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: currentUser().id, name: currentUser().name } });
    await S.update('activities', a.id, { attachments: [...a.attachments, file], history: [...a.history, { at: new Date().toISOString(), by: currentUser().name, action: `Attached ${file.name}` }] });
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
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: currentUser().id, name: currentUser().name } });
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
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: currentUser().id, name: currentUser().name } });
    const sop = await S.add('procedures', {
      id: S.nextSopId(), title: String(title).trim().slice(0, 120), category, description: String(description ?? '').trim().slice(0, 300),
      version: String(version ?? '1.0').trim().slice(0, 20) || '1.0', effectiveDate: effectiveDate || todayIso(), file,
      createdAt: new Date().toISOString(), createdBy: { id: currentUser().id, name: currentUser().name }, sample: false,
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
    const file = await storeUpload(S.FILE_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: currentUser().id, name: currentUser().name } });
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
