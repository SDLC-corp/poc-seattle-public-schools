import { Router } from 'express';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeJson, readPath } from '../data/atomicWrite.js';
import { getRecords as getInspectionRecords, filePath as inspectionFilePath } from '../data/inspectionRecordsStore.js';
import { getDocuments, storedFilePath } from '../data/documentsStore.js';
import { REPORTS } from '../data/reports.js';
import { schools } from '../data/store.js';
import { logAudit, currentUser } from '../data/auditStore.js';

/**
 * SharePoint folder sync. The browser does the SharePoint work with the signed-in user's Microsoft Graph token
 * (delegated Files.ReadWrite.All): it creates "Seattle Public Schools" with a folder per kind of file, then uploads
 * what this API lists. The server only lists the files, remembers what was uploaded (so unchanged files are skipped)
 * and keeps the run history. Nothing here talks to Microsoft.
 */
const FILE = new URL('../../data/sharepointSync.json', import.meta.url);
const INVOICE_DIR = new URL('../../data/invoices/', import.meta.url);
export const ROOT_FOLDER = 'Seattle Public Schools';
export const FOLDERS = ['Inspections', 'Invoices', 'Reports', 'Documents'];
const RUNS = 10;

let state = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : { target: null, synced: {}, runs: [] };
const save = () => writeJson(FILE, state);

