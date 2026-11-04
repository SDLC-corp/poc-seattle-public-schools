import express, { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, getMaterial, updateMaterial, allRooms } from '../data/roomsStore.js';
import { getPeople } from '../data/personnelStore.js';
import {
  getRecords, getRecord, addRecord, updateRecord, removeRecord, addAttachment, removeAttachment, filePath, FILE_DIR, nextId,
} from '../data/inspectionRecordsStore.js';
import * as M from '../data/inspectionMeta.js';
import { MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import { listUsers } from './users.js';
import { logAudit, diff, CURRENT_USER } from '../data/auditStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';

const router = Router();

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_CHARS = 300_000;
const MODULE = 'Inspections';
// Workflow state labels (the form); list status labels come from M.STATUSES
const STATUS_LABEL = { scheduled: 'Scheduled', draft: 'In Progress', submitted: 'Pending Review', approved: 'Approved', returned: 'Returned for Changes' };
const OPEN_STATES = ['scheduled', 'draft', 'returned'];

// Looked up live so schools added in the app are found
const schoolName = { get: (id) => schools.find((s) => s.id === id)?.name };
const buildingName = new Map(buildings.map((b) => [b.id, b.name]));
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const link = (r) => `/inspections/records/${r.id}`;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const validDay = (v) => ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`));
// Scheduled start time, 24-hour "HH:MM"
const validTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

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

// Inspectors (AHERA-accredited) do the inspection; EHS managers (Designated Persons) review it
const certificationOf = (userId) => {
  const person = getPeople().find((p) => p.userId === userId);
  const rec = person?.records.filter((r) => r.programId === 'inspector').sort((a, b) => b.completedOn.localeCompare(a.completedOn))[0];
  return rec ? { name: 'AHERA Building Inspector', number: rec.certificateNo, expiresOn: rec.expiresOn } : null;
};
const inspectors = () => listUsers().filter((u) => u.roleId === 'inspector' && u.status === 'active')
  .map((u) => ({ id: u.id, name: u.name, title: u.jobTitle, certification: certificationOf(u.id) })).sort((a, b) => a.name.localeCompare(b.name));
const reviewers = () => listUsers().filter((u) => u.roleId === 'ehs-manager' && u.status === 'active')
  .map((u) => ({ id: u.id, name: u.name, title: u.jobTitle })).sort((a, b) => a.name.localeCompare(b.name));

const conditionOf = (r) => r.assessment?.currentCondition ?? null;
const openActions = (r) => (r.actionItems ?? []).filter((a) => a.status !== 'Completed').length;
const addYears = (iso, n) => (iso ? `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}` : '');
// "Nichols, Dave"
const lastFirst = (name) => {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts.at(-1)}, ${parts.slice(0, -1).join(' ')}` : name;
};
// Completed inspections are due again in three years; open ones are due on their scheduled date
const nextDueOf = (r) => (r.state === 'approved' ? addYears(r.date, M.REINSPECTION_YEARS) : r.scheduledDate ?? r.date ?? '');

function rows() {
  const place = placeLookup();
  const mats = new Map(getMaterials().map((m) => [m.id, m]));
  const today = todayIso();
  return getRecords().map((r) => {
    const m = mats.get(r.materialId);
    const status = M.statusOf(r);
    return {
      id: r.id, type: r.type, date: r.date ?? null, scheduledDate: r.scheduledDate ?? null, scheduledTime: r.scheduledTime ?? null, shownDate: r.date || r.scheduledDate || '',
      nextDue: nextDueOf(r), state: r.state, statusLabel: STATUS_LABEL[r.state], status, statusText: M.STATUSES[status],
      // Not started by its scheduled date
      overdue: r.state === 'scheduled' && Boolean(r.scheduledDate) && r.scheduledDate < today,
      inspectorId: r.inspectorId ?? null, assignedTo: lastFirst(r.inspectorName),
      materialId: r.materialId, materialName: m?.name ?? '(deleted material)', materialType: m?.materialType ?? '', acmStatus: m?.acmStatus ?? '',
      schoolId: r.schoolId, buildingId: r.buildingId, floorId: r.floorId, roomId: r.roomId, ...place(r),
      homogeneousAreaId: r.homogeneousAreaId, inspectorName: r.inspectorName, condition: conditionOf(r),
      conditionChange: r.assessment?.conditionChange ?? null, priority: r.risk?.priority ?? null,
      recommendedAction: r.risk?.recommendedAction ?? null, sampleResult: r.sampling?.required === 'Yes' ? r.sampling.result : null,
      openActions: openActions(r), reviewerName: r.verification?.reviewerName ?? null,
    };
  });
}

function filterRows(list, { school, building, floor, type, state, status, condition, priority, inspector, q }) {
  const term = q?.trim().toLowerCase();
  return list.filter((r) => (!school || r.schoolId === school) && (!building || r.buildingId === building) && (!floor || r.floorId === floor)
    && (!type || r.type === type) && (!state || r.state === state) && (!status || r.status === status)
    && (!condition || r.condition === condition) && (!priority || r.priority === priority) && (!inspector || r.inspectorId === inspector)
    && (!term || [r.id, r.materialId, r.materialName, r.roomNumber, r.roomName, r.inspectorName, r.homogeneousAreaId, r.schoolName]
      .some((v) => String(v ?? '').toLowerCase().includes(term))));
}

