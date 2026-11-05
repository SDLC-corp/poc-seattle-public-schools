import { existsSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { uploadDir } from './paths.js';
import { writeJson, readPath } from './atomicWrite.js';

// Detailed per-ACM inspection records (inspection form). Separate from data/inspections.json,
// which holds the building-level inspection *schedule* used by Compliance.
const FILE = new URL('../../data/inspectionRecords.json', import.meta.url);
export const FILE_DIR = uploadDir('inspections');

let records = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')).records : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Detailed ACM inspection records (sample + app)', records }));
  return writing;
};

export const getRecords = () => records;
export const getRecord = (id) => records.find((x) => x.id === id) ?? null;
export const filePath = (storedName) => path.join(FILE_DIR, storedName);

// INS-<year>-<5-digit sequence>
export function nextId(year = new Date().getFullYear()) {
  const prefix = `INS-${year}-`;
  const n = records.filter((r) => r.id.startsWith(prefix)).reduce((m, r) => Math.max(m, Number(r.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(n + 1).padStart(5, '0')}`;
}

export async function addRecord(r) {
  const rec = { ...r, id: nextId(Number(r.date?.slice(0, 4)) || undefined) };
  records.push(rec);
  await persist();
  return rec;
}

export async function updateRecord(id, patch) {
  const r = records.find((x) => x.id === id);
  Object.assign(r, patch, { updatedAt: new Date().toISOString() });
  await persist();
  return r;
}

export async function removeRecord(id) {
  const r = getRecord(id);
  records = records.filter((x) => x.id !== id);
  await persist();
  await Promise.all((r?.attachments ?? []).map((f) => unlink(filePath(f.storedName)).catch(() => {})));
}

export async function addAttachment(id, file) {
  getRecord(id).attachments.push(file);
  await persist();
}

export async function removeAttachment(id, fileId) {
  const r = getRecord(id);
  const f = r.attachments.find((x) => x.id === fileId);
  r.attachments = r.attachments.filter((x) => x.id !== fileId);
  await persist();
  if (f) await unlink(filePath(f.storedName)).catch(() => {});
}
