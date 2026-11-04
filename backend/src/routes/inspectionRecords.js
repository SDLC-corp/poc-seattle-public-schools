import express, { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, getMaterial, updateMaterial, allRooms } from '../data/roomsStore.js';
import { getPeople } from '../data/personnelStore.js';
import {
  getRecords, getRecord, addRecord, updateRecord, removeRecord, addAttachment, removeAttachment, filePath, FILE_DIR, nextId,
} from '../data/inspectionRecordsStore.js';
import * as M from '../data/inspectionMeta.js';
import { lifecycleOf, timelineOf, autoStageOf, MANUAL_STAGES, syncInspectionStages, latestReview } from '../data/inspectionLifecycle.js';
import * as OM from '../data/omStore.js';
import { SAMPLE_TYPES as AIR_TYPES, METHODS as AIR_METHODS, limitFor } from '../data/airStore.js';
import { notify } from '../data/notificationsStore.js';
import * as OMM from '../data/omMeta.js';
import { MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import { listUsers } from './users.js';
import { logAudit, diff, currentUser } from '../data/auditStore.js';
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
      materialId: r.materialId, acmCount: M.acmsOf(r).length, extraMaterialIds: (r.extra ?? []).map((x) => x.materialId),
      materialName: `${m?.name ?? '(deleted material)'}${r.extra?.length ? ` +${r.extra.length} more` : ''}`, materialType: m?.materialType ?? '', acmStatus: m?.acmStatus ?? '',
      schoolId: r.schoolId, buildingId: r.buildingId, floorId: r.floorId, roomId: r.roomId, ...place(r),
      homogeneousAreaId: r.homogeneousAreaId, inspectorName: r.inspectorName, condition: conditionOf(r),
      conditionChange: r.assessment?.conditionChange ?? null, priority: r.risk?.priority ?? null,
      recommendedAction: r.risk?.recommendedAction ?? null, sampleResult: r.sampling?.required === 'Yes' ? r.sampling.result : null,
      openActions: openActions(r), reviewerName: r.verification?.reviewerName ?? null, approvedOn: r.verification?.approvalDate || null,
      parentId: r.parentId ?? null, // a follow-up inspection carried out under another one
    };
  });
}

function filterRows(list, { school, building, floor, type, state, status, condition, priority, inspector, q }) {
  const term = q?.trim().toLowerCase();
  return list.filter((r) => (!school || r.schoolId === school) && (!building || r.buildingId === building) && (!floor || r.floorId === floor)
    && (!type || r.type === type) && (!state || r.state === state) && (!status || r.status === status)
    && (!condition || r.condition === condition) && (!priority || r.priority === priority) && (!inspector || r.inspectorId === inspector)
    && (!term || [r.id, r.materialId, ...r.extraMaterialIds, r.materialName, r.roomNumber, r.roomName, r.inspectorName, r.homogeneousAreaId, r.schoolName]
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
  sampleResults: M.SAMPLE_RESULTS, laboratories: M.LABORATORIES, testMethods: M.TEST_METHODS, sampleTypes: M.SAMPLE_TYPES, asbestosTypes: M.ASBESTOS_TYPES,
  // Air samples: Air Monitoring's sample kinds and the limits results are judged against
  air: { types: AIR_TYPES, results: M.AIR_RESULTS, limits: Object.fromEntries(AIR_TYPES.flatMap((t) => Object.keys(AIR_METHODS).map((m) => [`${t}|${m}`, limitFor(t, m)]))) },
  // For O&M tasks created from an inspection
  om: { types: OMM.TYPE_VALUES, priorities: OMM.PRIORITIES, assignees: omAssignees().map((p) => ({ id: p.id, name: p.name, category: p.categoryLabel })) },
  actionStatuses: M.ACTION_STATUSES, teams: M.TEAMS, docCategories: M.DOC_CATEGORIES,
  checklist: M.CHECKLIST, statusLabels: STATUS_LABEL, statuses: M.STATUSES, nextId: nextId(), inspectors: inspectors(), reviewers: reviewers(),
}));