const SORTS = {
  id: (r) => r.id, date: (r) => r.shownDate, nextDue: (r) => r.nextDue, type: (r) => r.type, material: (r) => r.materialName,
  facility: (r) => `${r.schoolName} ${r.buildingName}`, assignedTo: (r) => r.assignedTo ?? '',
  condition: (r) => M.CONDITION_RANK[r.condition] ?? -1, priority: (r) => M.PRIORITIES.indexOf(r.priority),
  status: (r) => Object.keys(M.STATUSES).indexOf(r.status),
};

router.get('/meta', (req, res) => res.json({
  district: M.DISTRICT, types: M.TYPES, conditions: M.CONDITIONS, damageTypes: M.DAMAGE_TYPES, damageExtents: M.DAMAGE_EXTENTS,
  levels: M.LEVELS, priorities: M.PRIORITIES, severities: M.SEVERITIES, recommendedActions: M.RECOMMENDED_ACTIONS,
  sampleResults: M.SAMPLE_RESULTS, actionStatuses: M.ACTION_STATUSES, teams: M.TEAMS, docCategories: M.DOC_CATEGORIES,
  checklist: M.CHECKLIST, statusLabels: STATUS_LABEL, statuses: M.STATUSES, nextId: nextId(), inspectors: inspectors(), reviewers: reviewers(),
}));

// Every material can be inspected (including suspect / not yet assessed ones). Includes when it was last
// inspected (approved), when the 3-year reinspection is due, and whether an inspection is already open.
router.get('/materials', (req, res) => {
  const place = placeLookup();
  const last = new Map();
  const open = new Map();
  for (const r of getRecords()) {
    if (r.state === 'approved' && (!last.has(r.materialId) || r.date > last.get(r.materialId))) last.set(r.materialId, r.date);
    if (OPEN_STATES.includes(r.state) || r.state === 'submitted') open.set(r.materialId, { id: r.id, type: r.type, state: r.state });
  }
  res.json(getMaterials().map((m) => {
    const p = place(m);
    // Never inspected in the app: the inventory assessment date starts the 3-year clock
    const lastInspected = last.get(m.id) ?? null;
    const base = lastInspected ?? m.assessmentDate ?? null;
    return {
      id: m.id, name: m.name, materialType: m.materialType, acmStatus: m.acmStatus, condition: m.condition,
      schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId, ...p,
      place: `${p.schoolName} / ${p.buildingName} / ${p.floorName} / ${p.roomNumber} ${p.roomName}`.trim(),
      lastInspected, reinspectionDue: base ? addYears(base, M.REINSPECTION_YEARS) : null, openInspection: open.get(m.id) ?? null,
    };
  }).sort((a, b) => a.place.localeCompare(b.place, 'en', { numeric: true })));
});

function materialContext(materialId, excludeId = null) {
  const m = getMaterial(materialId);
  if (!m) return null;
  const history = getRecords().filter((r) => r.materialId === m.id && r.id !== excludeId && !OPEN_STATES.includes(r.state))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({ id: r.id, date: r.date, type: r.type, condition: conditionOf(r), inspectorName: r.inspectorName, state: r.state }));
  const lastApproved = history.find((h) => h.state === 'approved');
  return {
    material: {
      id: m.id, name: m.name, materialType: m.materialType, acmStatus: m.acmStatus, friability: m.friability, classification: m.classification,
      quantity: m.quantity, unit: m.unit, location: m.location, condition: m.condition, riskRanking: m.riskRanking, assessmentDate: m.assessmentDate,
    },
    location: { schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId, ...placeLookup()(m) },
    // "Previous condition" = last approved inspection, else what the inventory says
    previousCondition: lastApproved?.condition ?? (M.CONDITIONS.includes(m.condition) ? m.condition : null),
    history,
  };
}

router.get('/material/:materialId', (req, res) => {
  const ctx = materialContext(req.params.materialId);
  if (!ctx) return res.status(404).json({ error: 'Material not found' });
  res.json(ctx);
});

// GET /api/inspection-records?school=&building=&floor=&type=&state=&condition=&priority=&q=&sort=&dir=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterRows(rows(), req.query);
  const key = SORTS[req.query.sort] ? req.query.sort : 'date';
  const d = (req.query.dir ?? (key === 'date' ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
  const get = SORTS[key];
  const sorted = [...filtered].sort((a, b) => {
    const x = get(a); const y = get(b);
    return d * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) || b.id.localeCompare(a.id);
  });
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  // Tiles show the full status breakdown for the other filters
  const scoped = req.query.status ? filterRows(rows(), { ...req.query, status: '' }) : filtered;
  const c = (st) => scoped.filter((r) => r.status === st).length;
  res.json({
    total: sorted.length, page, pageSize, pages, sort: key, dir: d === 1 ? 'asc' : 'desc',
    stats: {
      total: scoped.length, completed: c('completed'), inProgress: c('inProgress'), pendingReview: c('pendingReview'),
      actionRequired: c('actionRequired'), scheduled: c('scheduled'), overdue: scoped.filter((r) => r.overdue).length,
      returned: scoped.filter((r) => r.state === 'returned').length,
    },
    records: sorted.slice((page - 1) * pageSize, page * pageSize),
  });
});

