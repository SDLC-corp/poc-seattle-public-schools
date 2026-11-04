import { existsSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { uploadDir } from './paths.js';
import { writeJson } from './atomicWrite.js';

// Operations & Maintenance: activities (work orders), O&M plans and procedures (SOPs)
const FILE = new URL('../../data/om.json', import.meta.url);
export const FILE_DIR = uploadDir('om');

const empty = { activities: [], plans: [], procedures: [] };
let db = existsSync(FILE) ? { ...empty, ...JSON.parse(readFileSync(FILE, 'utf8')) } : empty;
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Operations & Maintenance (sample + app)', activities: db.activities, plans: db.plans, procedures: db.procedures }));
  return writing;
};

export const filePath = (storedName) => path.join(FILE_DIR, storedName);
export const all = (kind) => db[kind];
export const find = (kind, id) => db[kind].find((x) => x.id === id) ?? null;

// OM-<year>-<4-digit sequence> and SOP-<3-digit sequence>
export function nextActivityId(year = new Date().getFullYear()) {
  const prefix = `OM-${year}-`;
  const n = db.activities.filter((a) => a.id.startsWith(prefix)).reduce((m, a) => Math.max(m, Number(a.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}
export function nextSopId() {
  const n = db.procedures.reduce((m, p) => Math.max(m, Number(p.id.slice(4)) || 0), 0);
  return `SOP-${String(n + 1).padStart(3, '0')}`;
}

export async function add(kind, item) {
  db[kind].push(item);
  await persist();
  return item;
}

export async function update(kind, id, patch) {
  const x = find(kind, id);
  Object.assign(x, patch, { updatedAt: new Date().toISOString() });
  await persist();
  return x;
}

export async function remove(kind, id) {
  const x = find(kind, id);
  db[kind] = db[kind].filter((y) => y.id !== id);
  await persist();
  const files = [...(x?.attachments ?? []), ...(x?.file ? [x.file] : [])];
  await Promise.all(files.map((f) => unlink(filePath(f.storedName)).catch(() => {})));
}

export async function removeFile(kind, id, fileId) {
  const x = find(kind, id);
  const f = x.attachments.find((a) => a.id === fileId);
  x.attachments = x.attachments.filter((a) => a.id !== fileId);
  await persist();
  if (f) await unlink(filePath(f.storedName)).catch(() => {});
}