// Every material can be inspected (including suspect / not yet assessed ones). Includes when it was last
// inspected (approved), when the 3-year reinspection is due, and whether an inspection is already open.
router.get('/materials', (req, res) => {
  const place = placeLookup();
  const last = new Map();
  const open = new Map();
  for (const r of getRecords()) {
    for (const { materialId } of M.acmsOf(r)) {
      if (r.state === 'approved' && (!last.has(materialId) || r.date > last.get(materialId))) last.set(materialId, r.date);
      if (OPEN_STATES.includes(r.state) || r.state === 'submitted') open.set(materialId, { id: r.id, type: r.type, state: r.state });
    }
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
  // Earlier inspections that covered this ACM (as the first ACM or one of several), with its condition in each
  const history = getRecords().filter((r) => r.id !== excludeId && !OPEN_STATES.includes(r.state) && M.acmsOf(r).some((x) => x.materialId === m.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({
      id: r.id, date: r.date, type: r.type, condition: conditionOf(M.acmsOf(r).find((x) => x.materialId === m.id)), inspectorName: r.inspectorName, state: r.state,
    }));
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
  const withStatus = (x) => { const st = M.statusOf(x); return { ...x, statusLabel: STATUS_LABEL[x.state], status: st, statusText: M.STATUSES[st] }; };
  const parent = r.parentId ? getRecord(r.parentId) : null;
  res.json({
    record: withStatus(r),
    lifecycle: lifecycleOf(r),
    timeline: timelineOf(r),
    // Follow-up inspections scheduled under this one (shown in its tabs), or the inspection this one follows up
    followUps: getRecords().filter((x) => x.parentId === r.id).map(withStatus),
    parent: parent ? { id: parent.id, type: parent.type, state: parent.state, stage: lifecycleOf(parent).current, stageLabel: M.STAGE_LABEL[lifecycleOf(parent).current] } : null,
    ...materialContext(r.materialId, r.id),
  });
});

/**
 * POST /records/:id/stage { stage, note } — set the stage by hand (Laboratory Analysis, Corrective Action,
 * Follow-up Verification or Closed) with a reason; stage 'auto' goes back to the automatic stage. The manual
 * stage holds until the inspection's facts move the automatic stage on.
 */
router.post('/records/:id/stage', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    const { stage } = req.body ?? {};
    const note = String(req.body?.note ?? '').trim().slice(0, 500);
    const errors = {};
    if (r.state !== 'submitted' && r.state !== 'approved') errors.stage = 'The stage can be changed once the inspection has been submitted';
    else if (stage !== 'auto' && !MANUAL_STAGES.includes(stage)) errors.stage = 'Choose a stage';
    else if (stage === 'closed' && r.state !== 'approved') errors.stage = 'Only an approved inspection can be closed';
    if (stage !== 'auto' && !note) errors.note = 'Give a reason for the change';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });

    const before = lifecycleOf(r).current;
    const auto = autoStageOf(r);
    const by = { id: currentUser().id, name: currentUser().name };
    const override = stage === 'auto' || stage === auto ? null : { stage, basis: auto, note, by, at: new Date().toISOString() };
    const updated = await updateRecord(r.id, { stageOverride: override });
    const after = lifecycleOf(updated).current;
    logAudit(req, {
      action: 'update', module: MODULE, recordId: r.id, link: link(r),
      summary: `Stage of inspection ${r.id} ${override ? 'changed' : 'set back to automatic'}`,
      changes: [{ field: 'Stage', from: M.STAGE_LABEL[before], to: M.STAGE_LABEL[after] }, ...(note ? [{ field: 'Reason', to: note }] : [])],
    });
    await syncStages(r);
    res.json({ record: { ...getRecord(r.id), statusLabel: STATUS_LABEL[updated.state] } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /records/:id/stage-documents?name=&category= — reports or photos for the inspection's current stage
 * (e.g. a lab report, a work completion report, after-work photos), sent from the Change Stage dialog.
 * Unlike the form's uploads these are allowed after approval; the file records the stage it belongs to.
 */
router.post('/records/:id/stage-documents', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    if (r.state !== 'submitted' && r.state !== 'approved') return res.status(409).json({ error: 'Stage documents can be added once the inspection has been submitted' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF file' });
    if (r.attachments.length >= 30) return res.status(409).json({ error: 'At most 30 files per inspection' });
    const category = M.DOC_CATEGORIES.includes(req.query.category) ? req.query.category : type.ext === 'pdf' ? 'Supporting Document' : 'After Work Photo';
    // &stage= files it under that stage (e.g. a lab report under Laboratory Analysis); &material= ties it to one
    // of the inspection's ACMs
    const stage = M.STAGE_LABEL[req.query.stage] ? req.query.stage : lifecycleOf(r).current;
    const acm = req.query.material ? M.acmsOf(r).find((a) => a.materialId === req.query.material) : null;
    if (req.query.material && !acm) return res.status(400).json({ error: 'That ACM is not part of this inspection' });
    const file = await storeUpload(FILE_DIR, req.body, type, {
      name: req.query.name, category, stage, ...(acm ? { materialId: acm.materialId } : {}), uploadedBy: { id: currentUser().id, name: currentUser().name },
    });
    await addAttachment(r.id, file);
    logAudit(req, {
      action: 'create', module: MODULE, recordId: r.id, link: link(r),
      summary: `Attached ${category.toLowerCase()} to inspection ${r.id} (${M.STAGE_LABEL[stage]})`, changes: [{ field: category, to: file.name }],
    });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /records/:id/stage-review/request { note, fileIds } — send the current stage (its work done) to a
 * reviewer. The inspection stays in the stage until the review is decided.
 */
router.post('/records/:id/stage-review/request', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    const life = lifecycleOf(r);
    if (life.gate !== 'readyForReview' && life.gate !== 'returned') {
      return res.status(409).json({ error: life.gate === 'awaitingReview' ? 'This stage is already waiting for review' : 'The current stage is not ready for review yet' });
    }
    // Laboratory Analysis with no O&M work: ask the reviewer to close the inspection, or to schedule a follow-up
    // inspection (a child of this one) — approving the review does it
    const outcome = req.body?.outcome ?? null;
    const errors = {};
    if (outcome && !['close', 'followUp'].includes(outcome)) errors.outcome = 'Choose what should happen next';
    else if (outcome && life.current !== 'lab') errors.outcome = 'Closure or a follow-up can be requested from Laboratory Analysis';
    else if (outcome === 'close' && (r.actionItems ?? []).some((a) => a.status !== 'Completed')) errors.outcome = 'The inspection has open action items – it can’t be closed yet';
    else if (outcome === 'close' && r.state !== 'submitted') errors.outcome = 'Only an inspection waiting for its final review can be closed this way';
    else if (outcome === 'close' && M.acmsOf(r).some((a) => a.risk?.followUpRequired === 'Yes')) errors.outcome = 'The inspector marked a follow-up as required – request a follow-up inspection instead';
    if (outcome === 'followUp') Object.assign(errors, followUpPlanErrors(req.body?.followUp));
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const plan = outcome === 'followUp' ? req.body.followUp : null;
    const planInspector = plan && inspectors().find((u) => u.id === plan.inspectorId);

    const me = currentUser();
    const fileIds = (Array.isArray(req.body?.fileIds) ? req.body.fileIds : []).filter((fid) => r.attachments.some((f) => f.id === fid));
    const review = {
      id: `RV-${(r.stageReviews?.length ?? 0) + 1}`, stage: life.current, status: 'pending', requestedAt: new Date().toISOString(),
      requestedBy: { id: me.id, name: me.name }, note: String(req.body?.note ?? '').trim().slice(0, 1000), requestFileIds: fileIds,
      ...(outcome ? { outcome } : {}),
      ...(plan ? {
        followUpPlan: {
          inspectorId: planInspector.id, inspectorName: planInspector.name, scheduledDate: plan.scheduledDate, scheduledTime: plan.scheduledTime,
          notes: String(plan.notes ?? '').trim().slice(0, 500),
        },
      } : {}),
    };
    const updated = await updateRecord(r.id, { stageReviews: [...(r.stageReviews ?? []), review] });
    logAudit(req, {
      action: 'update', module: MODULE, recordId: r.id, link: link(r), summary: `Sent stage ${M.STAGE_LABEL[review.stage]} of inspection ${r.id} for review`,
      changes: [
        { field: 'Stage Review', to: 'Pending' }, ...(review.note ? [{ field: 'Note', to: review.note }] : []),
        ...(outcome ? [{ field: 'Requested', to: outcome === 'close' ? 'Close the inspection' : `Follow-up inspection with ${planInspector.name} on ${plan.scheduledDate} ${plan.scheduledTime}` }] : []),
      ],
    });
    notify({
      type: 'inspection', priority: 'medium', title: 'Inspection stage waiting for review',
      message: `${M.STAGE_LABEL[review.stage]} of inspection ${r.id} is ready for review.`,
      description: `${me.name} sent the ${M.STAGE_LABEL[review.stage]} stage of inspection ${r.id} for review${review.note ? `: ${review.note}` : '.'}`
        + (outcome === 'close' ? ' They ask for the inspection to be closed – approving closes it.'
          : outcome === 'followUp' ? ` They ask for a follow-up inspection (${planInspector.name}, ${plan.scheduledDate} ${plan.scheduledTime}) – approving schedules it.`
            : ' Approve it to move the inspection on, or return it for rework.'),
      schoolId: r.schoolId, schoolName: placeLookup()(r).schoolName, link: link(r), linkLabel: 'Review the stage',
    });
    await syncStages(updated);
    res.json({ record: { ...getRecord(r.id), statusLabel: STATUS_LABEL[updated.state] } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /records/:id/stage-review/decide { decision: 'approve' | 'return', reviewerId, comments, fileIds } —
 * the reviewer confirms the stage (the inspection moves to the next one) or returns it for rework (comments
 * required). Files (uploaded with stage-documents) are kept with the decision.
 */
const SAMPLE_FIELD_LABEL = { sampleId: 'Sample ID', collectionDate: 'Collection Date', laboratory: 'Laboratory', testMethod: 'What to Test', notes: 'Notes' };

router.post('/records/:id/stage-review/decide', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    const life = lifecycleOf(r);
    const pending = life.gate === 'awaitingReview' ? latestReview(r, life.current) : null;
    if (!pending) return res.status(409).json({ error: 'No stage is waiting for review' });
    const { decision, reviewerId, signature } = req.body ?? {};
    const comments = String(req.body?.comments ?? '').trim().slice(0, 1000);
    const reviewDate = String(req.body?.reviewDate || todayIso());
    const reviewer = reviewers().find((u) => u.id === reviewerId);
    const approve = decision === 'approve';
    const errors = {};
    if (!['approve', 'return'].includes(decision)) errors.decision = 'Approve or return the stage';
    if (!reviewer) errors.reviewerId = 'Choose the reviewer';
    if (decision === 'return' && !comments) errors.comments = 'Tell them what needs to be done';
    if (!validDay(reviewDate)) errors.reviewDate = 'Enter a valid date';
    else if (reviewDate > todayIso()) errors.reviewDate = 'The review date can’t be in the future';
    if (approve && (typeof signature !== 'string' || !PNG_URL.test(signature) || signature.length > MAX_SIGNATURE_CHARS)) errors.signature = 'The reviewer must sign to approve';
    // Laboratory Analysis: each sample's result is confirmed one by one
    const samples = M.acmsOf(r).filter((a) => a.sampling?.required === 'Yes');
    const confirmed = (Array.isArray(req.body?.confirmedSamples) ? req.body.confirmedSamples : []).filter((id) => samples.some((a) => a.materialId === id));
    if (approve && pending.stage === 'lab' && confirmed.length < samples.length) errors.confirmedSamples = 'Confirm every sample result before approving';
    // Corrective Action: the reviewer can add open tasks (action items) — that sends the stage back for the work
    const newTasks = Array.isArray(req.body?.newTasks) ? req.body.newTasks.slice(0, 20) : [];
    if (newTasks.length && pending.stage !== 'action') errors.newTasks = 'Tasks can only be added when reviewing Corrective Action';
    if (newTasks.length && approve) errors.newTasks = 'New open tasks mean the stage isn’t finished – return it instead';
    newTasks.forEach((t, i) => {
      if (!String(t?.action ?? '').trim()) errors[`newTasks.${i}.action`] = 'Describe the task';
      if (!M.TEAMS.includes(t?.assignedTo)) errors[`newTasks.${i}.assignedTo`] = 'Choose who is responsible';
      if (!M.PRIORITIES.includes(t?.priority)) errors[`newTasks.${i}.priority`] = 'Choose a priority';
      if (!validDay(t?.dueDate)) errors[`newTasks.${i}.dueDate`] = 'Choose the due date';
    });
    // Inspection Submitted / Laboratory Analysis: the reviewer can correct the sample details
    const sampleStage = pending.stage === 'submitted' || pending.stage === 'lab';
    const edits = sampleStage && Array.isArray(req.body?.sampleEdits) ? req.body.sampleEdits : [];
    edits.forEach((x, i) => {
      const a = samples.find((s) => s.materialId === x?.materialId);
      // Keyed by ACM — the form only sends the samples that changed
      const e = (k, msg) => { errors[`sampleEdits.${x?.materialId ?? i}.${k}`] = msg; };
      if (!a) { e('materialId', 'Not a sample on this inspection'); return; }
      const s = a.sampling;
      if (x.sampleId !== undefined && !String(x.sampleId).trim()) e('sampleId', 'Sample ID is required');
      if (x.collectionDate !== undefined && !validDay(x.collectionDate)) e('collectionDate', 'Enter a valid date');
      if (x.laboratory !== undefined && x.laboratory !== s.laboratory && !M.LABORATORIES.includes(x.laboratory)) e('laboratory', 'Choose a laboratory');
      const methods = M.SAMPLE_TYPES.find((t) => t.value === M.sampleTypeOf(s))?.testMethods ?? M.TEST_METHODS;
      if (x.testMethod !== undefined && x.testMethod !== s.testMethod && !methods.includes(x.testMethod)) e('testMethod', 'Choose a test that suits the sample type');
    });
    // Laboratory Analysis: O&M work the results call for, created when the stage is approved
    const omTasks = pending.stage === 'lab' && approve && Array.isArray(req.body?.omTasks) ? req.body.omTasks.slice(0, 20) : [];
    Object.assign(errors, omTaskErrors(r, omTasks, 'omTasks.'));
    // A closure / follow-up request (the reviewer can adjust the follow-up's inspector, date and time)
    const plan = approve && pending.outcome === 'followUp' ? { ...pending.followUpPlan, ...(req.body?.followUp ?? {}) } : null;
    if (plan) Object.assign(errors, followUpPlanErrors(plan));
    if (approve && pending.outcome && omTasks.length) errors.omTasks = 'O&M work means the inspection isn’t ready for closure or a follow-up – return the request instead';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const fileIds = (Array.isArray(req.body?.fileIds) ? req.body.fileIds : []).filter((fid) => r.attachments.some((f) => f.id === fid));

    let n = r.actionItems.reduce((m, a) => Math.max(m, Number(String(a.id).split('-')[1]) || 0), 0);
    const added = newTasks.map((t) => ({
      id: `AI-${++n}`, action: String(t.action).trim().slice(0, 200), assignedTo: t.assignedTo, priority: t.priority, dueDate: t.dueDate,
      status: 'Pending', addedByReview: pending.id,
    }));
    const reviews = r.stageReviews.map((x) => (x.id === pending.id ? {
      ...x, status: approve ? 'approved' : 'returned', reviewerId: reviewer.id, reviewerName: reviewer.name, comments, fileIds,
      reviewDate, signature: approve ? signature : typeof signature === 'string' && PNG_URL.test(signature) ? signature : null,
      ...(pending.stage === 'lab' ? { confirmedSamples: confirmed } : {}), ...(added.length ? { addedTasks: added.map((a) => a.id) } : {}),
      decidedAt: new Date().toISOString(),
    } : x));
    // Inspection Submitted: approving sends the samples to the laboratory; returning sends the inspection back
    // to the inspector for changes (as the form's "Return for Changes" does)
    const patch = { stageReviews: reviews, ...(added.length ? { actionItems: [...r.actionItems, ...added] } : {}) };
    // The reviewer's corrections to the sample details
    const editChanges = [];
    const applyEdits = (a) => {
      const x = edits.find((y) => y.materialId === a.materialId);
      if (!x) return a;
      const next = { ...a.sampling };
      for (const k of ['sampleId', 'collectionDate', 'laboratory', 'testMethod', 'notes']) {
        if (x[k] === undefined) continue;
        const v = k === 'sampleId' ? String(x[k]).trim().toUpperCase().slice(0, 30) : k === 'notes' ? String(x[k]).trim().slice(0, 1000) : String(x[k]);
        if (v !== (a.sampling[k] ?? '')) { editChanges.push({ field: `${a.sampling.sampleId || a.materialId} ${SAMPLE_FIELD_LABEL[k]}`, from: a.sampling[k] || '—', to: v || '—' }); next[k] = v; }
      }
      return { ...a, sampling: next };
    };
    const send = (a) => (pending.stage === 'submitted' && approve && a.sampling?.required === 'Yes' && a.sampling.result === 'Pending' && !a.sampling.sentToLabAt
      ? { ...a, sampling: { ...a.sampling, sentToLabAt: new Date().toISOString(), sentToLabBy: { id: reviewer.id, name: reviewer.name } } } : a);
    if (edits.length || (pending.stage === 'submitted' && approve)) {
      const [first, ...extra] = M.acmsOf(r).map(applyEdits).map(send);
      Object.assign(patch, { sampling: first.sampling, extra });
    }
    if (editChanges.length) {
      patch.stageReviews = patch.stageReviews.map((x) => (x.id === pending.id ? { ...x, sampleChanges: editChanges } : x));
    }
    if (pending.stage === 'submitted' && !approve) {
      Object.assign(patch, {
        state: 'returned',
        verification: { ...r.verification, reviewerId: reviewer.id, reviewerName: reviewer.name, reviewStatus: 'Returned for Changes', reviewComments: comments, approvalDate: '' },
      });
    }
    const updated = await updateRecord(r.id, patch);
    logAudit(req, {
      action: 'update', module: MODULE, recordId: r.id, link: link(r),
      summary: `Reviewed stage ${M.STAGE_LABEL[pending.stage]} of inspection ${r.id}: ${approve ? 'approved' : 'returned for rework'}`,
      changes: [
        { field: 'Stage Review', from: 'Pending', to: approve ? 'Approved' : 'Returned' }, { field: 'Reviewer', to: reviewer.name }, { field: 'Review Date', to: reviewDate },
        ...(comments ? [{ field: 'Comments', to: comments }] : []), ...added.map((a) => ({ field: 'Open Task Added', to: a.action })), ...editChanges,
      ],
    });
    // O&M work from the lab results: created now, so the inspection moves to Corrective Action / Remediation
    let final = updated;
    if (omTasks.length) {
      const { updated: withTasks, created } = await createOmTasks(req, updated, omTasks);
      final = await updateRecord(r.id, {
        stageReviews: withTasks.stageReviews.map((x) => (x.id === pending.id ? { ...x, omActivities: created.map((a) => a.id) } : x)),
      });
    }
    // Approved closure request — or an approved follow-up verification — gives the inspection its final approval,
    // so it closes; an approved follow-up request schedules the child follow-up inspection
    let child = null;
    if (approve && final.state === 'submitted' && (pending.outcome === 'close' || pending.stage === 'followUp')) {
      ({ updated: final } = await decideInspection(req, final, true, reviewer, signature, comments || (pending.outcome === 'close' ? 'Closed after the laboratory review' : 'Closed after the follow-up inspection')));
      // The reviewer closed it: no further stage reviews are held for it
      final = await updateRecord(r.id, { closure: { reviewId: pending.id, stage: pending.stage, at: new Date().toISOString(), by: { id: reviewer.id, name: reviewer.name } } });
    }
    if (plan) {
      child = await createFollowUp(req, final, plan);
      final = await updateRecord(r.id, { stageReviews: final.stageReviews.map((x) => (x.id === pending.id ? { ...x, childInspectionId: child.id } : x)) });
    }
    await syncStages(final, ...(child ? [child] : []));
    res.json({ record: { ...getRecord(r.id), statusLabel: STATUS_LABEL[final.state] } });
  } catch (err) {
    next(err);
  }
});

// The laboratory's analysis details kept with a sample's result
const LAB_DETAILS = {
  laboratory: 'Laboratory Name', labSampleId: 'Laboratory Sample ID', analysisMethod: 'Analysis Method', analysisStandard: 'Analysis Standard',
  analysisDate: 'Analysis Date', materialLayer: 'Material Layer', labReportNo: 'Lab Report No.',
};

/**
 * POST /records/:id/lab-results { results: [{ materialId, value, asbestosTypes, result, notes, ...LAB_DETAILS }] } — record or
 * update the laboratory results of the inspection's samples (once they've gone to the lab). Each sample type
 * has its measurement: air – fibre count (f/cc or s/mm²) against the Air Monitoring limit; bulk / soil –
 * asbestos content (%); dust – loading (s/cm²). The value sets the result and Pass / Fail against the type's
 * limit; empty = still pending; result 'Not Analyzed' for a sample the lab couldn't analyse. Results can be
 * changed until the Laboratory Analysis review approves them; then the stage moves on.
 */
router.post('/records/:id/lab-results', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    if (r.state !== 'submitted' && r.state !== 'approved') return res.status(409).json({ error: 'Lab results can be recorded once the inspection has been submitted' });
    if (r.reviewGates && (r.stageReviews ?? []).filter((x) => x.stage === 'lab').at(-1)?.status === 'approved') {
      return res.status(409).json({ error: 'The lab results were approved in the Laboratory Analysis review and can no longer be changed' });
    }
    const list = Array.isArray(req.body?.results) ? req.body.results : [];
    const errors = {};
    const acms = M.acmsOf(r);
    const empty = (v) => v === '' || v == null;
    // Air samples: the fibre count against the Air Monitoring limit
    const airResult = (acm, x) => {
      if (x.result === 'Not Analyzed') return { result: 'Not Analyzed', airValue: null };
      if (empty(x.value)) return { result: 'Pending', airValue: null };
      const v = Number(x.value);
      const limit = limitFor(acm.sampling.airType, M.airMethodOf(acm.sampling.testMethod));
      return {
        result: v > limit.value ? 'Exceeds Limit' : 'Below Limit', airValue: v, limit,
        passFail: v > limit.value ? 'Fail' : 'Pass', limitValue: limit.value, measureUnit: limit.unit,
      };
    };
    // Bulk / dust / soil: the measured content or loading against the type's limit (older records: a result only)
    const sampleResult = (acm, x) => {
      const cleared = { measuredValue: null, measureUnit: null, limitValue: null, passFail: null, asbestosTypes: [] };
      if (x.result === 'Not Analyzed') return { result: 'Not Analyzed', ...cleared };
      const m = M.measureOf(acm.sampling);
      if (empty(x.value) || !m) return { result: M.SAMPLE_RESULTS.includes(x.result) && empty(x.value) ? x.result : 'Pending', ...cleared };
      const v = Number(x.value);
      return {
        result: v > 0 ? 'Asbestos Detected' : 'No Asbestos Detected', measuredValue: v, measureUnit: m.unit, limitValue: m.limit,
        passFail: v > m.limit ? 'Fail' : 'Pass', asbestosTypes: v > 0 ? (x.asbestosTypes ?? []).filter((t) => M.ASBESTOS_TYPES.includes(t)) : [],
      };
    };
    list.forEach((x, i) => {
      const acm = acms.find((a) => a.materialId === x?.materialId);
      if (!acm || acm.sampling?.required !== 'Yes') { errors[`results.${i}`] = 'This ACM has no sample on the inspection'; return; }
      if (!empty(x.analysisDate)) {
        if (!validDay(x.analysisDate)) errors[`results.${i}.analysisDate`] = 'Enter a valid date';
        else if (x.analysisDate > new Date().toISOString().slice(0, 10)) errors[`results.${i}.analysisDate`] = 'The analysis date can’t be in the future';
      }
      if (r.reviewGates && !acm.sampling.sentToLabAt) { errors[`results.${i}`] = 'The sample hasn’t been sent to the laboratory yet – the inspection needs its review first'; return; }
      if (x.result === 'Not Analyzed') return;
      const m = M.sampleTypeOf(acm.sampling) === M.AIR_SAMPLE ? null : M.measureOf(acm.sampling);
      if (!empty(x.value) && (!Number.isFinite(Number(x.value)) || Number(x.value) < 0)) errors[`results.${i}.value`] = 'Enter a number of 0 or more';
      else if (m?.max != null && Number(x.value) > m.max) errors[`results.${i}.value`] = `Enter at most ${m.max}${m.unit}`;
      else if (m && Number(x.value) > 0 && !(x.asbestosTypes ?? []).some((t) => M.ASBESTOS_TYPES.includes(t))) errors[`results.${i}.asbestosTypes`] = 'Choose the asbestos type found';
      else if (!m && M.sampleTypeOf(acm.sampling) !== M.AIR_SAMPLE && empty(x.value) && !M.SAMPLE_RESULTS.includes(x.result)) errors[`results.${i}.result`] = 'Choose the result';
    });
    if (!list.length) errors.results = 'Enter at least one result';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });

    const now = new Date().toISOString();
    const by = { id: currentUser().id, name: currentUser().name };
    const changes = [];
    const exceeded = [];
    const apply = (acm) => {
      const x = list.find((y) => y.materialId === acm.materialId);
      if (!x) return acm;
      const note = String(x.notes ?? '').trim().slice(0, 1000);
      const isAir = M.sampleTypeOf(acm.sampling) === M.AIR_SAMPLE;
      const air = isAir ? airResult(acm, x) : null;
      const { limit, ...found } = air ?? sampleResult(acm, x);
      // The laboratory's details of the analysis (only the fields sent are changed; an empty lab name keeps the one
      // chosen when the sample was taken)
      const details = {};
      const detailChanges = [];
      for (const [k, label] of Object.entries(LAB_DETAILS)) {
        if (x[k] === undefined) continue;
        const v = String(x[k] ?? '').trim().slice(0, 120);
        if (k === 'laboratory' && !v) continue;
        if (v !== (acm.sampling[k] ?? '')) { details[k] = v; detailChanges.push({ field: `${acm.sampling.sampleId || acm.materialId} ${label}`, from: acm.sampling[k] || '—', to: v || '—' }); }
      }
      const sampling = { ...acm.sampling, ...found, ...details, resultNotes: note };
      const before = M.resultSummary(acm.sampling);
      const resultChanged = before !== M.resultSummary(sampling) || note !== (acm.sampling.resultNotes ?? '');
      if (!resultChanged && !detailChanges.length) return acm;
      changes.push(...detailChanges);
      if (!resultChanged) return { ...acm, sampling: { ...sampling, resultUpdatedAt: now } };
      changes.push({ field: `Result ${acm.sampling.sampleId || acm.materialId}`, from: before, to: M.resultSummary(sampling) });
      if (air?.result === 'Exceeds Limit' && acm.sampling.result !== 'Exceeds Limit') exceeded.push({ acm, air });
      // A first result is "recorded"; a later change is an update
      return { ...acm, sampling: { ...sampling, resultRecordedAt: now, resultRecordedBy: by, ...(acm.sampling.resultRecordedAt ? { resultUpdatedAt: now } : {}) } };
    };
    const [first, ...extra] = acms.map(apply);
    const updated = await updateRecord(r.id, { sampling: first.sampling, extra });
    logAudit(req, { action: 'update', module: MODULE, recordId: r.id, link: link(r), summary: `Recorded lab results for inspection ${r.id}`, changes });
    // Same alert as an Air Monitoring exceedance
    for (const { acm, air } of exceeded) {
      const m = getMaterial(acm.materialId);
      const place = placeLookup()(acm);
      notify({
        type: 'compliance', priority: 'high', title: 'Air Monitoring Exceedance',
        message: `${acm.sampling.airType} air sample ${acm.sampling.sampleId} at ${place.roomNumber} ${place.roomName} measured ${air.airValue} ${air.limit.unit} (limit ${air.limit.value} ${air.limit.unit}).`,
        description: `Inspection ${r.id} (${m?.name ?? acm.materialId}) at ${place.schoolName}, ${place.buildingName} exceeded the ${air.limit.basis}. Stop work in the area if abatement is ongoing, review containment, and re-sample before re-occupancy.`,
        schoolId: acm.schoolId, schoolName: place.schoolName, buildingName: place.buildingName, rooms: `${place.roomNumber} ${place.roomName}`.trim(),
        link: link(r), linkLabel: 'Open inspection',
      });
    }
    await syncStages(updated);
    res.json({ record: { ...getRecord(r.id), statusLabel: STATUS_LABEL[updated.state] } });
  } catch (err) {
    next(err);
  }
});

// People who can be given O&M work (same list as the O&M module)
const omAssignees = () => getPeople().filter((p) => OMM.ASSIGNEE_CATEGORIES.includes(p.category) && p.status === 'active');
// O&M "Urgent" is the inspection's "Critical"
const actionPriority = (p) => (p === 'Urgent' ? 'Critical' : p);

// Problems with O&M tasks for inspection r (keys tasks.<i>.<field>, or `${prefix}<i>.<field>`)
function omTaskErrors(r, tasks, prefix = 'tasks.') {
  const people = omAssignees();
  const acms = M.acmsOf(r);
  const errors = {};
  tasks.forEach((t, i) => {
    const e = (k, msg) => { errors[`${prefix}${i}.${k}`] = msg; };
    if (!acms.some((a) => a.materialId === t?.materialId)) e('materialId', 'Choose one of the inspection’s ACMs');
    if (!OMM.TYPE_VALUES.includes(t?.type)) e('type', 'Choose the activity type');
    if (!String(t?.description ?? '').trim()) e('description', 'Describe the work');
    if (!OMM.PRIORITIES.includes(t?.priority)) e('priority', 'Choose a priority');
    if (!validDay(t?.dueDate)) e('dueDate', 'Choose the due date');
    else if (t.dueDate < todayIso()) e('dueDate', 'Due date can’t be in the past');
    if (!people.some((p) => p.id === t?.assignedToId)) e('assignedToId', 'Assign someone responsible');
  });
  return errors;
}

/**
 * Creates O&M tasks for inspection r (validated with omTaskErrors): each becomes an O&M activity in the
 * Operations & Maintenance module, linked to the inspection, and an action item on the inspection, so it moves
 * to Corrective Action / Remediation until the work is completed. Returns { updated, created }.
 */
async function createOmTasks(req, r, tasks) {
  const people = omAssignees();
  const now = new Date().toISOString();
  const me = currentUser();
  const items = [...(r.actionItems ?? [])];
  let n = items.reduce((m, a) => Math.max(m, Number(String(a.id).split('-')[1]) || 0), 0);
  const created = [];
  for (const t of tasks) {
    const m = getMaterial(t.materialId);
    const person = people.find((p) => p.id === t.assignedToId);
    const description = String(t.description).trim().slice(0, 500);
    const activity = await OM.add('activities', {
      id: OM.nextActivityId(), type: t.type, description, materialId: m.id, schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
      priority: t.priority, dueDate: t.dueDate, assignedToId: person.id, assignedToName: person.name, state: 'pending',
      work: null, completedAt: null, completedBy: null, attachments: [], inspectionId: r.id,
      history: [{ at: now, by: me.name, action: `Created from inspection ${r.id}` }, { at: now, by: me.name, action: `Assigned to ${person.name}` }],
      createdAt: now, createdBy: { id: me.id, name: me.name }, sample: false,
    });
    created.push(activity);
    items.push({
      id: `AI-${++n}`, action: `${t.type}: ${description}`, assignedTo: 'O&M – Maintenance', assignee: person.name, priority: actionPriority(t.priority),
      dueDate: t.dueDate, status: 'Pending', omActivityId: activity.id, materialId: m.id,
    });
    logAudit(req, {
      action: 'create', module: 'Operations & Maintenance', recordId: activity.id, link: `/operations/activities/${activity.id}`,
      summary: `Created ${activity.type.toLowerCase()} ${activity.id} from inspection ${r.id}`,
      changes: [{ field: 'Type', to: activity.type }, { field: 'Assigned To', to: person.name }, { field: 'Due Date', to: activity.dueDate }],
    });
  }
  const updated = await updateRecord(r.id, { actionItems: items });
  logAudit(req, {
    action: 'update', module: MODULE, recordId: r.id, link: link(r), summary: `Added ${created.length} O&M task${created.length === 1 ? '' : 's'} to inspection ${r.id}`,
    changes: created.map((a) => ({ field: 'O&M Task', to: `${a.id} – ${a.type}` })),
  });
  return { updated, created };
}

/**
 * POST /records/:id/om-tasks { tasks: [{ materialId, type, description, priority, dueDate, assignedToId }] }
 * — O&M work required by the inspection (e.g. after the lab results); see createOmTasks.
 */
router.post('/records/:id/om-tasks', async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    if (r.state !== 'submitted' && r.state !== 'approved') return res.status(409).json({ error: 'O&M tasks can be added once the inspection has been submitted' });
    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 20) : [];
    const errors = tasks.length ? omTaskErrors(r, tasks) : { tasks: 'Add at least one O&M task' };
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const { updated, created } = await createOmTasks(req, r, tasks);
    await syncStages(updated);
    res.status(201).json({ record: { ...getRecord(r.id), statusLabel: STATUS_LABEL[updated.state] }, created: created.map((a) => a.id) });
  } catch (err) {
    next(err);
  }
});
// Records the stage changes on every inspection of an ACM (a follow-up inspection also moves the earlier ones)
// (every inspection sharing an ACM with the given records — an inspection can cover several ACMs)
const syncStages = (...changed) => syncInspectionStages(...changed);

