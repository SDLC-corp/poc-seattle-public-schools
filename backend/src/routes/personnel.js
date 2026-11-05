import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { PROGRAMS, CATEGORIES, programById } from '../data/trainingPrograms.js';
import {
  getPeople, getPerson, addPerson, updatePerson, addRecord, updateRecord, nextId, recordStatus, DUE_SOON_DAYS, CERT_DIR, certPath,
} from '../data/personnelStore.js';
import { schools } from '../data/store.js';
import { logAudit, diff, currentUser } from '../data/auditStore.js';
import { MAX_ATTACHMENT_BYTES } from '../data/acmMeta.js';
import {
  getMaterials, getMaterial, addMaterial, updateMaterial, removeMaterial, nextMaterialId, MATERIAL_DIR, materialPath,
} from '../data/trainingMaterialsStore.js';
import { sniff, storeUpload, sendStored } from './uploadCheck.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// Looked up live so schools added in the app are found
const schoolById = { get: (id) => schools.find((s) => s.id === id), has: (id) => schools.some((s) => s.id === id) };

// Certified (all required training current) / not certified (a required course never taken) / overdue (lapsed)
const certStatus = (p) => (p.required.some((r) => r.status === 'missing') ? 'notCertified'
  : p.required.some((r) => r.status === 'expired') ? 'overdue' : 'certified');

