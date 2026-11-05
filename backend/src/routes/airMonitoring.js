import { Router } from 'express';
import {
  getEvents, getEvent, addEvent, updateEvent, nextId, statusOf, limitFor, SAMPLE_TYPES, METHODS,
} from '../data/airStore.js';
import { schools, buildings, findSchool, findBuilding } from '../data/store.js';
import { logAudit, diff, currentUser } from '../data/auditStore.js';
import { notify } from '../data/notificationsStore.js';
import { inspectionAirEvents } from '../data/inspectionSamples.js';
import { getPeople } from '../data/personnelStore.js';
import { listUsers, listOrder } from './users.js';
import { getRecords } from '../data/inspectionRecordsStore.js';

const DAY = 86400000;
// Looked up live so schools added in the app are found
const schoolById = { get: (id) => findSchool(id), has: (id) => Boolean(findSchool(id)) };
// Looked up live so buildings added in the app are found
const buildingById = { get: (id) => findBuilding(id) };

/**
 * A logged event's sample ID (its own, or AS-… from the event id) and the inspection it relates to: the latest
 * inspection of the same school on or before the sample date — the same building first. Worked out on read;
 * nothing is stored. relatedInspectionId stays null where the school has no inspection.
 */
function withLinks(e) {
  const day = e.sampledAt.slice(0, 10);
  const atSchool = getRecords().filter((r) => r.schoolId === e.schoolId && !r.parentId && r.state !== 'draft');
  const pick = (list) => {
    const sorted = [...list].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return sorted.find((r) => (r.date ?? '') <= day) ?? sorted.at(-1) ?? null;
  };
  const related = pick(atSchool.filter((r) => r.buildingId === e.buildingId)) ?? pick(atSchool);
  // Generated sample events get lab references from their id (LAB-… / LAB-RPT-…); events logged in the app keep
  // what was entered
  const ref = e.id.replace(/^AM-/, '');
  return {
    ...e, sampleId: e.sampleId || `AS-${ref}`, relatedInspectionId: related?.id ?? null,
    labSampleId: e.labSampleId || (e.sample ? `LAB-${ref}` : null), labReportNo: e.labReportNo || (e.sample && e.result !== null ? `LAB-RPT-${ref}` : null),
  };
}
const loggedEvents = () => getEvents().map(withLinks);

function filterEvents({ q, school, building, type, method, status, from, to }) {
  const term = q?.trim().toLowerCase();
  const fromMs = from ? Date.parse(from) : -Infinity;
  const toMs = to ? Date.parse(to) + DAY - 1 : Infinity;
  // Logged events plus air samples taken during inspections
  return [...loggedEvents(), ...inspectionAirEvents()].filter((e) => {
    const t = Date.parse(e.sampledAt);
    return t >= fromMs && t <= toMs
      && (!school || e.schoolId === school)
      && (!building || e.buildingId === building)
      && (!type || e.type === type)
      && (!method || e.method === method)
      && (!status || e.status === status)
      && (!term || [e.id, e.schoolName, e.buildingName, e.location, e.project, e.contractorName, e.inspectorName, e.inspectionId, e.relatedInspectionId, e.sampleId]
        .some((v) => v?.toLowerCase().includes(term)));
  }).sort((a, b) => b.sampledAt.localeCompare(a.sampledAt));
}

// Who can be recorded on an event: accredited inspectors (app users) and contractors (personnel)
const inspectorsList = () => listUsers().filter((u) => u.roleId === 'inspector' && u.status === 'active')
  .map((u) => ({ id: u.id, name: u.name })).sort(listOrder);
const contractorsList = () => getPeople().filter((p) => p.kind === 'Contractor' && p.status === 'active')
  .map((p) => ({ id: p.id, name: p.name, category: p.categoryLabel })).sort((a, b) => a.name.localeCompare(b.name));

