import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { CATEGORIES, programById } from './trainingPrograms.js';

const FILE = new URL('../../data/personnel.json', import.meta.url);
export const DUE_SOON_DAYS = 60;
const DAY = 86400000;

let people = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).people : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeFile(FILE, JSON.stringify({ people }, null, 2)));
  return writing;
};

const todayMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayMs = (iso) => Date.parse(`${iso}T00:00:00`);

// valid | dueSoon | expired (per record)
export function recordStatus(r, today = todayMs()) {
  if (!r.expiresOn) return 'valid';
  const t = dayMs(r.expiresOn);
  if (t < today) return 'expired';
  if (t <= today + DUE_SOON_DAYS * DAY) return 'dueSoon';
  return 'valid';
}

/**
 * Person status from their required programs: expired if any required course is missing or
 * lapsed, dueSoon if any expires within 60 days, otherwise compliant.
 */
export function describe(p) {
  const cat = CATEGORIES[p.category];
  const today = todayMs();
  const latest = {};
  for (const r of p.records) {
    if (!latest[r.programId] || r.completedOn > latest[r.programId].completedOn) latest[r.programId] = r;
  }
  const required = cat.required.map((id) => {
    const r = latest[id];
    return { programId: id, programName: programById[id].name, record: r ?? null, status: r ? recordStatus(r, today) : 'missing' };
  });
  const status = required.some((x) => x.status === 'expired' || x.status === 'missing') ? 'expired'
    : required.some((x) => x.status === 'dueSoon') ? 'dueSoon' : 'compliant';
  const dated = required.filter((x) => x.record);
  const lastTraining = dated.map((x) => x.record.completedOn).sort().at(-1) ?? null;
  const nextExpiry = dated.map((x) => x.record.expiresOn).filter(Boolean).sort()[0] ?? null;
  return {
    ...p,
    categoryLabel: cat.label,
    kind: cat.kind,
    required,
    requiredTraining: required.map((x) => programById[x.programId].name.replace(/ \(.*\)$/, '')).join(', '),
    lastTraining,
    nextExpiry,
    trainingStatus: status,
  };
}

export const getPeople = () => people.map(describe);
export const getPerson = (id) => {
  const p = people.find((x) => x.id === id);
  return p ? describe(p) : null;
};

export function nextId() {
  const n = people.reduce((m, p) => Math.max(m, Number(p.id.slice(2)) || 0), 0) + 1;
  return `P-${String(n).padStart(4, '0')}`;
}

export async function addPerson(p) {
  people = [p, ...people];
  await persist();
  return describe(p);
}

export async function updatePerson(id, patch) {
  people = people.map((p) => (p.id === id ? { ...p, ...patch } : p));
  await persist();
  return getPerson(id);
}

export async function addRecord(id, record) {
  people = people.map((p) => (p.id === id ? { ...p, records: [...p.records, record] } : p));
  await persist();
  return getPerson(id);
}
