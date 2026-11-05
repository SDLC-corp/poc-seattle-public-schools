import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';

const FILE = new URL('../../data/airMonitoring.json', import.meta.url);

export const SAMPLE_TYPES = ['Clearance', 'Area', 'Personal', 'Background', 'Excursion'];
export const METHODS = {
  PCM: { label: 'PCM (NIOSH 7400)', unit: 'f/cc' },
  TEM: { label: 'TEM (AHERA)', unit: 's/mm²' },
};

/**
 * Limit a result is judged against.
 * - TEM clearance (AHERA, 40 CFR 763 App. A): 70 structures/mm²
 * - PCM personal / excursion (OSHA 29 CFR 1926.1101): PEL 0.1 f/cc (8-hr TWA), excursion 1.0 f/cc (30 min)
 * - PCM area / clearance / background: 0.01 f/cc action level (AHERA PCM clearance level)
 */
export function limitFor(type, method) {
  if (method === 'TEM') return { value: 70, unit: 's/mm²', basis: 'AHERA TEM clearance (70 s/mm²)' };
  if (type === 'Personal') return { value: 0.1, unit: 'f/cc', basis: 'OSHA PEL, 8-hr TWA' };
  if (type === 'Excursion') return { value: 1.0, unit: 'f/cc', basis: 'OSHA excursion limit, 30 min' };
  return { value: 0.01, unit: 'f/cc', basis: 'Action level (PCM clearance)' };
}

// compliant | exceedance | pending — always derived, never stored
export function statusOf(e) {
  if (e.result === null || e.result === undefined) return 'pending';
  return e.result > limitFor(e.type, e.method).value ? 'exceedance' : 'compliant';
}

export const withDerived = (e) => ({ ...e, limit: limitFor(e.type, e.method), status: statusOf(e) });

let events = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')).events : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { events }));
  return writing;
};

export const getEvents = () => events.map(withDerived);
export const getEvent = (id) => {
  const e = events.find((x) => x.id === id);
  return e ? withDerived(e) : null;
};

export function nextId() {
  const year = new Date().getFullYear();
  const n = events.filter((e) => e.id.startsWith(`AM-${year}-`))
    .reduce((m, e) => Math.max(m, Number(e.id.split('-')[2]) || 0), 0) + 1;
  return `AM-${year}-${String(n).padStart(3, '0')}`;
}

export async function addEvent(e) {
  events = [e, ...events];
  await persist();
  return withDerived(e);
}

export async function updateEvent(id, patch) {
  events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
  await persist();
  return getEvent(id);
}
