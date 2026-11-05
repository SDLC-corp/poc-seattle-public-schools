import express, { Router } from 'express';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getDocuments, getDocument, addDocument, removeDocument, storedFilePath, nextId,
  DOC_TYPES, CATEGORIES, ACCESS_LEVELS, FILE_TYPES, MAX_UPLOAD_BYTES, UPLOAD_DIR,
} from '../data/documentsStore.js';
import { schools, buildings, findSchool, findBuilding } from '../data/store.js';
import { logAudit, getEntries, currentUser } from '../data/auditStore.js';
import { notify } from '../data/notificationsStore.js';
import { publicView } from '../data/integrationsStore.js';

// Looked up live so schools added in the app are found
const schoolById = { get: (id) => findSchool(id), has: (id) => Boolean(findSchool(id)) };
// Looked up live so buildings added in the app are found
const buildingById = { get: (id) => findBuilding(id) };

function filterDocs({ q, category, school, building, type, year, source }) {
  const term = q?.trim().toLowerCase();
  const catTypes = CATEGORIES[category];
  return getDocuments().filter((d) =>
    (!catTypes || catTypes.includes(d.type))
    && (!school || (school === 'district' ? !d.schoolId : d.schoolId === school))
    && (!building || d.buildingId === building)
    && (!type || d.type === type)
    && (!year || d.uploadedAt.startsWith(year))
    && (!source || d.source === source)
    && (!term || [d.name, d.type, d.schoolName, d.buildingName, d.relatedTo, d.uploadedBy?.name, d.id]
      .some((v) => v?.toLowerCase().includes(term))));
}

const router = Router();

// GET /api/documents?q=&category=&school=&building=&type=&year=&source=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterDocs(req.query).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const all = getDocuments();
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    // KPI cards describe the whole library, not the current filter
    stats: {
      total: all.length,
      sharepoint: all.filter((d) => d.source === 'sharepoint').length,
      thisMonth: all.filter((d) => d.uploadedAt.startsWith(monthPrefix)).length,
      restricted: all.filter((d) => d.access === 'Restricted').length,
    },
    documents: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

router.get('/facets', (req, res) => {
  const years = [...new Set(getDocuments().map((d) => d.uploadedAt.slice(0, 4)))].sort().reverse();
  res.json({
    types: DOC_TYPES,
    categories: Object.keys(CATEGORIES),
    accessLevels: ACCESS_LEVELS,
    years,
    allowedExtensions: Object.keys(FILE_TYPES),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    sharepoint: (({ status, lastSync, config }) => ({ connected: status === 'connected', status, lastSync, siteUrl: config.siteUrl ?? null }))(publicView('sharepoint')),
  });
});

/**
 * Upload: raw file body, metadata in the query string.
 * POST /api/documents?name=&type=&schoolId=&buildingId=&relatedTo=&access=
 */
router.post('/', express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res, next) => {
  try {
    const errors = {};
    const name = String(req.query.name ?? '').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150);
    const ext = path.extname(name).slice(1).toLowerCase();
    const { type, schoolId = '', buildingId = '', relatedTo = '', access = 'Internal' } = req.query;
    const size = req.body?.length ?? 0;

    if (!name) errors.name = 'File name is required';
    else if (!FILE_TYPES[ext]) errors.file = `Unsupported file type .${ext || '?'} (allowed: ${Object.keys(FILE_TYPES).join(', ')})`;
    if (!size) errors.file = errors.file ?? 'The file is empty';
    if (!DOC_TYPES.includes(type)) errors.type = 'Choose a document type';
    if (!ACCESS_LEVELS.includes(access)) errors.access = 'Choose an access level';
    if (schoolId && !schoolById.has(schoolId)) errors.schoolId = 'Unknown school';
    const building = buildingId ? buildingById.get(buildingId) : null;
    if (buildingId && (!building || building.schoolId !== schoolId)) errors.buildingId = 'Building does not belong to that school';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid upload', fields: errors });

    const id = nextId();
    const storedName = `${id}.${ext}`;
    await writeFile(path.join(UPLOAD_DIR, storedName), req.body);
    const school = schoolById.get(schoolId);
    const doc = await addDocument({
      id,
      name,
      type,
      ext,
      mime: FILE_TYPES[ext],
      size,
      schoolId: schoolId || null,
      schoolName: school?.name ?? null,
      buildingId: building?.id ?? null,
      buildingName: building?.name ?? null,
      relatedTo: String(relatedTo).trim() || (building ? 'Building' : school ? 'School' : 'District'),
      access,
      source: 'upload',
      storedName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: { id: currentUser().id, name: currentUser().name },
      sample: false,
    });
    logAudit(req, {
      action: 'create', module: 'Document', recordId: id, link: '/documents',
      summary: `Uploaded document – ${name}`,
      changes: [
        { field: 'File', to: name }, { field: 'Type', to: type }, { field: 'Access', to: access },
        { field: 'Size', to: `${Math.round(size / 1024)} KB` },
      ],
      related: { school: doc.schoolName, building: doc.buildingName },
    });
    notify({
      type: type === 'Management Plan' ? 'compliance' : 'other',
      priority: access === 'Restricted' ? 'medium' : 'low',
      title: 'New Document Uploaded',
      message: `${name} (${type}) was added${doc.schoolName ? ` for ${doc.schoolName}` : ''}.`,
      schoolId: doc.schoolId, schoolName: doc.schoolName, buildingName: doc.buildingName,
      link: `/documents`, linkLabel: 'View Documents',
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const activity = getEntries().filter((e) => e.recordId === doc.id).slice(0, 20)
    .map(({ id, at, action, summary, user }) => ({ id, at, action, summary, user: user.name }));
  res.json({ ...doc, hasFile: Boolean(storedFilePath(doc)), activity });
});

// Serve the stored file inline (preview) or as a download (?download=1)
router.get('/:id/file', (req, res) => {
  const doc = getDocument(req.params.id);
  const file = storedFilePath(doc);
  if (!file) return res.status(404).json({ error: doc ? 'No file is stored for this sample record' : 'Document not found' });
  const download = req.query.download === '1';
  if (download) {
    logAudit(req, { action: 'export', module: 'Document', recordId: doc.id, summary: `Downloaded document – ${doc.name}`, link: '/documents' });
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(doc.mime);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
  res.sendFile(file);
});

router.delete('/:id', async (req, res, next) => {
  try {
    const doc = getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await removeDocument(doc.id);
    logAudit(req, {
      action: 'delete', module: 'Document', recordId: doc.id,
      summary: `Deleted document – ${doc.name}`,
      changes: [{ field: 'File', from: doc.name, to: '(deleted)' }, { field: 'Type', from: doc.type, to: '(deleted)' }],
      related: { school: doc.schoolName, building: doc.buildingName },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