router.get('/export.csv', (req, res) => {
  const list = filterRows(rows(), req.query).sort((a, b) => b.shownDate.localeCompare(a.shownDate));
  logAudit(req, { action: 'export', module: MODULE, recordId: 'inspection-records.csv', summary: `Exported ${list.length} inspection records to CSV` });
  const header = ['Inspection ID', 'Type', 'Inspection Date', 'Scheduled Date', 'Next Due', 'School', 'Building', 'Floor', 'Room', 'Homogeneous Area', 'ACM ID', 'Material',
    'Assigned To', 'Condition', 'Condition Change', 'Priority', 'Recommended Action', 'Sample Result', 'Open Action Items', 'Status', 'Reviewer'];
  const lines = list.map((r) => [r.id, r.type, r.date, r.scheduledDate, r.nextDue, r.schoolName, r.buildingName, r.floorName, `${r.roomNumber} ${r.roomName}`.trim(), r.homogeneousAreaId,
    r.materialId, r.materialName, r.inspectorName, r.condition, r.conditionChange, r.priority, r.recommendedAction, r.sampleResult, r.openActions, r.statusText, r.reviewerName]);
  res.type('text/csv').attachment('inspection-records.csv').send([header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n'));
});

router.get('/records/:id', (req, res) => {
  const r = getRecord(req.params.id);
  if (!r) return res.status(404).json({ error: 'Inspection record not found' });
  const status = M.statusOf(r);
  res.json({ record: { ...r, statusLabel: STATUS_LABEL[r.state], status, statusText: M.STATUSES[status] }, ...materialContext(r.materialId, r.id) });
});

/**
 * Builds a record from the form. Drafts need only the ACM; submitting needs every required field, the
 * checklist, consistent answers, sampling details when sampling is required, and the inspector's signature.
 */
function validate(body, existing) {
  const errors = {};
  const submit = body.state === 'submitted';
  const pick = (k, d) => (body[k] !== undefined ? body[k] : existing?.[k] ?? d);
  const obj = (k) => ({ ...(existing?.[k] ?? {}), ...(body[k] ?? {}) });
  const oneOf = (v, list) => v === '' || v == null || list.includes(v);

  const material = getMaterial(pick('materialId', ''));
  if (!material) errors.materialId = 'Choose the ACM being inspected';
  const inspector = inspectors().find((u) => u.id === pick('inspectorId', ''));
  const a = obj('assessment');
  const cl = obj('checklist');
  const s = obj('sampling');
  const rk = obj('risk');
  const v = obj('verification');

  const r = {
    type: pick('type', ''), date: String(pick('date', '') ?? ''),
    materialId: material?.id ?? null, schoolId: material?.schoolId, buildingId: material?.buildingId, floorId: material?.floorId, roomId: material?.roomId,
    locationDescription: String(pick('locationDescription', '') ?? '').trim().slice(0, 160),
    homogeneousAreaId: String(pick('homogeneousAreaId', '') ?? '').trim().toUpperCase().slice(0, 20),
    inspectorId: inspector?.id ?? null, inspectorName: inspector?.name ?? null, certification: inspector?.certification ?? null,
    assessment: {
      currentCondition: a.currentCondition ?? '', previousCondition: a.previousCondition ?? null,
      conditionChange: M.conditionChange(a.previousCondition, a.currentCondition),
      damageType: a.damageType ?? '', damageExtent: a.damageExtent ?? '', waterDamage: a.waterDamage ?? '',
      potentialDisturbance: a.potentialDisturbance ?? '', labelled: a.labelled ?? '', managementPlanUpdated: a.managementPlanUpdated ?? '',
    },
    checklist: Object.fromEntries(M.CHECKLIST.map((q) => [q.key, cl[q.key] ?? ''])),
    sampling: s.required === 'Yes'
      ? {
        required: 'Yes', sampleId: String(s.sampleId ?? '').trim().toUpperCase().slice(0, 30), collectionDate: String(s.collectionDate ?? ''),
        sampleLocation: String(s.sampleLocation ?? '').trim().slice(0, 120), laboratory: String(s.laboratory ?? '').trim().slice(0, 120), result: s.result ?? 'Pending',
      }
      : { required: s.required === 'No' ? 'No' : '' },
    risk: {
      priority: rk.priority ?? '', damageSeverity: rk.damageSeverity ?? '', recommendedAction: rk.recommendedAction ?? '',
      immediateAttention: rk.immediateAttention ?? '', followUpRequired: rk.followUpRequired ?? '', targetDate: String(rk.targetDate ?? ''),
    },
    comments: String(pick('comments', '') ?? '').trim().slice(0, 2000),
    actionItems: [],
    verification: {
      ...(existing?.verification ?? {}),
      inspectorSignature: typeof v.inspectorSignature === 'string' ? v.inspectorSignature : null,
      completionDate: String(v.completionDate ?? ''),
    },
    state: submit ? 'submitted' : 'draft',
  };

  // Option lists
  if (!oneOf(r.type, M.TYPES)) errors.type = 'Choose an inspection type';
  if (!oneOf(r.assessment.currentCondition, M.CONDITIONS)) errors['assessment.currentCondition'] = 'Choose a condition';
  if (r.assessment.previousCondition && !M.CONDITIONS.includes(r.assessment.previousCondition)) r.assessment.previousCondition = null;
  const lists = {
    damageType: M.DAMAGE_TYPES, damageExtent: M.DAMAGE_EXTENTS, waterDamage: ['Yes', 'No'], potentialDisturbance: M.LEVELS,
    labelled: ['Yes', 'No', 'N/A'], managementPlanUpdated: ['Yes', 'No'],
  };
  for (const [k, list] of Object.entries(lists)) if (!oneOf(r.assessment[k], list)) errors[`assessment.${k}`] = 'Invalid choice';
  for (const q of M.CHECKLIST) if (!oneOf(r.checklist[q.key], q.answers)) errors[`checklist.${q.key}`] = 'Invalid answer';
  const riskLists = { priority: M.PRIORITIES, damageSeverity: M.SEVERITIES, recommendedAction: M.RECOMMENDED_ACTIONS, immediateAttention: ['Yes', 'No'], followUpRequired: ['Yes', 'No'] };
  for (const [k, list] of Object.entries(riskLists)) if (!oneOf(r.risk[k], list)) errors[`risk.${k}`] = 'Invalid choice';
  if (r.sampling.required === 'Yes' && !M.SAMPLE_RESULTS.includes(r.sampling.result)) errors['sampling.result'] = 'Invalid result';

  // Dates
  const today = todayIso();
  if (r.date && !validDay(r.date)) errors.date = 'Enter a valid date';
  else if (r.date > today) errors.date = 'Inspection date can’t be in the future';
  if (r.risk.targetDate && !validDay(r.risk.targetDate)) errors['risk.targetDate'] = 'Enter a valid date';
  else if (r.risk.targetDate && r.date && r.risk.targetDate < r.date) errors['risk.targetDate'] = 'Must be on or after the inspection date';
  if (r.sampling.collectionDate && !validDay(r.sampling.collectionDate)) errors['sampling.collectionDate'] = 'Enter a valid date';
  if (r.verification.completionDate && !validDay(r.verification.completionDate)) errors['verification.completionDate'] = 'Enter a valid date';
  else if (r.verification.completionDate && r.date && r.verification.completionDate < r.date) errors['verification.completionDate'] = 'Can’t be before the inspection date';

  const sig = r.verification.inspectorSignature;
  if (sig && sig !== 'on-file' && (!PNG_URL.test(sig) || sig.length > MAX_SIGNATURE_CHARS)) errors['verification.inspectorSignature'] = 'Signature could not be read; clear it and sign again';

  const items = pick('actionItems', []);
  if (!Array.isArray(items) || items.length > 20) errors.actionItems = 'Up to 20 action items';
  else {
    r.actionItems = items.map((x, i) => ({
      id: /^AI-\d{1,3}$/.test(x?.id) ? x.id : `AI-${i + 1}`, action: String(x?.action ?? '').trim().slice(0, 200), assignedTo: x?.assignedTo ?? '',
      priority: x?.priority ?? 'Medium', dueDate: String(x?.dueDate ?? ''), status: x?.status ?? 'Pending',
    }));
    r.actionItems.forEach((x, i) => {
      if (!x.action) errors[`actionItems.${i}.action`] = 'Describe the action';
      if (!M.TEAMS.includes(x.assignedTo)) errors[`actionItems.${i}.assignedTo`] = 'Choose who is responsible';
      if (!M.PRIORITIES.includes(x.priority)) errors[`actionItems.${i}.priority`] = 'Invalid priority';
      if (!M.ACTION_STATUSES.includes(x.status)) errors[`actionItems.${i}.status`] = 'Invalid status';
      if (x.dueDate && !validDay(x.dueDate)) errors[`actionItems.${i}.dueDate`] = 'Invalid date';
      else if (submit && !x.dueDate) errors[`actionItems.${i}.dueDate`] = 'Due date required';
    });
  }

  if (submit) {
    const need = (cond, key, msg) => { if (cond && !errors[key]) errors[key] = msg; };
    need(!r.type, 'type', 'Choose an inspection type');
    need(!r.date, 'date', 'Inspection date is required');
    need(!inspector, 'inspectorId', 'Choose the accredited inspector');
    need(!r.locationDescription, 'locationDescription', 'Describe where the material is');
    need(!r.homogeneousAreaId, 'homogeneousAreaId', 'Homogeneous area ID is required');
    for (const k of ['currentCondition', ...Object.keys(lists)]) need(!r.assessment[k], `assessment.${k}`, 'Required');
    for (const q of M.CHECKLIST) need(!r.checklist[q.key], `checklist.${q.key}`, 'Answer this question');
    need(!r.sampling.required, 'sampling.required', 'Is a sample required?');
    if (r.sampling.required === 'Yes') {
      need(!r.sampling.sampleId, 'sampling.sampleId', 'Sample ID is required');
      need(!r.sampling.collectionDate, 'sampling.collectionDate', 'Collection date is required');
      need(!r.sampling.sampleLocation, 'sampling.sampleLocation', 'Sample location is required');
      need(!r.sampling.laboratory, 'sampling.laboratory', 'Laboratory is required');
    }
    for (const k of Object.keys(riskLists)) need(!r.risk[k], `risk.${k}`, 'Required');
    need(r.risk.followUpRequired === 'Yes' && !r.risk.targetDate, 'risk.targetDate', 'Target date is required when follow-up is needed');
    need(!sig, 'verification.inspectorSignature', 'The inspector must sign the inspection');
    need(!r.verification.completionDate, 'verification.completionDate', 'Completion date is required');
    // Answers that contradict each other make the record unreliable for AHERA
    const dmg = r.assessment.currentCondition && r.assessment.currentCondition !== 'Good';
    need(r.checklist.damaged === 'Yes' && !dmg, 'checklist.damaged', 'The condition is “Good” but the material is marked damaged');
    need(r.checklist.damaged === 'No' && dmg, 'checklist.damaged', `The condition is “${r.assessment.currentCondition}” but the material is marked not damaged`);
    need(r.checklist.waterDamage !== r.assessment.waterDamage && r.checklist.waterDamage && r.assessment.waterDamage, 'checklist.waterDamage', 'Doesn’t match “Water Damage” in the condition assessment');
    need(r.checklist.immediateAction === 'Yes' && r.risk.immediateAttention === 'No', 'risk.immediateAttention', 'The checklist says immediate action is required');
    need((r.risk.followUpRequired === 'Yes' || r.checklist.immediateAction === 'Yes') && !r.actionItems.length, 'actionItems', 'Add at least one action item for the follow-up');
  }
  return { r, material, errors };
}

const auditView = (x) => ({
  Type: x.type || '—', Date: x.date || '—', Inspector: x.inspectorName || '—', 'Homogeneous Area': x.homogeneousAreaId || '—',
  Condition: x.assessment?.currentCondition || '—', 'Condition Change': x.assessment?.conditionChange || '—', Priority: x.risk?.priority || '—',
  'Recommended Action': x.risk?.recommendedAction || '—', 'Sample Required': x.sampling?.required || '—', 'Sample Result': x.sampling?.result || '—',
  'Action Items': String(x.actionItems?.length ?? 0), Status: STATUS_LABEL[x.state],
});

router.post('/', async (req, res, next) => {
  try {
    const { r, material, errors } = validate(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    r.verification = { ...r.verification, reviewStatus: r.state === 'submitted' ? 'Pending Review' : 'Not Submitted' };
    const created = await addRecord({ ...r, attachments: [], createdAt: new Date().toISOString(), createdBy: { id: CURRENT_USER.id, name: CURRENT_USER.name }, sample: false });
    logAudit(req, {
      action: 'create', module: MODULE, recordId: created.id, link: link(created),
      summary: `${created.state === 'submitted' ? 'Submitted' : 'Saved draft'} ${created.type || 'inspection'} of ${material.name}`,
      changes: Object.entries(auditView(created)).map(([field, to]) => ({ field, to })),
    });
    res.status(201).json({ record: { ...created, statusLabel: STATUS_LABEL[created.state] } });
  } catch (err) {
    next(err);
  }
});

// Inspector edits: only while it's a draft or has been returned
router.put('/records/:id', async (req, res, next) => {
  try {
    const existing = getRecord(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inspection record not found' });
    if (existing.state === 'submitted' || existing.state === 'approved') {
      return res.status(409).json({ error: existing.state === 'approved' ? 'Approved inspections are locked' : 'This inspection is waiting for review' });
    }
    const { r, material, errors } = validate(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    if (r.state === 'submitted') r.verification = { ...r.verification, reviewStatus: 'Pending Review' };
    const before = auditView(existing);
    const updated = await updateRecord(existing.id, r);
    const changes = diff(before, auditView(updated));
    logAudit(req, {
      action: 'update', module: MODULE, recordId: updated.id, link: link(updated),
      summary: r.state === 'submitted' ? `Submitted ${updated.type} of ${material.name} for review` : `Updated draft inspection of ${material.name}`,
      changes,
    });
    res.json({ record: { ...updated, statusLabel: STATUS_LABEL[updated.state] } });
  } catch (err) {
    next(err);
  }
});

// Reviewer decision: { decision: 'approve' | 'return', reviewerId, signature, comments }
router.post('/records/:id/review', async (req, res, next) => {
  try {
    const existing = getRecord(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inspection record not found' });
    if (existing.state !== 'submitted') return res.status(409).json({ error: 'Only inspections waiting for review can be reviewed' });
    const { decision, reviewerId, signature, comments } = req.body ?? {};
    const errors = {};
    const reviewer = reviewers().find((u) => u.id === reviewerId);
    if (!['approve', 'return'].includes(decision)) errors.decision = 'Approve or return the inspection';
    if (!reviewer) errors['verification.reviewerId'] = 'Choose the reviewer';
    if (decision === 'approve' && (typeof signature !== 'string' || !PNG_URL.test(signature) || signature.length > MAX_SIGNATURE_CHARS)) {
      errors['verification.reviewerSignature'] = 'The reviewer must sign to approve';
    }
    const note = String(comments ?? '').trim().slice(0, 500);
    if (decision === 'return' && !note) errors['verification.reviewComments'] = 'Tell the inspector what to change';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });

    const approve = decision === 'approve';
    const updated = await updateRecord(existing.id, {
      state: approve ? 'approved' : 'returned',
      verification: {
        ...existing.verification, reviewerId: reviewer.id, reviewerName: reviewer.name, reviewerSignature: approve ? signature : null,
        reviewStatus: approve ? 'Approved' : 'Returned for Changes', reviewComments: note, approvalDate: approve ? todayIso() : '',
      },
    });
    logAudit(req, {
      action: 'update', module: MODULE, recordId: updated.id, link: link(updated),
      summary: `${approve ? 'Approved' : 'Returned'} inspection ${updated.id}${approve ? '' : ' for changes'}`,
      changes: [{ field: 'Review Status', from: 'Pending Review', to: approve ? 'Approved' : 'Returned for Changes' }, ...(note ? [{ field: 'Review Comments', to: note }] : [])],
    });

    // An approved inspection is the authoritative condition for the ACM inventory
    let conditionChange = null;
    const material = getMaterial(updated.materialId);
    const cond = updated.assessment.currentCondition;
    if (approve && material && cond && material.condition !== cond) {
      conditionChange = { from: material.condition, to: cond };
      await updateMaterial(material.id, { condition: cond });
      logAudit(req, {
        action: 'update', module: 'ACM Inventory', recordId: material.id,
        link: `/schools/${material.schoolId}/buildings/${material.buildingId}/floors/${material.floorId}?room=${material.roomId}`,
        summary: `Condition of ${material.name} updated from approved inspection ${updated.id}`, changes: [{ field: 'Condition', from: conditionChange.from, to: cond }],
      });
    }
    res.json({ record: { ...updated, statusLabel: STATUS_LABEL[updated.state] }, conditionChange });
  } catch (err) {
    next(err);
  }
});

// Action item status can be updated at any stage (it's follow-up work, not part of the signed record)
router.patch('/records/:id/actions/:actionId', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    const item = r?.actionItems.find((x) => x.id === req.params.actionId);
    if (!item) return res.status(404).json({ error: 'Action item not found' });
    if (!M.ACTION_STATUSES.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid status' });
    const from = item.status;
    const updated = await updateRecord(r.id, { actionItems: r.actionItems.map((x) => (x.id === item.id ? { ...x, status: req.body.status } : x)) });
    logAudit(req, { action: 'update', module: MODULE, recordId: r.id, link: link(r), summary: `Action “${item.action}” set to ${req.body.status}`, changes: [{ field: 'Action Status', from, to: req.body.status }] });
    res.json({ record: { ...updated, statusLabel: STATUS_LABEL[updated.state] } });
  } catch (err) {
    next(err);
  }
});

router.delete('/records/:id', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    if (r.state !== 'draft' && r.state !== 'scheduled') return res.status(409).json({ error: 'Only drafts and unstarted assignments can be deleted' });
    await removeRecord(r.id);
    logAudit(req, {
      action: 'delete', module: MODULE, recordId: r.id,
      summary: r.state === 'scheduled' ? `Cancelled inspection assignment ${r.id}` : `Deleted draft inspection ${r.id}`,
      changes: Object.entries(auditView(r)).map(([field, from]) => ({ field, from })),
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Photos & documents: raw body (PNG / JPEG / WebP / PDF, max 10 MB) with ?name=&category=
router.post('/records/:id/attachments', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    if (r.state === 'approved') return res.status(409).json({ error: 'Approved inspections are locked' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF file' });
    if (r.attachments.length >= 30) return res.status(409).json({ error: 'At most 30 files per inspection' });
    const category = M.DOC_CATEGORIES.includes(req.query.category) ? req.query.category : type.ext === 'pdf' ? 'Supporting Document' : 'Material Condition Photo';
    const file = await storeUpload(FILE_DIR, req.body, type, { name: req.query.name, category, uploadedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name } });
    await addAttachment(r.id, file);
    logAudit(req, { action: 'create', module: MODULE, recordId: r.id, link: link(r), summary: `Attached ${category.toLowerCase()} to inspection ${r.id}`, changes: [{ field: category, to: file.name }] });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/records/:id/attachments/:fileId', (req, res) => {
  const f = getRecord(req.params.id)?.attachments.find((x) => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  sendStored(res, f, filePath(f.storedName), req.query.download === '1');
});

router.delete('/records/:id/attachments/:fileId', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    const f = r?.attachments.find((x) => x.id === req.params.fileId);
    if (!f) return res.status(404).json({ error: 'File not found' });
    if (r.state === 'approved') return res.status(409).json({ error: 'Approved inspections are locked' });
    await removeAttachment(r.id, f.id);
    logAudit(req, { action: 'delete', module: MODULE, recordId: r.id, link: link(r), summary: `Removed ${f.name} from inspection ${r.id}`, changes: [{ field: f.category, from: f.name, to: '(deleted)' }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Assignment & scheduling ---

/**
 * POST /assign { materialIds[], type, inspectorId, scheduledDate, notes }
 * Creates one scheduled inspection per material. Materials that already have an open inspection of the
 * same type are skipped (and reported) so nobody is assigned the same work twice.
 */
router.post('/assign', async (req, res, next) => {
  try {
    const { materialIds, type, inspectorId, scheduledDate, scheduledTime, notes } = req.body ?? {};
    const errors = {};
    const ids = Array.isArray(materialIds) ? [...new Set(materialIds)] : [];
    if (!ids.length) errors.materialIds = 'Choose at least one ACM to inspect';
    else if (ids.length > 200) errors.materialIds = 'Assign at most 200 materials at a time';
    const mats = ids.map((id) => getMaterial(id));
    if (mats.some((m) => !m)) errors.materialIds = 'Some materials no longer exist; refresh and try again';
    if (!M.TYPES.includes(type)) errors.type = 'Choose an inspection type';
    const inspector = inspectors().find((u) => u.id === inspectorId);
    if (!inspector) errors.inspectorId = 'Choose the accredited inspector';
    if (!validDay(scheduledDate)) errors.scheduledDate = 'Choose the scheduled date';
    else if (scheduledDate < todayIso()) errors.scheduledDate = 'The scheduled date can’t be in the past';
    if (!validTime(scheduledTime)) errors.scheduledTime = 'Choose the time of the inspection';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });

    const open = new Set(getRecords().filter((r) => r.type === type && ['scheduled', 'draft', 'returned', 'submitted'].includes(r.state)).map((r) => r.materialId));
    const created = [];
    const skipped = [];
    const note = String(notes ?? '').trim().slice(0, 500);
    for (const m of mats) {
      if (open.has(m.id)) { skipped.push(m.id); continue; }
      const rec = await addRecord({
        type, date: null, scheduledDate, scheduledTime, materialId: m.id, schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
        locationDescription: '', homogeneousAreaId: '', inspectorId: inspector.id, inspectorName: inspector.name, certification: inspector.certification,
        assessment: {}, checklist: {}, sampling: {}, risk: {}, comments: '', actionItems: [],
        verification: { reviewStatus: 'Not Submitted' },
        assignment: { assignedBy: { id: CURRENT_USER.id, name: CURRENT_USER.name }, assignedAt: new Date().toISOString(), notes: note },
        state: 'scheduled', attachments: [], createdAt: new Date().toISOString(), createdBy: { id: CURRENT_USER.id, name: CURRENT_USER.name }, sample: false,
      });
      created.push(rec.id);
    }
    if (created.length) {
      logAudit(req, {
        action: 'create', module: MODULE, recordId: created.length === 1 ? created[0] : `${created[0]}…${created.at(-1)}`,
        link: created.length === 1 ? `/inspections/records/${created[0]}` : '/inspections',
        summary: `Assigned ${created.length} ${type.toLowerCase()}${created.length > 1 ? 's' : ''} to ${inspector.name} for ${scheduledDate} ${scheduledTime}`,
        changes: [{ field: 'Type', to: type }, { field: 'Assigned To', to: inspector.name }, { field: 'Scheduled Date', to: scheduledDate }, { field: 'Scheduled Time', to: scheduledTime }, { field: 'Inspections', to: String(created.length) }],
      });
    }
    res.status(201).json({ created, skipped });
  } catch (err) {
    next(err);
  }
});

// POST /reassign { ids[], inspectorId?, scheduledDate?, scheduledTime? } — open inspections only (not yet submitted)
router.post('/reassign', async (req, res, next) => {
  try {
    const { ids, inspectorId, scheduledDate, scheduledTime } = req.body ?? {};
    const errors = {};
    const list = (Array.isArray(ids) ? ids : []).map((id) => getRecord(id)).filter(Boolean);
    if (!list.length) errors.ids = 'Select the inspections to change';
    const inspector = inspectorId ? inspectors().find((u) => u.id === inspectorId) : null;
    if (inspectorId && !inspector) errors.inspectorId = 'Choose an accredited inspector';
    if (scheduledDate && !validDay(scheduledDate)) errors.scheduledDate = 'Enter a valid date';
    else if (scheduledDate && scheduledDate < todayIso()) errors.scheduledDate = 'The scheduled date can’t be in the past';
    if (scheduledTime && !validTime(scheduledTime)) errors.scheduledTime = 'Enter a valid time';
    if (!inspector && !scheduledDate && !scheduledTime) errors.inspectorId = 'Choose a new inspector, date or time';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const changed = [];
    const locked = [];
    for (const r of list) {
      if (!OPEN_STATES.includes(r.state)) { locked.push(r.id); continue; }
      const before = { 'Assigned To': r.inspectorName ?? '—', 'Scheduled Date': r.scheduledDate ?? '—', 'Scheduled Time': r.scheduledTime ?? '—' };
      await updateRecord(r.id, {
        ...(inspector ? { inspectorId: inspector.id, inspectorName: inspector.name, certification: inspector.certification } : {}),
        ...(scheduledDate ? { scheduledDate } : {}),
        ...(scheduledTime ? { scheduledTime } : {}),
      });
      logAudit(req, {
        action: 'update', module: MODULE, recordId: r.id, link: link(r), summary: `Reassigned inspection ${r.id}`,
        changes: diff(before, {
          'Assigned To': inspector?.name ?? before['Assigned To'], 'Scheduled Date': scheduledDate ?? before['Scheduled Date'], 'Scheduled Time': scheduledTime ?? before['Scheduled Time'],
        }),
      });
      changed.push(r.id);
    }
    res.json({ changed, locked });
  } catch (err) {
    next(err);
  }
});

// GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — inspections on their inspection date (or scheduled date)
router.get('/calendar', (req, res) => {
  const { from, to } = req.query;
  if (!validDay(from) || !validDay(to)) return res.status(400).json({ error: 'from and to dates are required' });
  const items = filterRows(rows(), req.query).filter((r) => r.shownDate >= from && r.shownDate <= to)
    .map(({ id, type, shownDate, status, statusText, overdue, schoolName, buildingName, roomNumber, roomName, materialName, assignedTo }) => ({
      id, type, date: shownDate, status, statusText, overdue, schoolName, buildingName, roomNumber, roomName, materialName, assignedTo,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  res.json({ items });
});

// What is due per ACM: an open inspection is due on its scheduled date; with none open, the 3-year
// reinspection is due from the last approved inspection (or the inventory assessment date)
const DUE_REASONS = { notStarted: 'Not started', inProgress: 'In progress', returned: 'Returned for changes', reinspection: '3-year reinspection due' };
const reasonOf = (state) => (state === 'scheduled' ? 'notStarted' : state === 'draft' ? 'inProgress' : 'returned');
const dayDiff = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

function dueItems() {
  const place = placeLookup();
  const recs = rows();
  const busy = new Set(recs.filter((r) => OPEN_STATES.includes(r.state) || r.state === 'submitted').map((r) => r.materialId));
  const last = new Map();
  for (const r of recs) if (r.state === 'approved' && (!last.has(r.materialId) || r.date > last.get(r.materialId))) last.set(r.materialId, r.date);
  const open = recs.filter((r) => OPEN_STATES.includes(r.state) && r.scheduledDate).map((r) => ({
    key: r.id, inspectionId: r.id, type: r.type, dueDate: r.scheduledDate, dueTime: r.scheduledTime, reason: reasonOf(r.state), assignedTo: r.assignedTo,
    lastInspected: last.get(r.materialId) ?? null, materialId: r.materialId, materialName: r.materialName,
    schoolId: r.schoolId, buildingId: r.buildingId, floorId: r.floorId, roomId: r.roomId,
    schoolName: r.schoolName, buildingName: r.buildingName, floorName: r.floorName, roomNumber: r.roomNumber, roomName: r.roomName,
  }));
  const reinspections = getMaterials().filter((m) => !busy.has(m.id)).flatMap((m) => {
    const base = last.get(m.id) ?? m.assessmentDate;
    if (!base) return [];
    return [{
      key: `re-${m.id}`, inspectionId: null, type: '3-Year Reinspection', dueDate: addYears(base, M.REINSPECTION_YEARS), reason: 'reinspection',
      assignedTo: null, lastInspected: last.get(m.id) ?? null, materialId: m.id, materialName: m.name,
      schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId, ...place(m),
    }];
  });
  return [...open, ...reinspections];
}

// GET /due?view=upcoming|overdue&within=90&school=&building=&floor=&type=&reason=&q=&page=&pageSize=
router.get('/due', (req, res) => {
  const { view, school, building, floor, type, reason } = req.query;
  const overdue = view === 'overdue';
  const today = todayIso();
  const within = Math.min(3650, Math.max(1, Number(req.query.within) || 90));
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + within);
  const untilIso = until.toISOString().slice(0, 10);
  const term = req.query.q?.trim().toLowerCase();
  const inView = dueItems()
    .filter((x) => (overdue ? x.dueDate < today : x.dueDate >= today && x.dueDate <= untilIso))
    .filter((x) => (!school || x.schoolId === school) && (!building || x.buildingId === building) && (!floor || x.floorId === floor) && (!type || x.type === type))
    .filter((x) => !term || [x.inspectionId, x.materialId, x.materialName, x.roomNumber, x.roomName, x.assignedTo, x.schoolName]
      .some((v) => String(v ?? '').toLowerCase().includes(term)))
    .map((x) => ({ ...x, reasonText: DUE_REASONS[x.reason], days: dayDiff(today, x.dueDate) }));
  // Ascending days: longest overdue first / soonest upcoming first
  const list = (reason ? inView.filter((x) => x.reason === reason) : inView)
    .sort((a, b) => a.days - b.days || a.key.localeCompare(b.key));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  const c = (r) => inView.filter((x) => x.reason === r).length;
  res.json({
    total: list.length, page, pageSize, pages, within,
    stats: {
      total: inView.length, notStarted: c('notStarted'), inProgress: c('inProgress'), returned: c('returned'), reinspection: c('reinspection'),
      // Upcoming: how many fall in the next 7 days; overdue: how many are more than 30 days late
      soon: inView.filter((x) => (overdue ? x.days < -30 : x.days <= 7)).length,
    },
    items: list.slice((page - 1) * pageSize, page * pageSize),
  });
});

// GET /assignments?inspector= — an inspector's open work, oldest first
router.get('/assignments', (req, res) => {
  const mine = rows().filter((r) => r.inspectorId === req.query.inspector);
  const open = mine.filter((r) => OPEN_STATES.includes(r.state))
    .sort((a, b) => (a.state === 'returned' ? -1 : 0) - (b.state === 'returned' ? -1 : 0) || a.shownDate.localeCompare(b.shownDate));
  const thirty = new Date();
  thirty.setDate(thirty.getDate() - 30);
  const since = `${thirty.getFullYear()}-${String(thirty.getMonth() + 1).padStart(2, '0')}-${String(thirty.getDate()).padStart(2, '0')}`;
  res.json({
    stats: {
      scheduled: open.filter((r) => r.state === 'scheduled').length, inProgress: open.filter((r) => r.state === 'draft').length,
      returned: open.filter((r) => r.state === 'returned').length, overdue: open.filter((r) => r.overdue).length,
      pendingReview: mine.filter((r) => r.state === 'submitted').length,
      completed30: mine.filter((r) => r.state === 'approved' && (r.date ?? '') >= since).length,
    },
    items: open,
  });
});

// GET /findings — action items from submitted/approved inspections
router.get('/findings', (req, res) => {
  const { status, q } = req.query;
  const term = q?.trim().toLowerCase();
  const today = todayIso();
  const recs = new Map(getRecords().map((r) => [r.id, r]));
  const items = filterRows(rows(), { ...req.query, status: '' }).filter((r) => r.state === 'submitted' || r.state === 'approved')
    .flatMap((r) => (recs.get(r.id).actionItems ?? []).map((x) => ({
      ...x, inspectionId: r.id, inspectionType: r.type, inspectionDate: r.date, condition: r.condition, recommendedAction: r.recommendedAction,
      materialName: r.materialName, schoolName: r.schoolName, buildingName: r.buildingName, roomNumber: r.roomNumber, roomName: r.roomName,
      overdue: x.status !== 'Completed' && Boolean(x.dueDate) && x.dueDate < today,
    })))
    .filter((x) => !term || [x.action, x.inspectionId, x.materialName, x.assignedTo, x.schoolName, x.roomNumber].some((v) => String(v ?? '').toLowerCase().includes(term)));
  const list = (status ? items.filter((x) => (status === 'overdue' ? x.overdue : x.status === status)) : items)
    .sort((a, b) => (a.status === 'Completed') - (b.status === 'Completed') || M.PRIORITIES.indexOf(b.priority) - M.PRIORITIES.indexOf(a.priority) || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  const c = (st) => items.filter((x) => x.status === st).length;
  res.json({
    total: list.length, page, pageSize, pages,
    stats: { total: items.length, pending: c('Pending'), inProgress: c('In Progress'), completed: c('Completed'), overdue: items.filter((x) => x.overdue).length },
    items: list.slice((page - 1) * pageSize, page * pageSize),
  });
});

export default router;
