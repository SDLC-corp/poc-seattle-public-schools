import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DOCS_FILE = new URL('../../data/documents.json', import.meta.url);
export const UPLOAD_DIR = fileURLToPath(new URL('../../uploads/', import.meta.url));
mkdirSync(UPLOAD_DIR, { recursive: true });

export const DOC_TYPES = [
  'Management Plan', 'Inspection Report', 'Lab Report', 'Floor Plan', 'Training Record', 'Notification',
  'Photo', 'O&M Record', 'Air Monitoring', 'Response Action', 'Other',
];

// Tabs on the screen: category slug → document types
export const CATEGORIES = {
  'management-plans': ['Management Plan'],
  'inspection-reports': ['Inspection Report'],
  'lab-reports': ['Lab Report'],
  'floor-plans': ['Floor Plan'],
  'training-records': ['Training Record'],
  notifications: ['Notification'],
  other: ['Photo', 'O&M Record', 'Air Monitoring', 'Response Action', 'Other'],
};

export const ACCESS_LEVELS = ['Public', 'Internal', 'Restricted'];

// Allowed uploads (by extension) and the content type they're served with
export const FILE_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
};
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

let docs = existsSync(DOCS_FILE) ? JSON.parse(readFileSync(DOCS_FILE, 'utf8')).documents : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeFile(DOCS_FILE, JSON.stringify({ documents: docs }, null, 2)));
  return writing;
};

export const getDocuments = () => docs;
export const getDocument = (id) => docs.find((d) => d.id === id);

// Absolute path of a stored upload, refusing anything that would escape the uploads folder
export function storedFilePath(doc) {
  if (!doc?.storedName) return null;
  const full = path.join(UPLOAD_DIR, doc.storedName);
  return full.startsWith(UPLOAD_DIR) && existsSync(full) ? full : null;
}

let seq = docs.filter((d) => d.id.startsWith('DOC-')).reduce((n, d) => Math.max(n, Number(d.id.slice(4)) || 0), 0);
export const nextId = () => `DOC-${String(++seq).padStart(6, '0')}`;

export async function addDocument(doc) {
  docs = [doc, ...docs];
  await persist();
  return doc;
}

export async function removeDocument(id) {
  const doc = getDocument(id);
  const file = storedFilePath(doc);
  docs = docs.filter((d) => d.id !== id);
  await persist();
  if (file) await unlink(file).catch(() => {});
}