const ASSESSMENT_LISTS = {
  damageType: M.DAMAGE_TYPES, damageExtent: M.DAMAGE_EXTENTS, waterDamage: ['Yes', 'No'], potentialDisturbance: M.LEVELS,
  labelled: ['Yes', 'No', 'N/A'], managementPlanUpdated: ['Yes', 'No'],
};
const RISK_LISTS = { priority: M.PRIORITIES, damageSeverity: M.SEVERITIES, recommendedAction: M.RECOMMENDED_ACTIONS, immediateAttention: ['Yes', 'No'], followUpRequired: ['Yes', 'No'] };
const oneOf = (v, list) => v === '' || v == null || list.includes(v);

/**
 * One ACM's part of an inspection (location, condition assessment, checklist, sampling, risk) from the form,
 * merged over what was saved. Errors go into `errors` under `prefix` ('' for the first ACM, 'extra.<i>.' for
 * the others). On submit every field is required and contradicting answers are flagged.
 */
function parseAcm(src, prev, { submit, date }, errors, prefix = '') {
  const pick = (k, d) => (src[k] !== undefined ? src[k] : prev?.[k] ?? d);
  const obj = (k) => ({ ...(prev?.[k] ?? {}), ...(src[k] ?? {}) });
  const err = (k, msg) => { if (!errors[prefix + k]) errors[prefix + k] = msg; };
  const material = getMaterial(pick('materialId', ''));
  if (!material) err('materialId', 'Choose the ACM being inspected');
  const a = obj('assessment');
  const cl = obj('checklist');
  const cn = obj('checklistNotes');
  const s = obj('sampling');
  const rk = obj('risk');

  const item = {
    materialId: material?.id ?? null, schoolId: material?.schoolId, buildingId: material?.buildingId, floorId: material?.floorId, roomId: material?.roomId,
    locationDescription: String(pick('locationDescription', '') ?? '').trim().slice(0, 160),
    homogeneousAreaId: String(pick('homogeneousAreaId', '') ?? '').trim().toUpperCase().slice(0, 20),
    assessment: {
      currentCondition: a.currentCondition ?? '', previousCondition: a.previousCondition ?? null,
      conditionChange: M.conditionChange(a.previousCondition, a.currentCondition),
      damageType: a.damageType ?? '', damageExtent: a.damageExtent ?? '', waterDamage: a.waterDamage ?? '',
      potentialDisturbance: a.potentialDisturbance ?? '', labelled: a.labelled ?? '', managementPlanUpdated: a.managementPlanUpdated ?? '',
    },
    checklist: Object.fromEntries(M.CHECKLIST.map((q) => [q.key, cl[q.key] ?? ''])),
    // Optional note per checklist question (evidence files carry the question's key instead)
    checklistNotes: Object.fromEntries(M.CHECKLIST.map((q) => [q.key, String(cn[q.key] ?? '').trim().slice(0, 500)]).filter(([, t]) => t)),
    sampling: s.required === 'Yes'
      ? {
        required: 'Yes', sampleType: String(s.sampleType ?? '').trim(),
        sampleId: String(s.sampleId ?? '').trim().toUpperCase().slice(0, 30), collectionDate: String(s.collectionDate ?? ''),
        laboratory: String(s.laboratory ?? '').trim(), testMethod: String(s.testMethod ?? '').trim(), notes: String(s.notes ?? '').trim().slice(0, 1000),
        result: s.result ?? 'Pending',
        // Air samples: kind of air sample (Air Monitoring's types), how long it ran, and the measured value
        ...(s.sampleType === M.AIR_SAMPLE ? {
          airType: String(s.airType ?? '').trim(), durationMin: s.durationMin === '' || s.durationMin == null ? null : Number(s.durationMin),
          ...(prev?.sampling?.airValue != null ? { airValue: prev.sampling.airValue } : {}),
        } : {}),
        ...(prev?.sampling?.resultNotes ? { resultNotes: prev.sampling.resultNotes } : {}),
        ...(prev?.sampling?.resultRecordedAt ? { resultRecordedAt: prev.sampling.resultRecordedAt, resultRecordedBy: prev.sampling.resultRecordedBy } : {}),
        // Kept on records saved before the field was removed from the form
        ...(s.sampleLocation ? { sampleLocation: String(s.sampleLocation).trim().slice(0, 120) } : {}),
        // When the inspection was submitted and the sample sent for analysis (kept once set)
        ...(prev?.sampling?.sentToLabAt ? { sentToLabAt: prev.sampling.sentToLabAt, sentToLabBy: prev.sampling.sentToLabBy } : {}),
      }
      : { required: s.required === 'No' ? 'No' : '' },
    risk: {
      priority: rk.priority ?? '', damageSeverity: rk.damageSeverity ?? '', recommendedAction: rk.recommendedAction ?? '',
      immediateAttention: rk.immediateAttention ?? '', followUpRequired: rk.followUpRequired ?? '', targetDate: String(rk.targetDate ?? ''),
    },
  };

  // Option lists
  if (!oneOf(item.assessment.currentCondition, M.CONDITIONS)) err('assessment.currentCondition', 'Choose a condition');
  if (item.assessment.previousCondition && !M.CONDITIONS.includes(item.assessment.previousCondition)) item.assessment.previousCondition = null;
  for (const [k, list] of Object.entries(ASSESSMENT_LISTS)) if (!oneOf(item.assessment[k], list)) err(`assessment.${k}`, 'Invalid choice');
  for (const q of M.CHECKLIST) if (!oneOf(item.checklist[q.key], q.answers)) err(`checklist.${q.key}`, 'Invalid answer');
  for (const [k, list] of Object.entries(RISK_LISTS)) if (!oneOf(item.risk[k], list)) err(`risk.${k}`, 'Invalid choice');
  const isAir = item.sampling.sampleType === M.AIR_SAMPLE;
  if (item.sampling.required === 'Yes' && !(isAir ? M.AIR_RESULTS : M.SAMPLE_RESULTS).includes(item.sampling.result)) err('sampling.result', 'Invalid result');
  // Laboratory from the list (a lab already on the record stays valid)
  const keptLab = prev?.sampling?.laboratory && item.sampling.laboratory === prev.sampling.laboratory;
  if (item.sampling.laboratory && !keptLab && !M.LABORATORIES.includes(item.sampling.laboratory)) err('sampling.laboratory', 'Choose a laboratory');
  const typeDef = M.SAMPLE_TYPES.find((t) => t.value === item.sampling.sampleType);
  if (item.sampling.sampleType && !typeDef) err('sampling.sampleType', 'Choose the sample type');
  // What to test must suit the sample type (an older method already on the record stays valid)
  const keptMethod = prev?.sampling?.testMethod && item.sampling.testMethod === prev.sampling.testMethod;
  if (item.sampling.testMethod && !keptMethod && !(typeDef ? typeDef.testMethods : M.TEST_METHODS).includes(item.sampling.testMethod)) {
    err('sampling.testMethod', typeDef ? `Choose a test for ${/^[aeiou]/i.test(typeDef.value) ? 'an' : 'a'} ${typeDef.value.toLowerCase()}` : 'Choose what to test');
  }
  if (isAir) {
    if (item.sampling.airType && !AIR_TYPES.includes(item.sampling.airType)) err('sampling.airType', 'Choose the kind of air sample');
    const d = item.sampling.durationMin;
    if (d != null && (!Number.isFinite(d) || d < 1 || d > 1440)) err('sampling.durationMin', 'Duration must be 1–1440 minutes');
  }

  // Dates
  if (item.risk.targetDate && !validDay(item.risk.targetDate)) err('risk.targetDate', 'Enter a valid date');
  else if (item.risk.targetDate && date && item.risk.targetDate < date) err('risk.targetDate', 'Must be on or after the inspection date');
  if (item.sampling.collectionDate && !validDay(item.sampling.collectionDate)) err('sampling.collectionDate', 'Enter a valid date');

  if (submit) {
    const need = (cond, key, msg) => { if (cond) err(key, msg); };
    need(!item.locationDescription, 'locationDescription', 'Describe where the material is');
    for (const k of ['currentCondition', ...Object.keys(ASSESSMENT_LISTS)]) need(!item.assessment[k], `assessment.${k}`, 'Required');
    for (const q of M.CHECKLIST) need(!item.checklist[q.key], `checklist.${q.key}`, 'Answer this question');
    need(!item.sampling.required, 'sampling.required', 'Is a sample required?');
    if (item.sampling.required === 'Yes') {
      need(!item.sampling.sampleId, 'sampling.sampleId', 'Sample ID is required');
      need(!item.sampling.collectionDate, 'sampling.collectionDate', 'Collection date is required');
      need(!item.sampling.sampleType, 'sampling.sampleType', 'Choose the sample type');
      need(!item.sampling.laboratory, 'sampling.laboratory', 'Laboratory is required');
      need(!item.sampling.testMethod, 'sampling.testMethod', 'Choose what to test');
      if (isAir) {
        need(!item.sampling.airType, 'sampling.airType', 'Choose the kind of air sample');
        need(item.sampling.durationMin == null, 'sampling.durationMin', 'Enter how long the sample ran');
      }
    }
    for (const k of Object.keys(RISK_LISTS)) need(!item.risk[k], `risk.${k}`, 'Required');
    need(item.risk.followUpRequired === 'Yes' && !item.risk.targetDate, 'risk.targetDate', 'Target date is required when follow-up is needed');
    // Answers that contradict each other make the record unreliable for AHERA
    const dmg = item.assessment.currentCondition && item.assessment.currentCondition !== 'Good';
    need(item.checklist.damaged === 'Yes' && !dmg, 'checklist.damaged', 'The condition is “Good” but the material is marked damaged');
    need(item.checklist.damaged === 'No' && dmg, 'checklist.damaged', `The condition is “${item.assessment.currentCondition}” but the material is marked not damaged`);
    need(item.checklist.waterDamage !== item.assessment.waterDamage && item.checklist.waterDamage && item.assessment.waterDamage, 'checklist.waterDamage', 'Doesn’t match “Water Damage” in the condition assessment');
    need(item.checklist.immediateAction === 'Yes' && item.risk.immediateAttention === 'No', 'risk.immediateAttention', 'The checklist says immediate action is required');
  }
  return { item, material };
}