// Normalise + validate a create/update payload
function validate(body, existing) {
  const errors = {};
  const pickStr = (k, max = 200) => String(body[k] ?? existing?.[k] ?? '').trim().slice(0, max);
  // Inspector / contractor chosen from the lists (ids); empty = none
  const person = (idKey, nameKey, list, label) => {
    const id = body[idKey] !== undefined ? body[idKey] : existing?.[idKey];
    if (!id) return { [idKey]: null, [nameKey]: body[idKey] === undefined ? existing?.[nameKey] ?? '' : '' };
    const p = list.find((x) => x.id === id);
    if (!p) errors[idKey] = `Choose the ${label} from the list`;
    return { [idKey]: p?.id ?? null, [nameKey]: p?.name ?? '' };
  };
  const e = {
    sampledAt: body.sampledAt ?? existing?.sampledAt,
    schoolId: body.schoolId ?? existing?.schoolId,
    buildingId: body.buildingId ?? existing?.buildingId ?? null,
    location: pickStr('location', 80),
    type: body.type ?? existing?.type,
    method: body.method ?? existing?.method ?? 'PCM',
    durationMin: Number(body.durationMin ?? existing?.durationMin ?? 0),
    result: body.result === '' || body.result === null ? null : body.result !== undefined ? Number(body.result) : existing?.result ?? null,
    ...person('contractorId', 'contractorName', contractorsList(), 'contractor'),
    ...person('inspectorId', 'inspectorName', inspectorsList(), 'inspector'),
    notes: pickStr('notes', 1000),
    // The laboratory's references for the sample
    labSampleId: pickStr('labSampleId', 60), labReportNo: pickStr('labReportNo', 60),
  };
  if (!e.sampledAt || Number.isNaN(Date.parse(e.sampledAt))) errors.sampledAt = 'Enter the sampling date and time';
  else if (Date.parse(e.sampledAt) > Date.now() + 60000) errors.sampledAt = 'Sampling time can’t be in the future';
  const school = schoolById.get(e.schoolId);
  if (!school) errors.schoolId = 'Choose a school';
  const building = e.buildingId ? buildingById.get(e.buildingId) : null;
  if (e.buildingId && (!building || building.schoolId !== e.schoolId)) errors.buildingId = 'Building does not belong to that school';
  if (!e.location) errors.location = 'Enter the location or room';
  if (!SAMPLE_TYPES.includes(e.type)) errors.type = 'Choose a sample type';
  if (!METHODS[e.method]) errors.method = 'Choose PCM or TEM';
  if (!Number.isFinite(e.durationMin) || e.durationMin < 1 || e.durationMin > 1440) errors.durationMin = 'Duration must be 1–1440 minutes';
  if (e.result !== null && (!Number.isFinite(e.result) || e.result < 0)) errors.result = 'Fibre count must be a positive number (or empty if pending)';
  return {
    errors,
    event: { ...e, schoolName: school?.name ?? null, buildingName: building?.name ?? existing?.buildingName ?? 'Main Building' },
  };
}

const fmtResult = (e) => (e.result === null ? 'pending' : `${e.result} ${limitFor(e.type, e.method).unit}`);

function raiseExceedance(e) {
  notify({
    type: 'compliance', priority: 'high', title: 'Air Monitoring Exceedance',
    message: `${e.type} sample at ${e.location} measured ${fmtResult(e)} (limit ${e.limit.value} ${e.limit.unit}).`,
    description: `${e.id} (${e.method}) at ${e.schoolName}, ${e.buildingName} – ${e.location} exceeded the ${e.limit.basis}. Stop work in the area if abatement is ongoing, review containment, and re-sample before re-occupancy.`,
    schoolId: e.schoolId, schoolName: e.schoolName, buildingName: e.buildingName, rooms: e.location,
    link: '/air-monitoring', linkLabel: 'View Air Monitoring',
  });
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const router = Router();

router.get('/meta', (req, res) => res.json({
  types: SAMPLE_TYPES,
  methods: Object.entries(METHODS).map(([id, m]) => ({ id, ...m })),
  limits: Object.fromEntries(SAMPLE_TYPES.flatMap((t) => Object.keys(METHODS).map((m) => [`${t}|${m}`, limitFor(t, m)]))),
  inspectors: inspectorsList(),
  contractors: contractorsList(),
}));

// GET /api/air-monitoring?q=&school=&building=&type=&method=&status=&from=&to=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterEvents(req.query);
  // KPI/donut stats ignore the status filter so the cards keep showing the full split
  const statsBase = filterEvents({ ...req.query, status: '' });
  const count = (s) => statsBase.filter((e) => e.status === s).length;
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    stats: { total: statsBase.length, compliant: count('compliant'), exceedance: count('exceedance'), pending: count('pending') },
    events: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Monthly PCM area/clearance/background results (f/cc), same filters. Personal/TEM have other units/limits.
router.get('/trend', (req, res) => {
  const pcm = filterEvents({ ...req.query, status: '' })
    .filter((e) => e.method === 'PCM' && ['Clearance', 'Area', 'Background'].includes(e.type) && e.result !== null);
  const byMonth = new Map();
  for (const e of pcm) {
    const key = e.sampledAt.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(e.result);
  }
  const months = [...byMonth.keys()].sort().map((m) => {
    const v = byMonth.get(m);
    return {
      month: m,
      count: v.length,
      avg: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10000) / 10000,
      min: Math.min(...v),
      max: Math.max(...v),
    };
  });
  res.json({ unit: 'f/cc', actionLevel: 0.01, months });
});

