import { Router } from 'express';
import { PROGRAMS, CATEGORIES, programById } from '../data/trainingPrograms.js';
import {
  getPeople, getPerson, addPerson, updatePerson, addRecord, nextId, recordStatus, DUE_SOON_DAYS,
} from '../data/personnelStore.js';
import { schools } from '../data/store.js';
import { logAudit, diff } from '../data/auditStore.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// Looked up live so schools added in the app are found
const schoolById = { get: (id) => schools.find((s) => s.id === id), has: (id) => schools.some((s) => s.id === id) };

// kind: Employee | Contractor | Inspector (role filter on the screen)
function filterPeople({ q, kind, category, status, school }) {
  const term = q?.trim().toLowerCase();
  return getPeople().filter((p) =>
    (!kind || p.kind === kind)
    && (!category || p.category === category)
    && (!status || p.trainingStatus === status)
    && (!school || p.schoolId === school)
    && (!term || [p.name, p.id, p.organization, p.email, p.categoryLabel].some((v) => v?.toLowerCase().includes(term))))
    .sort((a, b) => {
      const rank = { expired: 0, dueSoon: 1, compliant: 2 };
      return rank[a.trainingStatus] - rank[b.trainingStatus] || a.name.localeCompare(b.name);
    });
}

function validatePerson(body, existing) {
  const errors = {};
  const p = {
    name: String(body.name ?? existing?.name ?? '').trim().slice(0, 80),
    category: body.category ?? existing?.category,
    organization: String(body.organization ?? existing?.organization ?? '').trim().slice(0, 120),
    email: String(body.email ?? existing?.email ?? '').trim().toLowerCase() || null,
    phone: String(body.phone ?? existing?.phone ?? '').trim().slice(0, 30) || null,
    schoolId: body.schoolId === undefined ? existing?.schoolId ?? null : body.schoolId || null,
    status: body.status ?? existing?.status ?? 'active',
  };
  if (!p.name) errors.name = 'Name is required';
  if (!CATEGORIES[p.category]) errors.category = 'Choose a role / category';
  if (!p.organization) errors.organization = 'Organization is required';
  if (p.email && !EMAIL.test(p.email)) errors.email = 'Enter a valid email';
  if (p.schoolId && !schoolById.has(p.schoolId)) errors.schoolId = 'Unknown school';
  if (!['active', 'inactive'].includes(p.status)) errors.status = 'Invalid status';
  p.schoolName = p.schoolId ? schoolById.get(p.schoolId)?.name ?? null : null;
  return { p, errors };
}

const router = Router();

router.get('/meta', (req, res) => res.json({
  programs: PROGRAMS,
  categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, ...c })),
  dueSoonDays: DUE_SOON_DAYS,
}));

// GET /api/personnel?q=&kind=&category=&status=&school=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterPeople(req.query);
  // KPI cards reflect the school ("View By") filter but not the status/role filters
  const base = filterPeople({ school: req.query.school });
  const count = (s) => base.filter((p) => p.trainingStatus === s).length;
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    stats: { total: base.length, compliant: count('compliant'), dueSoon: count('dueSoon'), expired: count('expired'), programs: PROGRAMS.length },
    people: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Every training record, flattened (Training Records / Certifications tabs)
router.get('/records', (req, res) => {
  const { q, programId, status, accredited } = req.query;
  const term = q?.trim().toLowerCase();
  const rows = getPeople().flatMap((p) => p.records.map((r) => ({
    ...r,
    personId: p.id,
    personName: p.name,
    categoryLabel: p.categoryLabel,
    organization: p.organization,
    programName: programById[r.programId]?.name ?? r.programId,
    accredited: programById[r.programId]?.accredited ?? false,
    status: recordStatus(r),
  })))
    .filter((r) => (!programId || r.programId === programId)
      && (!status || r.status === status)
      && (!accredited || r.accredited === (accredited === 'true'))
      && (!term || [r.personName, r.programName, r.certificateNo, r.organization].some((v) => v?.toLowerCase().includes(term))))
    .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'));
  res.json({ total: rows.length, records: rows });
});