const MAX_ACMS = 50;

/**
 * Builds a record from the form. One inspection can cover several ACMs: the first ACM's details are on the
 * record itself, the others in `extra` (each validated the same way, errors under `extra.<i>.`). Drafts need
 * only the ACM; submitting needs every required field, the checklist, consistent answers, sampling details when
 * sampling is required, and the inspector's signature.
 */
function validate(body, existing) {
  const errors = {};
  const submit = body.state === 'submitted';
  const pick = (k, d) => (body[k] !== undefined ? body[k] : existing?.[k] ?? d);
  const obj = (k) => ({ ...(existing?.[k] ?? {}), ...(body[k] ?? {}) });
  const date = String(pick('date', '') ?? '');
  const ctx = { submit, date };

  const { item: first, material } = parseAcm(body, existing, ctx, errors);
  const extraIn = pick('extra', []);
  if (!Array.isArray(extraIn) || extraIn.length > MAX_ACMS - 1) errors.extra = `Up to ${MAX_ACMS} ACMs per inspection`;
  const extra = (Array.isArray(extraIn) ? extraIn.slice(0, MAX_ACMS - 1) : []).map((x, i) => parseAcm(
    x && typeof x === 'object' ? x : {}, existing?.extra?.find((e) => e.materialId === x?.materialId), ctx, errors, `extra.${i}.`,
  ).item);
  const ids = [first, ...extra].map((x) => x.materialId).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.extra = 'Each ACM can only be listed once';

  const inspector = inspectors().find((u) => u.id === pick('inspectorId', ''));
  const v = obj('verification');
  const r = {
    type: pick('type', ''), date,
    ...first,
    extra,
    inspectorId: inspector?.id ?? null, inspectorName: inspector?.name ?? null, certification: inspector?.certification ?? null,
    comments: String(pick('comments', '') ?? '').trim().slice(0, 2000),
    actionItems: [],
    verification: {
      ...(existing?.verification ?? {}),
      inspectorSignature: typeof v.inspectorSignature === 'string' ? v.inspectorSignature : null,
      completionDate: String(v.completionDate ?? ''),
    },
    state: submit ? 'submitted' : 'draft',
    // Inspections submitted from now on have a reviewer confirm each later stage (see inspectionLifecycle);
    // a follow-up inspection (child) has none — its work counts towards its parent's stages
    ...((submit || existing?.reviewGates) && !existing?.parentId ? { reviewGates: true } : {}),
  };

  const keepsRetiredType = existing && r.type === existing.type && M.RETIRED_TYPES.includes(r.type);
  if (!keepsRetiredType && !oneOf(r.type, M.TYPES)) errors.type = 'Choose an inspection type';

  // Dates
  const today = todayIso();
  if (r.date && !validDay(r.date)) errors.date = 'Enter a valid date';
  else if (r.date > today) errors.date = 'Inspection date can’t be in the future';
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
    need(!sig, 'verification.inspectorSignature', 'The inspector must sign the inspection');
    need(!r.verification.completionDate, 'verification.completionDate', 'Completion date is required');
    const followUp = M.acmsOf(r).some((x) => x.risk.followUpRequired === 'Yes' || x.checklist.immediateAction === 'Yes');
    need(followUp && !r.actionItems.length, 'actionItems', 'Add at least one action item for the follow-up');
  }
  return { r, material, errors };
}

