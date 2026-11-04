import { existsSync, readFileSync } from 'node:fs';
import { schools, getSchoolBuildings } from './store.js';
import { writeJson } from './atomicWrite.js';

const FILE = new URL('../../data/inspections.json', import.meta.url);
const DAY = 86400000;

// AHERA rules used to derive status
export const DUE_SOON_DAYS = 30; // school is "due soon" if an inspection is due within this window
const INSPECTION_DUE_SOON_DAYS = 14; // an individual inspection shows "Due Soon" in the calendar
export const SURVEILLANCE_INTERVAL_DAYS = 182; // periodic surveillance every 6 months

let inspections = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).inspections : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { inspections }));
  return writing;
};

// Dates are local calendar days ("YYYY-MM-DD"), compared at local midnight
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayMs = (iso) => Date.parse(`${iso}T00:00:00`);
export const localIsoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// completed | overdue | dueSoon | scheduled
export function inspectionStatus(i, today = startOfToday()) {
  if (i.completedAt) return 'completed';
  const d = dayMs(i.scheduledDate);
  if (d < today) return 'overdue';
  if (d <= today + INSPECTION_DUE_SOON_DAYS * DAY) return 'dueSoon';
  return 'scheduled';
}

// booked: an inspector and date are confirmed — completed, booked with Schedule, or far enough ahead to count as
// scheduled. Due-soon / overdue inspections nobody has booked still need scheduling.
export const withStatus = (i) => {
  const status = inspectionStatus(i);
  return { ...i, status, booked: status === 'completed' || status === 'scheduled' || Boolean(i.bookedAt) };
};
export const getInspections = () => inspections.map(withStatus);
export const getInspection = (id) => {
  const i = inspections.find((x) => x.id === id);
  return i ? withStatus(i) : null;
};

// Stable sample ACM location count per school (until an ACM inventory exists)
function sampleAcmCount(schoolId) {
  let h = 7;
  for (const ch of schoolId) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return 12 + (h % 70);
}

// compliant | dueSoon | overdue (= Non-Compliant)
export function schoolCompliance(schoolId) {
  const today = startOfToday();
  const mine = inspections.filter((i) => i.schoolId === schoolId);
  const open = mine.filter((i) => !i.completedAt).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const done = mine.filter((i) => i.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  let status = 'compliant';
  if (open.some((i) => dayMs(i.scheduledDate) < today)) status = 'overdue';
  else if (open.some((i) => dayMs(i.scheduledDate) <= today + DUE_SOON_DAYS * DAY)) status = 'dueSoon';
  return {
    status,
    lastInspection: done[0]?.completedAt ?? null,
    nextDue: open[0]?.scheduledDate ?? null,
    nextInspectionId: open[0]?.id ?? null,
    openCount: open.length,
  };
}

export function schoolRows() {
  return schools.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    location: s.location,
    buildings: getSchoolBuildings(s.id).length,
    acmLocations: sampleAcmCount(s.id),
    ...schoolCompliance(s.id),
  }));
}

export async function completeInspection(id, notes = '') {
  const i = inspections.find((x) => x.id === id);
  i.completedAt = new Date().toISOString();
  if (notes) i.notes = notes;
  // AHERA periodic surveillance: book the next one 6 months out unless one is already scheduled
  let next = null;
  const hasFuture = inspections.some((x) => x.schoolId === i.schoolId && !x.completedAt && x.type === '6-Month Surveillance');
  if (!hasFuture) {
    const seq = inspections.reduce((m, x) => Math.max(m, Number(x.id.slice(5)) || 0), 0) + 1;
    next = {
      ...i,
      id: `INSP-${String(seq).padStart(5, '0')}`,
      type: '6-Month Surveillance',
      scheduledDate: localIsoDay(startOfToday() + SURVEILLANCE_INTERVAL_DAYS * DAY),
      completedAt: null,
      notes: '',
      priority: 'medium',
      sample: false,
    };
    inspections.push(next);
  }
  await persist();
  return { inspection: withStatus(i), next: next && withStatus(next) };
}

// Book an inspection: its date and inspector (recorded as booked by whom and when)
export async function bookInspection(id, { date, inspectorId, inspectorName, by }) {
  const i = inspections.find((x) => x.id === id);
  const before = { date: i.scheduledDate, inspector: i.inspectorName };
  Object.assign(i, { scheduledDate: date, inspectorId, inspectorName, bookedAt: new Date().toISOString(), bookedBy: by });
  await persist();
  return { inspection: withStatus(i), before };
}

export async function rescheduleInspection(id, date) {
  const i = inspections.find((x) => x.id === id);
  const from = i.scheduledDate;
  i.scheduledDate = date;
  await persist();
  return { inspection: withStatus(i), from };
}