router.get('/export.csv', (req, res) => {
  const rows = filterEvents(req.query);
  logAudit(req, { action: 'export', module: 'Air Monitoring', recordId: 'air-monitoring.csv', summary: `Exported ${rows.length} air monitoring events to CSV` });
  const header = ['Event ID', 'Inspection ID', 'Sample ID', 'Lab Sample ID', 'Lab Report No.', 'Date & Time', 'School', 'Building', 'Location', 'Type', 'Method', 'Fibre Count', 'Unit', 'Limit', 'Status', 'Duration (min)', 'Notes'];
  const lines = rows.map((e) => [e.id, e.inspectionId ?? e.relatedInspectionId ?? '', e.sampleId ?? '', e.labSampleId ?? '', e.labReportNo ?? '', e.sampledAt, e.schoolName, e.buildingName, e.location, e.type, e.method, e.result ?? '', e.limit.unit, e.limit.value, e.status, e.durationMin, e.notes]);
  res.type('text/csv').attachment('air-monitoring.csv').send([header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n'));
});

router.get('/:id', (req, res) => {
  const logged = getEvent(req.params.id);
  const e = logged ? withLinks(logged) : inspectionAirEvents().find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ error: 'Monitoring event not found' });
  res.json(e);
});

router.post('/', async (req, res, next) => {
  try {
    const { errors, event } = validate(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid monitoring event', fields: errors });
    const me = currentUser();
    // Logged with its fibre count = submitted (locked); without = pending until the count is entered
    const created = await addEvent({
      id: nextId(), ...event, loggedBy: me.name, sample: false,
      ...(event.result !== null ? { submittedAt: new Date().toISOString(), submittedBy: { id: me.id, name: me.name } } : {}),
    });
    logAudit(req, {
      action: 'create', module: 'Air Monitoring', recordId: created.id, link: '/air-monitoring',
      summary: `Logged ${created.type.toLowerCase()} air sample – ${created.schoolName}`,
      changes: [
        { field: 'Type', to: created.type }, { field: 'Method', to: created.method },
        { field: 'Location', to: `${created.buildingName}, ${created.location}` }, { field: 'Result', to: fmtResult(created) },
      ],
      related: { school: created.schoolName, building: created.buildingName, room: created.location },
    });
    if (created.status === 'exceedance') raiseExceedance(created);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = getEvent(req.params.id);
    if (!existing) {
      const fromInspection = inspectionAirEvents().find((x) => x.id === req.params.id);
      return fromInspection
        ? res.status(409).json({ error: `This air sample belongs to inspection ${fromInspection.inspectionId} – update it there (Lab Results)` })
        : res.status(404).json({ error: 'Monitoring event not found' });
    }
    // A submitted record (its fibre count recorded) is final
    if (existing.result !== null) {
      return res.status(409).json({ error: `${existing.id} was submitted with its fibre count and can no longer be changed` });
    }
    const { errors, event } = validate(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid monitoring event', fields: errors });
    const me = currentUser();
    const updated = await updateEvent(existing.id, {
      ...event,
      ...(event.result !== null ? { submittedAt: new Date().toISOString(), submittedBy: { id: me.id, name: me.name } } : {}),
    });
    const view = (e) => ({ type: e.type, method: e.method, location: e.location, result: fmtResult(e), status: statusOf(e), contractor: e.contractorName, inspector: e.inspectorName, notes: e.notes });
    const changes = diff(view(existing), view(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Air Monitoring', recordId: updated.id, link: '/air-monitoring',
        summary: `Updated air monitoring event – ${updated.schoolName}`, changes,
        related: { school: updated.schoolName, building: updated.buildingName, room: updated.location },
      });
    }
    if (updated.status === 'exceedance' && existing.status !== 'exceedance') raiseExceedance(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