/**
 * Submitting an inspection with samples puts it up for review: the reviewer checks it and sends the samples
 * to the laboratory (stage review of Inspection Submitted). Returns that pending review, or null.
 */
function submittedReview(r, existing) {
  if (existing?.parentId || r.state !== 'submitted' || !M.acmsOf(r).some((a) => a.sampling?.required === 'Yes')) return null;
  const me = currentUser();
  return {
    id: `RV-${(existing?.stageReviews?.length ?? 0) + 1}`, stage: 'submitted', status: 'pending', requestedAt: new Date().toISOString(),
    requestedBy: { id: me.id, name: me.name }, note: 'Inspection submitted – review it and send the samples to the laboratory.', requestFileIds: [],
  };
}

const auditView = (x) => ({
  Type: x.type || '—', Date: x.date || '—', Inspector: x.inspectorName || '—', 'Homogeneous Area': x.homogeneousAreaId || '—',
  Condition: x.assessment?.currentCondition || '—', 'Condition Change': x.assessment?.conditionChange || '—', Priority: x.risk?.priority || '—',
  'Recommended Action': x.risk?.recommendedAction || '—', 'Sample Required': x.sampling?.required || '—', 'Sample Result': x.sampling?.result || '—',
  'Action Items': String(x.actionItems?.length ?? 0), ACMs: String(1 + (x.extra?.length ?? 0)), Status: STATUS_LABEL[x.state],
});