// kind: Employee | Contractor | Inspector (role filter on the screen)
// status: compliant | dueSoon | expired (training status) or certified | notCertified | overdue (as on School Compliance)
function filterPeople({ q, kind, category, status, school }) {
  const term = q?.trim().toLowerCase();
  const statusOk = (p) => (!status ? true
    : ['certified', 'notCertified', 'overdue'].includes(status) ? certStatus(p) === status
      : p.trainingStatus === status);
  return getPeople().filter((p) =>
    (!kind || p.kind === kind)
    && (!category || p.category === category)
    && statusOk(p)
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

// Per school: who is certified (all required training current), not certified (a required course never
// taken) or overdue (a required course lapsed). People without a school are grouped as District-wide.
router.get('/schools', (req, res) => {
  const groups = new Map();
  for (const p of getPeople().filter((x) => x.status !== 'inactive')) {
    const key = p.schoolId ?? '';
    if (!groups.has(key)) groups.set(key, { id: key, name: key ? schoolById.get(key)?.name ?? p.schoolName ?? key : 'District-wide (no school)', certified: [], notCertified: [], overdue: [] });
    const missing = p.required.filter((r) => r.status === 'missing');
    const lapsed = p.required.filter((r) => r.status === 'expired');
    const person = {
      id: p.id, name: p.name, categoryLabel: p.categoryLabel, kind: p.kind,
      dueSoon: p.trainingStatus === 'dueSoon', nextExpiry: p.nextExpiry,
      missing: missing.map((r) => r.programName),
      lapsed: lapsed.map((r) => ({ programName: r.programName, expiresOn: r.record.expiresOn })),
    };
    const g = groups.get(key);
    if (missing.length) g.notCertified.push(person);
    else if (lapsed.length) g.overdue.push(person);
    else g.certified.push(person);
  }
  const schools = [...groups.values()].map((g) => ({
    ...g,
    total: g.certified.length + g.notCertified.length + g.overdue.length,
    status: g.notCertified.length ? 'notCertified' : g.overdue.length ? 'overdue' : 'certified',
  })).sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || a.name.localeCompare(b.name));
  res.json({ schools });
});

// --- Training material (learning modules): files or links per training program ---

const MAX_MATERIAL_BYTES = 100 * 1024 * 1024;
const MATERIAL_TYPES = ['pdf', 'png', 'jpg', 'webp', 'mp4', 'webm'];
const kindOf = (ext) => (ext === 'pdf' ? 'pdf' : ['mp4', 'webm'].includes(ext) ? 'video' : 'image');
const httpUrl = (v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

// title / description / programId (and url for a link); `partial` keeps fields that aren't sent
function validateMaterial(b, existing) {
  const v = {
    programId: b.programId ?? existing?.programId,
    title: String(b.title ?? existing?.title ?? '').trim().slice(0, 120),
    description: String(b.description ?? existing?.description ?? '').trim().slice(0, 400),
  };
  const errors = {};
  if (!programById[v.programId]) errors.programId = 'Choose the training program';
  if (!v.title) errors.title = 'Title is required';
  if ((existing?.kind ?? b.kind) === 'link') {
    v.url = String(b.url ?? existing?.url ?? '').trim().slice(0, 500);
    if (!httpUrl(v.url)) errors.url = 'Enter a full link starting with https://';
  }
  return { v, errors };
}

const materialView = (m) => ({ ...m, programName: programById[m.programId]?.name ?? m.programId });
const by = () => ({ id: currentUser().id, name: currentUser().name });

router.get('/materials', (req, res) => {
  res.json({ materials: getMaterials().map(materialView).sort((a, b) => a.programName.localeCompare(b.programName) || a.title.localeCompare(b.title)) });
});

// Upload a file: raw body (PDF, JPG, PNG, WebP, MP4 or WebM; max 100 MB) with ?programId=&title=&description=&name=
router.post('/materials', express.raw({ type: () => true, limit: MAX_MATERIAL_BYTES }), async (req, res, next) => {
  try {
    const { v, errors } = validateMaterial({ ...req.query, title: req.query.title || String(req.query.name ?? '').replace(/\.[^.]+$/, '') });
    const type = sniff(req.body, MATERIAL_TYPES);
    if (!type) errors.file = 'Upload a PDF, image (JPG, PNG, WebP) or video (MP4, WebM)';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const file = await storeUpload(MATERIAL_DIR, req.body, type, { name: req.query.name, uploadedBy: by() });
    const m = await addMaterial({ id: nextMaterialId(), ...v, kind: kindOf(type.ext), file, url: null, createdAt: new Date().toISOString(), createdBy: by() });
    logAudit(req, { action: 'create', module: 'Personnel & Training', recordId: m.id, link: '/personnel/training', summary: `Added training material “${m.title}” (${programById[m.programId].name})`, changes: [{ field: 'File', to: file.name }] });
    res.status(201).json(materialView(m));
  } catch (err) {
    next(err);
  }
});

// Add a link (e.g. an online course or a hosted video): { programId, title, url, description? }
router.post('/materials/link', async (req, res, next) => {
  try {
    const { v, errors } = validateMaterial({ ...req.body, kind: 'link' });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const m = await addMaterial({ id: nextMaterialId(), ...v, kind: 'link', file: null, createdAt: new Date().toISOString(), createdBy: by() });
    logAudit(req, { action: 'create', module: 'Personnel & Training', recordId: m.id, link: '/personnel/training', summary: `Added training link “${m.title}” (${programById[m.programId].name})`, changes: [{ field: 'Link', to: m.url }] });
    res.status(201).json(materialView(m));
  } catch (err) {
    next(err);
  }
});

// Edit title / description / program (and the url of a link)
router.put('/materials/:mid', async (req, res, next) => {
  try {
    const existing = getMaterial(req.params.mid);
    if (!existing) return res.status(404).json({ error: 'Training material not found' });
    const { v, errors } = validateMaterial(req.body ?? {}, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const updated = await updateMaterial(existing.id, { ...v, updatedAt: new Date().toISOString(), updatedBy: by() });
    const view = (m) => ({ Program: programById[m.programId]?.name, Title: m.title, Description: m.description, Link: m.url ?? undefined });
    const changes = diff(view(existing), view(updated));
    if (changes.length) logAudit(req, { action: 'update', module: 'Personnel & Training', recordId: existing.id, link: '/personnel/training', summary: `Updated training material “${updated.title}”`, changes });
    res.json(materialView(updated));
  } catch (err) {
    next(err);
  }
});

// Replace the file of an uploaded material (the kind follows the new file)
router.post('/materials/:mid/file', express.raw({ type: () => true, limit: MAX_MATERIAL_BYTES }), async (req, res, next) => {
  try {
    const existing = getMaterial(req.params.mid);
    if (!existing || existing.kind === 'link') return res.status(404).json({ error: 'Training material not found' });
    const type = sniff(req.body, MATERIAL_TYPES);
    if (!type) return res.status(400).json({ error: 'Upload a PDF, image (JPG, PNG, WebP) or video (MP4, WebM)' });
    const file = await storeUpload(MATERIAL_DIR, req.body, type, { name: req.query.name, uploadedBy: by() });
    await unlink(materialPath(existing.file.storedName)).catch(() => {});
    const updated = await updateMaterial(existing.id, { file, kind: kindOf(type.ext), updatedAt: new Date().toISOString(), updatedBy: by() });
    logAudit(req, { action: 'update', module: 'Personnel & Training', recordId: existing.id, link: '/personnel/training', summary: `Replaced the file of “${existing.title}”`, changes: [{ field: 'File', from: existing.file.name, to: file.name }] });
    res.json(materialView(updated));
  } catch (err) {
    next(err);
  }
});

router.get('/materials/:mid/file', (req, res) => {
  const m = getMaterial(req.params.mid);
  if (!m?.file) return res.status(404).json({ error: 'File not found' });
  sendStored(res, m.file, materialPath(m.file.storedName), req.query.download === '1');
});

router.delete('/materials/:mid', async (req, res, next) => {
  try {
    const m = await removeMaterial(req.params.mid);
    if (!m) return res.status(404).json({ error: 'Training material not found' });
    logAudit(req, { action: 'delete', module: 'Personnel & Training', recordId: m.id, link: '/personnel/training', summary: `Removed training material “${m.title}”`, changes: [{ field: m.file ? 'File' : 'Link', from: m.file?.name ?? m.url, to: '—' }] });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
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

const validDay = (v) => ISO_DAY.test(String(v ?? '')) && !Number.isNaN(Date.parse(v));

/**
 * A certificate / training completion:
 * { programId (certificate type), completedOn, expiresOn?, certificateNo?, provider?, certificateUrl? }
 * expiresOn defaults to the program's renewal period ('' = no expiry only for programs that don't expire).
 * The certificate file is uploaded separately. `existing` keeps the id and file when updating.
 */
function validateRecord(body, existing) {
  const b = body ?? {};
  const prog = programById[b.programId];
  const text = (v, max) => String(v ?? '').trim().slice(0, max) || null;
  const errors = {};
  if (!prog) errors.programId = 'Choose the certificate type';
  if (!validDay(b.completedOn)) errors.completedOn = 'Enter the completion / issue date';
  else if (Date.parse(`${b.completedOn}T00:00:00`) > Date.now()) errors.completedOn = 'Completion date can’t be in the future';
  const certificateNo = text(b.certificateNo, 40);
  if (prog?.accredited && !certificateNo) errors.certificateNo = 'Accredited courses need a certificate number';
  const certificateUrl = text(b.certificateUrl, 500);
  if (certificateUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(certificateUrl).protocol)) throw new Error();
    } catch {
      errors.certificateUrl = 'Enter a full link starting with https://';
    }
  }
  let expiresOn = null;
  if (b.expiresOn) {
    if (!validDay(b.expiresOn)) errors.expiresOn = 'Enter a valid expiry date';
    else if (validDay(b.completedOn) && b.expiresOn <= b.completedOn) errors.expiresOn = 'Expiry must be after the completion date';
    else expiresOn = b.expiresOn;
  } else if (prog?.renewalMonths && validDay(b.completedOn)) {
    const d = new Date(`${b.completedOn}T00:00:00`);
    d.setMonth(d.getMonth() + prog.renewalMonths);
    const pad = (n) => String(n).padStart(2, '0');
    expiresOn = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  if (Object.keys(errors).length) return { errors };

  return {
    errors,
    prog,
    record: {
      ...existing,
      id: existing?.id ?? randomUUID().slice(0, 8),
      programId: b.programId,
      completedOn: b.completedOn,
      expiresOn,
      certificateNo,
      provider: text(b.provider, 80),
      certificateUrl,
      certificateFile: existing?.certificateFile ?? null,
      recordedAt: existing?.recordedAt ?? new Date().toISOString(),
      recordedBy: existing?.recordedBy ?? currentUser().name,
      ...(existing ? { updatedAt: new Date().toISOString(), updatedBy: currentUser().name } : {}),
    },
  };
}

// Update a certificate (type, number, dates, provider, link). Older sample records without an id are matched by
// ?programId=&completedOn= and get an id on save.
router.put('/:id/records/:recordId', async (req, res, next) => {
  try {
    const person = getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const existing = person.records.find((r) => r.id === req.params.recordId)
      ?? (req.params.recordId === 'legacy' ? person.records.find((r) => !r.id && r.programId === req.query.programId && r.completedOn === req.query.completedOn) : null);
    if (!existing) return res.status(404).json({ error: 'Training record not found' });
    const { record, prog, errors } = validateRecord(req.body, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid certificate', fields: errors });
    const updated = await updatePerson(person.id, { records: person.records.map((r) => (r === existing ? record : r)) });
    const view = (r) => ({
      'Certificate Type': programById[r.programId]?.name ?? r.programId, Completed: r.completedOn, Expires: r.expiresOn ?? 'No expiry',
      'Certificate No.': r.certificateNo, Provider: r.provider, 'Certificate Link': r.certificateUrl,
    });
    const changes = diff(view(existing), view(record));
    if (changes.length) {
      logAudit(req, { action: 'update', module: 'Personnel & Training', recordId: person.id, link: '/personnel', summary: `Updated ${prog.name} certificate for ${person.name}`, changes });
    }
    res.json({ ...updated, recordId: record.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/personnel/:id/records — see validateRecord
router.post('/:id/records', async (req, res, next) => {
  try {
    const person = getPerson(req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const { record, prog, errors } = validateRecord(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid training record', fields: errors });
    const { completedOn } = record;
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
    res.status(201).json({ ...updated, recordId: record.id });
  } catch (err) {
    next(err);
  }
});

const findRecord = (req) => getPerson(req.params.id)?.records.find((r) => r.id === req.params.recordId);

// The certificate itself: raw body (PDF / JPG / PNG / WebP, max 10 MB) with ?name=; replaces an earlier file
router.post('/:id/records/:recordId/certificate', express.raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }), async (req, res, next) => {
  try {
    const record = findRecord(req);
    if (!record) return res.status(404).json({ error: 'Training record not found' });
    const type = sniff(req.body);
    if (!type) return res.status(400).json({ error: 'Upload the certificate as a PDF, JPG, PNG or WebP file' });
    const file = await storeUpload(CERT_DIR, req.body, type, { name: req.query.name, uploadedBy: { id: currentUser().id, name: currentUser().name } });
    if (record.certificateFile) await unlink(certPath(record.certificateFile.storedName)).catch(() => {});
    const updated = await updateRecord(req.params.id, record.id, { certificateFile: file });
    logAudit(req, {
      action: 'update', module: 'Personnel & Training', recordId: updated.id, link: '/personnel',
      summary: `Uploaded certificate for ${programById[record.programId]?.name ?? record.programId} (${updated.name})`,
      changes: [{ field: 'Certificate File', from: record.certificateFile?.name ?? '—', to: file.name }],
    });
    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/records/:recordId/certificate', (req, res) => {
  const file = findRecord(req)?.certificateFile;
  if (!file) return res.status(404).json({ error: 'No certificate file for this record' });
  sendStored(res, file, certPath(file.storedName), req.query.download === '1');
});

router.delete('/:id/records/:recordId/certificate', async (req, res, next) => {
  try {
    const record = findRecord(req);
    if (!record?.certificateFile) return res.status(404).json({ error: 'No certificate file for this record' });
    await unlink(certPath(record.certificateFile.storedName)).catch(() => {});
    const updated = await updateRecord(req.params.id, record.id, { certificateFile: null });
    logAudit(req, {
      action: 'delete', module: 'Personnel & Training', recordId: updated.id, link: '/personnel',
      summary: `Removed certificate file for ${programById[record.programId]?.name ?? record.programId} (${updated.name})`,
      changes: [{ field: 'Certificate File', from: record.certificateFile.name, to: '—' }],
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