// Per program: how many people need it and how many are current
router.get('/summary', (req, res) => {
  const people = getPeople();
  const byCategory = Object.entries(CATEGORIES).map(([id, c]) => {
    const group = people.filter((p) => p.category === id);
    return {
      id, label: c.label, total: group.length,
      compliant: group.filter((p) => p.trainingStatus === 'compliant').length,
      dueSoon: group.filter((p) => p.trainingStatus === 'dueSoon').length,
      expired: group.filter((p) => p.trainingStatus === 'expired').length,
    };
  });
  const byProgram = PROGRAMS.map((prog) => {
    const needs = people.flatMap((p) => p.required.filter((r) => r.programId === prog.id));
    return {
      id: prog.id, name: prog.name, required: needs.length,
      valid: needs.filter((r) => r.status === 'valid').length,
      dueSoon: needs.filter((r) => r.status === 'dueSoon').length,
      lapsed: needs.filter((r) => r.status === 'expired' || r.status === 'missing').length,
    };
  });
  res.json({ byCategory, byProgram });
});

router.get('/:id', (req, res) => {
  const p = getPerson(req.params.id);
  if (!p) return res.status(404).json({ error: 'Person not found' });
  res.json({ ...p, history: [...p.records].sort((a, b) => b.completedOn.localeCompare(a.completedOn)) });
});

router.post('/', async (req, res, next) => {
  try {
    const { p, errors } = validatePerson(req.body ?? {});
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid person', fields: errors });
    const created = await addPerson({ id: nextId(), ...p, userId: null, records: [], sample: false });
    logAudit(req, {
      action: 'create', module: 'Personnel & Training', recordId: created.id, link: '/personnel',
      summary: `Added ${created.categoryLabel.toLowerCase()} ${created.name}`,
      changes: [{ field: 'Name', to: created.name }, { field: 'Category', to: created.categoryLabel }, { field: 'Organization', to: created.organization }],
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = getPerson(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Person not found' });
    const { p, errors } = validatePerson(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid person', fields: errors });
    const updated = await updatePerson(existing.id, p);
    const view = (x) => ({ name: x.name, category: CATEGORIES[x.category].label, organization: x.organization, email: x.email, phone: x.phone, school: x.schoolName, status: x.status });
    const changes = diff(view(existing), view(updated));
    if (changes.length) {
      logAudit(req, { action: 'update', module: 'Personnel & Training', recordId: updated.id, link: '/personnel', summary: `Updated ${updated.name}`, changes });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/personnel/:id/records  { programId, completedOn: "YYYY-MM-DD", certificateNo?, provider? }
router.post('/:id/records', async (req, res, next) => {
  try {
    const person = getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const { programId, completedOn } = req.body ?? {};
    const prog = programById[programId];
    const errors = {};
    if (!prog) errors.programId = 'Choose a training program';
    if (!ISO_DAY.test(String(completedOn ?? '')) || Number.isNaN(Date.parse(completedOn))) errors.completedOn = 'Enter the completion date';
    else if (Date.parse(`${completedOn}T00:00:00`) > Date.now()) errors.completedOn = 'Completion date can’t be in the future';
    if (prog?.accredited && !String(req.body.certificateNo ?? '').trim()) errors.certificateNo = 'Accredited courses need a certificate number';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid training record', fields: errors });

    const d = new Date(`${completedOn}T00:00:00`);
    if (prog.renewalMonths) d.setMonth(d.getMonth() + prog.renewalMonths);
    const pad = (n) => String(n).padStart(2, '0');
    const record = {
      programId,
      completedOn,
      expiresOn: prog.renewalMonths ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null,
      certificateNo: String(req.body.certificateNo ?? '').trim().slice(0, 40) || null,
      provider: String(req.body.provider ?? '').trim().slice(0, 80) || null,
    };
    const updated = await addRecord(person.id, record);
    logAudit(req, {
      action: 'create', module: 'Personnel & Training', recordId: person.id, link: '/personnel',
      summary: `Recorded ${prog.name} for ${person.name}`,
      changes: [
        { field: 'Program', to: prog.name }, { field: 'Completed', to: completedOn },
        { field: 'Expires', to: record.expiresOn ?? 'No expiry' },
        { field: 'Training Status', from: person.trainingStatus, to: updated.trainingStatus },
      ],
    });
    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
