import { existsSync, readFileSync } from 'node:fs';
import { writeJson } from './atomicWrite.js';

const AUDIT_FILE = new URL('../../data/audit.json', import.meta.url);

// No authentication yet: everything done through the app is attributed to the demo user
// shown in the top bar. Replace with the signed-in user once auth exists.
export const CURRENT_USER = { id: 'demo', name: 'John Doe', email: 'john.doe@seattleschools.org', role: 'EHS Manager' };

export const ACTIONS = ['create', 'update', 'delete', 'login', 'logout', 'login_failed', 'export'];

let entries = existsSync(AUDIT_FILE) ? JSON.parse(readFileSync(AUDIT_FILE, 'utf8')).entries : [];

// Serialise writes so concurrent requests can't interleave file writes
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(AUDIT_FILE, { entries })).catch(() => {});
  return writing;
};

export const getEntries = () => entries;
export const getEntry = (id) => entries.find((e) => e.id === id);

// Real entries are numbered AUD-000001…; sample entries use their own SAMPLE- ids
let seq = entries
  .filter((e) => e.id.startsWith('AUD-'))
  .reduce((n, e) => Math.max(n, Number(e.id.slice(4)) || 0), 0);

const clientIp = (req) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '';
  return ip.replace(/^::ffff:/, '') || 'unknown';
};

/**
 * Record an activity. `changes` is [{ field, from, to }] (omit `from` for creates).
 * `related` is optional context such as { school, building, room }.
 */
export function logAudit(req, { action, module, recordId, summary, changes = [], related = null, link = null }) {
  const entry = {
    id: `AUD-${String(++seq).padStart(6, '0')}`,
    at: new Date().toISOString(),
    action,
    module,
    recordId,
    summary,
    changes,
    related,
    link,
    user: CURRENT_USER,
    ip: req ? clientIp(req) : 'system',
    source: 'app',
  };
  entries = [entry, ...entries];
  persist();
  return entry;
}

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const show = (v) => {
  if (Array.isArray(v)) return v.join(', ') || '(none)';
  if (typeof v === 'string' && v.startsWith('data:image/')) return '(image)';
  if (v === '' || v === null || v === undefined) return '(empty)';
  return String(v);
};

// Field-level differences between two objects (nested objects are flattened to dot paths)
export function diff(before, after, prefix = '') {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out = [];
  for (const key of keys) {
    const a = before?.[key];
    const b = after?.[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(a) || isPlainObject(b)) out.push(...diff(a, b, path));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: path, from: show(a), to: show(b) });
  }
  return out;
}

// Field list for a newly created record
export const snapshot = (obj, fields) => fields
  .filter((f) => obj[f] !== undefined)
  .map((f) => ({ field: f, to: show(obj[f]) }));
