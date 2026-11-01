// Generates a SAMPLE AHERA inspection schedule → data/inspections.json.
// Each school's upcoming surveillance is placed so its derived compliance status matches the
// dashboard's original placeholder split (~68% compliant / 17% due soon / 15% non-compliant).
// Usage: npm run generate:inspections   (replaces the whole schedule, incl. completions done in the app)
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const OUT = new URL('../data/inspections.json', import.meta.url);
const DAY = 86400000;

function rng(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng('sps-inspections');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));

// Same bucketing the dashboard used for its placeholder statuses
function bucket(schoolId) {
  let h = 0;
  for (const ch of schoolId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const b = h % 100;
  return b < 68 ? 'compliant' : b < 85 ? 'dueSoon' : 'overdue';
}

const { schools } = read('schools.json');
const { buildings } = read('buildings.json');
const { users } = read('users.json');
const inspectors = users.filter((u) => u.roleId === 'inspector' && u.status === 'active');

const today = new Date();
today.setHours(0, 0, 0, 0);
// Local calendar date (toISOString would shift to UTC and can land on the previous day)
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const FLOORS = ['First Floor', 'Second Floor', 'Third Floor', 'All Floors', 'Basement'];

let n = 0;
const inspections = [];
function add(school, fields) {
  const bs = buildings.filter((b) => b.schoolId === school.id);
  const building = bs.length ? pick(bs) : null;
  const inspector = pick(inspectors);
  inspections.push({
    id: `INSP-${String(++n).padStart(5, '0')}`,
    schoolId: school.id,
    schoolName: school.name,
    buildingId: building?.id ?? null,
    buildingName: building?.name ?? 'All Buildings',
    floor: pick(FLOORS),
    rooms: num(4, 30),
    inspectorId: inspector?.id ?? null,
    inspectorName: inspector?.name ?? 'Unassigned',
    completedAt: null,
    notes: '',
    sample: true,
    ...fields,
  });
}

for (const school of schools) {
  const status = bucket(school.id);

  // History: completed 6-month surveillances over the last ~2 years
  const lastDaysAgo = num(150, 175);
  for (let k = 3; k >= 0; k--) {
    const t = today.getTime() - (lastDaysAgo + k * 182) * DAY;
    add(school, { type: '6-Month Surveillance', scheduledDate: isoDay(t), completedAt: new Date(t + num(0, 3) * DAY + 14 * 3600000).toISOString(), priority: 'medium' });
  }

  // Next periodic surveillance decides today's status
  const nextOffset = status === 'compliant' ? num(35, 160) : status === 'dueSoon' ? num(2, 28) : -num(3, 45);
  add(school, {
    type: '6-Month Surveillance',
    scheduledDate: isoDay(today.getTime() + nextOffset * DAY),
    priority: status === 'overdue' ? 'high' : status === 'dueSoon' ? 'high' : 'medium',
  });

  // About a third also have a 3-year reinspection coming up (kept outside the 30-day window)
  if (rand() < 0.33) {
    add(school, { type: '3-Year Reinspection', scheduledDate: isoDay(today.getTime() + num(40, 200) * DAY), priority: 'medium' });
  }
}

inspections.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
await writeFile(OUT, JSON.stringify({ inspections }, null, 2));
const counts = schools.reduce((acc, s) => ({ ...acc, [bucket(s.id)]: (acc[bucket(s.id)] ?? 0) + 1 }), {});
console.log(`Wrote ${inspections.length} sample inspections for ${schools.length} schools`, counts);
