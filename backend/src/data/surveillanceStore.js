import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeJson } from './atomicWrite.js';

// Periodic surveillance of known/assumed ACM (AHERA 40 CFR 763.92(b)): one record per material per visit
const FILE = new URL('../../data/surveillance.json', import.meta.url);
export const FILE_DIR = fileURLToPath(new URL('../../uploads/surveillance/', import.meta.url));
mkdirSync(FILE_DIR, { recursive: true });

export const INTERVAL_DAYS = 182; // at least once every six months
export const CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged'];
export const ACTION_STATUSES = ['Open', 'In Progress', 'Closed'];
export const TEAMS = ['EHS – Asbestos Program', 'Facilities – Asbestos Team', 'O&M – Custodial', 'O&M – Maintenance', 'Abatement Contractor', 'Building Administrator'];

let records = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).records : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'ACM periodic surveillance records (sample + app)', records }));
  return writing;
};

/**
 * draft — saved but not recorded; actionRequired — recorded, corrective action needed and an item is still open;
 * completed — recorded with nothing outstanding
 */
export function statusOf(r) {
  if (r.state === 'draft') return 'draft';
  if (r.correctiveAction && r.actionItems.some((a) => a.status !== 'Closed')) return 'actionRequired';
  return 'completed';
}

export const withStatus = (r) => ({ ...r, status: statusOf(r) });
export const getRecords = () => records.map(withStatus);
export const getRecord = (id) => {
  const r = records.find((x) => x.id === id);
  return r ? withStatus(r) : null;
};
export const rawRecord = (id) => records.find((x) => x.id === id) ?? null;
export const filePath = (storedName) => path.join(FILE_DIR, storedName);

export function nextId(year = new Date().getFullYear()) {
  const prefix = `SUR-${year}-`;
  const n = records.filter((r) => r.id.startsWith(prefix)).reduce((m, r) => Math.max(m, Number(r.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

export async function addRecord(r) {
  const rec = { ...r, id: nextId(Number(r.date?.slice(0, 4)) || undefined) };
  records.push(rec);
  await persist();
  return withStatus(rec);
}

export async function updateRecord(id, patch) {
  const r = records.find((x) => x.id === id);
  Object.assign(r, patch, { updatedAt: new Date().toISOString() });
  await persist();
  return withStatus(r);
}

export async function removeRecord(id) {
  const r = records.find((x) => x.id === id);
  records = records.filter((x) => x.id !== id);
  await persist();
  await Promise.all((r?.attachments ?? []).map((f) => unlink(filePath(f.storedName)).catch(() => {})));
}

export async function addAttachment(id, file) {
  records.find((x) => x.id === id).attachments.push(file);
  await persist();
}

export async function removeAttachment(id, fileId) {
  const r = records.find((x) => x.id === id);
  const f = r.attachments.find((x) => x.id === fileId);
  r.attachments = r.attachments.filter((x) => x.id !== fileId);
  await persist();
  if (f) await unlink(filePath(f.storedName)).catch(() => {});
}