// SharePoint doesn't allow " * : < > ? / \ | in names, nor leading/trailing dots or spaces
const safe = (s) => String(s ?? '').replace(/["*:<>?/\\|#%]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 120) || 'file';
const schoolName = (id) => schools.find((s) => s.id === id)?.name ?? id ?? '';

/** Every file to put in SharePoint: { key, version, folder (path under the root), name, href (this API), size } */
function manifest() {
  const items = [];
  // Inspections: each inspection's attachments in its own folder ("INS-2026-00159 – School")
  for (const r of getInspectionRecords()) {
    for (const f of r.attachments ?? []) {
      if (!f.storedName || !existsSync(inspectionFilePath(f.storedName))) continue;
      items.push({
        key: `inspection:${r.id}:${f.id}`, version: f.id, folder: `Inspections/${safe(`${r.id} – ${schoolName(r.schoolId)}`)}`,
        name: safe(f.name), href: `/inspection-records/records/${r.id}/attachments/${f.id}?download=1`, size: f.size ?? null,
      });
    }
  }
  // Invoices: the contractor invoice PDFs
  const invoices = JSON.parse(readFileSync(new URL('invoices.json', INVOICE_DIR), 'utf8')).invoices ?? [];
  for (const inv of invoices) {
    const file = inv.pdf_file && new URL(inv.pdf_file, INVOICE_DIR);
    if (!file || !file.href.startsWith(new URL('pdf/', INVOICE_DIR).href) || !existsSync(file)) continue;
    const st = statSync(fileURLToPath(file));
    items.push({
      key: `invoice:${inv.invoice_number}`, version: `${st.size}-${Math.round(st.mtimeMs)}`, folder: `Invoices/${safe(String(inv.invoice_date ?? '').slice(0, 4) || 'Undated')}`,
      name: `${safe(inv.invoice_number)}.pdf`, href: `/cost-invoices/${encodeURIComponent(inv.invoice_number)}/pdf?download=1`, size: st.size,
    });
  }
  // Reports: every Reports & Analytics report as CSV, refreshed once a day
  const day = new Date().toISOString().slice(0, 10);
  for (const [id, r] of Object.entries(REPORTS)) {
    items.push({ key: `report:${id}`, version: day, folder: 'Reports', name: `${safe(r.title)}.csv`, href: `/reports/${id}/export.csv`, size: null });
  }
  // Documents: Document Management files, by document type
  for (const d of getDocuments()) {
    if (!storedFilePath(d)) continue;
    items.push({
      key: `document:${d.id}`, version: d.uploadedAt, folder: `Documents/${safe(d.type || 'Other')}`,
      name: safe(d.name), href: `/documents/${d.id}/file`, size: d.size ?? null,
    });
  }
  return items.map((x) => ({ ...x, synced: state.synced[x.key] === x.version }));
}

const router = Router();

// GET /sharepoint-sync — the chosen SharePoint location, recent runs and what's waiting to be uploaded
router.get('/', (req, res) => {
  const items = manifest();
  const count = (folder) => items.filter((x) => x.folder.split('/')[0] === folder);
  res.json({
    rootFolder: ROOT_FOLDER, folders: FOLDERS, target: state.target, runs: state.runs,
    summary: FOLDERS.map((f) => ({ folder: f, total: count(f).length, pending: count(f).filter((x) => !x.synced).length })),
  });
});

router.get('/manifest', (req, res) => res.json({ rootFolder: ROOT_FOLDER, folders: FOLDERS, items: manifest() }));

// PUT /sharepoint-sync/target — where the folder was created { siteId, siteName, driveId, driveName, folderId, webUrl }
router.put('/target', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const str = (k, max = 300) => (typeof b[k] === 'string' ? b[k].trim().slice(0, max) : '');
    if (b.clear) {
      state = { ...state, target: null, synced: {} };
      await save();
      logAudit(req, { action: 'update', module: 'Integrations', recordId: 'sharepoint-sync', summary: 'Removed the SharePoint sync location' });
      return res.json({ target: null });
    }
    const target = { siteId: str('siteId'), siteName: str('siteName', 120), driveId: str('driveId'), driveName: str('driveName', 120), folderId: str('folderId'), webUrl: str('webUrl', 500) };
    if (!target.siteId || !target.driveId || !target.folderId) return res.status(400).json({ error: 'Choose a SharePoint site and library first' });
    if (!/^https:\/\/[^/]+\.sharepoint\.com\//i.test(target.webUrl)) return res.status(400).json({ error: 'The folder link must be a SharePoint address' });
    const me = currentUser();
    // A new location starts empty, so everything is uploaded again
    const moved = state.target?.folderId !== target.folderId;
    state = { ...state, target: { ...target, setAt: new Date().toISOString(), setBy: { id: me.id, name: me.name } }, synced: moved ? {} : state.synced };
    await save();
    logAudit(req, { action: 'update', module: 'Integrations', recordId: 'sharepoint-sync', summary: `SharePoint sync folder set to ${target.siteName} › ${target.driveName} › ${ROOT_FOLDER}` });
    res.json({ target: state.target });
  } catch (err) {
    next(err);
  }
});

// POST /sharepoint-sync/runs { uploaded: [{ key, version }], failed: [{ key, error }], skipped, durationMs }
router.post('/runs', async (req, res, next) => {
  try {
    if (!state.target) return res.status(400).json({ error: 'Set the SharePoint folder first' });
    const known = new Map(manifest().map((x) => [x.key, x]));
    const uploaded = (Array.isArray(req.body?.uploaded) ? req.body.uploaded : []).filter((u) => known.has(u?.key) && known.get(u.key).version === u.version);
    const failed = (Array.isArray(req.body?.failed) ? req.body.failed : []).slice(0, 200).map((f) => ({ key: String(f?.key ?? '').slice(0, 200), error: String(f?.error ?? '').slice(0, 300) }));
    for (const u of uploaded) state.synced[u.key] = u.version;
    const me = currentUser();
    const run = {
      at: new Date().toISOString(), by: me.name, uploaded: uploaded.length, failed: failed.length,
      skipped: Number(req.body?.skipped) || 0, durationMs: Number(req.body?.durationMs) || null, errors: failed.slice(0, 5),
    };
    state.runs = [run, ...(state.runs ?? [])].slice(0, RUNS);
    await save();
    logAudit(req, {
      action: 'export', module: 'Integrations', recordId: 'sharepoint-sync',
      summary: `Synced to SharePoint (${state.target.siteName} › ${ROOT_FOLDER}): ${run.uploaded} uploaded, ${run.skipped} unchanged${run.failed ? `, ${run.failed} failed` : ''}`,
    });
    res.json({ run });
  } catch (err) {
    next(err);
  }
});

export default router;