router.post('/', async (req, res, next) => {
  try {
    const { r, material, errors } = validate(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    r.verification = { ...r.verification, reviewStatus: r.state === 'submitted' ? 'Pending Review' : 'Not Submitted' };
    const created = await addRecord({
      ...r, ...(submittedReview(r, null) ? { stageReviews: [submittedReview(r, null)] } : {}),
      attachments: [], createdAt: new Date().toISOString(), createdBy: { id: currentUser().id, name: currentUser().name }, sample: false,
    });
    logAudit(req, {
      action: 'create', module: MODULE, recordId: created.id, link: link(created),
      summary: `${created.state === 'submitted' ? 'Submitted' : 'Saved draft'} ${created.type || 'inspection'} of ${material.name}`,
      changes: Object.entries(auditView(created)).map(([field, to]) => ({ field, to })),
    });
    await syncStages(created);
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
    const review = submittedReview(r, existing);
    if (review) r.stageReviews = [...(existing.stageReviews ?? []), review];
    const before = auditView(existing);
    const was = { ...existing, extra: [...(existing.extra ?? [])] }; // ACMs removed from it need their stages synced too
    const updated = await updateRecord(existing.id, r);
    const changes = diff(before, auditView(updated));
    const more = updated.extra?.length ? ` and ${updated.extra.length} more ACM${updated.extra.length === 1 ? '' : 's'}` : '';
    logAudit(req, {
      action: 'update', module: MODULE, recordId: updated.id, link: link(updated),
      summary: r.state === 'submitted' ? `Submitted ${updated.type} of ${material.name}${more} for review` : `Updated draft inspection of ${material.name}${more}`,
      changes,
    });
    await syncStages(updated, was);
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

    const { updated, conditionChange } = await decideInspection(req, existing, decision === 'approve', reviewer, signature, note);
    await syncStages(updated);
    res.json({ record: { ...updated, statusLabel: STATUS_LABEL[updated.state] }, conditionChange });
  } catch (err) {
    next(err);
  }
});

/**
 * The final review of a submitted inspection: approved (locked; its ACM conditions update the inventory) or
 * returned for changes. Also used when a stage reviewer approves a closure request or the follow-up result.
 * Returns { updated, conditionChange }.
 */
async function decideInspection(req, existing, approve, reviewer, signature, note) {
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

  // An approved inspection is the authoritative condition for the ACM inventory (every ACM it covers)
  let conditionChange = null;
  for (const acm of approve ? M.acmsOf(updated) : []) {
    const material = getMaterial(acm.materialId);
    const cond = acm.assessment?.currentCondition;
    if (!material || !cond || material.condition === cond) continue;
    conditionChange ??= { from: material.condition, to: cond };
    await updateMaterial(material.id, { condition: cond });
    logAudit(req, {
      action: 'update', module: 'ACM Inventory', recordId: material.id,
      link: `/schools/${material.schoolId}/buildings/${material.buildingId}/floors/${material.floorId}?room=${material.roomId}`,
      summary: `Condition of ${material.name} updated from approved inspection ${updated.id}`, changes: [{ field: 'Condition', from: material.condition, to: cond }],
    });
  }
  return { updated, conditionChange };
}

// Problems with a planned follow-up inspection { inspectorId, scheduledDate, scheduledTime, notes } (keys followUp.<field>)
function followUpPlanErrors(plan) {
  const errors = {};
  if (!inspectors().some((u) => u.id === plan?.inspectorId)) errors['followUp.inspectorId'] = 'Choose the inspector';
  if (!validDay(plan?.scheduledDate)) errors['followUp.scheduledDate'] = 'Choose the date';
  else if (plan.scheduledDate < todayIso()) errors['followUp.scheduledDate'] = 'The date can’t be in the past';
  if (!validTime(plan?.scheduledTime)) errors['followUp.scheduledTime'] = 'Choose the time';
  return errors;
}

/**
 * Schedules a Follow-up Inspection of every ACM on inspection r, as its child (parentId): r waits in
 * Follow-up Verification until the child is approved — passed → r can be closed; open issues → corrective action.
 */
async function createFollowUp(req, r, plan) {
  const inspector = inspectors().find((u) => u.id === plan.inspectorId);
  const me = currentUser();
  const now = new Date().toISOString();
  const blank = (a) => ({
    materialId: a.materialId, schoolId: a.schoolId, buildingId: a.buildingId, floorId: a.floorId, roomId: a.roomId,
    locationDescription: a.locationDescription ?? '', homogeneousAreaId: '', assessment: {}, checklist: {}, sampling: {}, risk: {},
  });
  const [first, ...extra] = M.acmsOf(r).map(blank);
  const note = String(plan.notes ?? '').trim().slice(0, 500);
  const child = await addRecord({
    type: 'Follow-up Inspection', date: null, scheduledDate: plan.scheduledDate, scheduledTime: plan.scheduledTime, ...first, extra,
    inspectorId: inspector.id, inspectorName: inspector.name, certification: inspector.certification, comments: '', actionItems: [],
    verification: { reviewStatus: 'Not Submitted' }, parentId: r.id,
    assignment: { assignedBy: { id: me.id, name: me.name }, assignedAt: now, notes: note || `Follow-up of inspection ${r.id}` },
    state: 'scheduled', attachments: [], createdAt: now, createdBy: { id: me.id, name: me.name }, sample: false,
  });
  logAudit(req, {
    action: 'create', module: MODULE, recordId: child.id, link: link(child),
    summary: `Scheduled follow-up inspection ${child.id} of inspection ${r.id} with ${inspector.name} for ${plan.scheduledDate} ${plan.scheduledTime}`,
    changes: [{ field: 'Type', to: child.type }, { field: 'Follow-up Of', to: r.id }, { field: 'Assigned To', to: inspector.name }, { field: 'Scheduled', to: `${plan.scheduledDate} ${plan.scheduledTime}` }],
  });
  return child;
}

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
    await syncStages(r);
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
    await syncStages(r);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Photos & documents: raw body (PNG / JPEG / WebP / PDF, max 10 MB) with ?name=&category=
// and optionally &checklist=<question key> for evidence attached to one checklist question
router.post('/records/:id/attachments', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const r = getRecord(req.params.id);
    if (!r) return res.status(404).json({ error: 'Inspection record not found' });
    if (r.state === 'approved') return res.status(409).json({ error: 'Approved inspections are locked' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload a JPG, PNG, WebP or PDF file' });
    if (r.attachments.length >= 30) return res.status(409).json({ error: 'At most 30 files per inspection' });
    const question = M.CHECKLIST.find((q) => q.key === req.query.checklist);
    if (req.query.checklist && !question) return res.status(400).json({ error: 'Unknown checklist question' });
    // Which of the inspection's ACMs the evidence is for (&material=<ACM id>; default the first ACM)
    const acm = req.query.material ? M.acmsOf(r).find((a) => a.materialId === req.query.material) : r;
    if (!acm) return res.status(400).json({ error: 'That ACM is not part of this inspection' });
    const category = M.DOC_CATEGORIES.includes(req.query.category) ? req.query.category : type.ext === 'pdf' ? 'Supporting Document' : 'Material Condition Photo';
    const file = await storeUpload(FILE_DIR, req.body, type, {
      name: req.query.name, category, ...(question ? { checklistKey: question.key, materialId: acm.materialId } : {}), uploadedBy: { id: currentUser().id, name: currentUser().name },
    });
    await addAttachment(r.id, file);
    logAudit(req, {
      action: 'create', module: MODULE, recordId: r.id, link: link(r),
      summary: `Attached ${category.toLowerCase()} to inspection ${r.id}${question ? ` (checklist: ${question.question})` : ''}`, changes: [{ field: category, to: file.name }],
    });
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
        assignment: { assignedBy: { id: currentUser().id, name: currentUser().name }, assignedAt: new Date().toISOString(), notes: note },
        state: 'scheduled', attachments: [], createdAt: new Date().toISOString(), createdBy: { id: currentUser().id, name: currentUser().name }, sample: false,
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
    await syncStages(...created.map((id) => getRecord(id)));
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
  const busy = new Set(recs.filter((r) => OPEN_STATES.includes(r.state) || r.state === 'submitted').flatMap((r) => [r.materialId, ...r.extraMaterialIds]));
  const last = new Map();
  for (const r of recs) {
    if (r.state !== 'approved') continue;
    for (const id of [r.materialId, ...r.extraMaterialIds]) if (!last.has(id) || r.date > last.get(id)) last.set(id, r.date);
  }
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
