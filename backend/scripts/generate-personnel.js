// Generates SAMPLE personnel + training records → data/personnel.json.
// Fictional names. EHS managers, inspectors and contractor supervisors reuse the sample users
// from data/users.json; custodial/maintenance staff and abatement workers are generated here.
// People added in the app (sample: false) are kept; previous samples are replaced.
// Usage: npm run generate:personnel
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { CATEGORIES, programById } from '../src/data/trainingPrograms.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const FILE = new URL('../data/personnel.json', import.meta.url);
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
const rand = rng('sps-personnel');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));

const FIRST = ['Alex', 'Blake', 'Cameron', 'Drew', 'Elliot', 'Frankie', 'Gray', 'Hollis', 'Jesse', 'Kai', 'Lane', 'Micah', 'Noel', 'Oakley', 'Peyton', 'Remy', 'Sage', 'Tatum', 'Wren', 'Zion', 'Ada', 'Bruno', 'Celia', 'Dmitri', 'Esme', 'Farid', 'Gloria', 'Hugo', 'Imani', 'Jonas'];
const LAST = ['Ashby', 'Bramble', 'Coldwell', 'Dorsey', 'Ellison', 'Fairley', 'Gentry', 'Hatcher', 'Iverson', 'Jardine', 'Kinsley', 'Lowry', 'Maddox', 'Nolan', 'Orwell', 'Prescott', 'Quimby', 'Rowland', 'Selby', 'Tolliver'];
const used = new Set();
const uniqueName = () => {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
};

const { schools } = read('schools.json');
const { users } = read('users.json');
users.forEach((u) => used.add(u.name));
const today = Date.now();
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addMonths = (iso, m) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + m);
  return isoDay(d);
};

// Bias: most people current, some due within 60 days, a few expired
function completionDate(renewalMonths) {
  if (!renewalMonths) return isoDay(today - num(200, 2000) * DAY);
  const r = rand();
  const span = renewalMonths * 30;
  let ageDays;
  if (r < 0.72) ageDays = num(20, span - 75); // current, > 60 days left
  else if (r < 0.88) ageDays = num(span - 55, span - 5); // due within 60 days
  else ageDays = num(span + 5, span + 160); // expired
  return isoDay(today - ageDays * DAY);
}

let seq = 0;
const people = [];
function addPerson({ name, category, organization, email, phone, schoolId, userId = null }) {
  const cat = CATEGORIES[category];
  const school = schools.find((s) => s.id === schoolId);
  const records = cat.required
    // ~5% are missing one required course entirely
    .filter(() => rand() > 0.05)
    .map((programId) => {
      const p = programById[programId];
      const completedOn = completionDate(p.renewalMonths);
      return {
        programId,
        completedOn,
        expiresOn: p.renewalMonths ? addMonths(completedOn, p.renewalMonths) : null,
        certificateNo: p.accredited ? `WA-${programId.slice(0, 3).toUpperCase()}-${num(10000, 99999)}` : null,
        provider: p.accredited ? pick(['Accredited Training Provider A', 'Accredited Training Provider B']) : 'SPS EHS Training',
      };
    });
  people.push({
    id: `P-${String(++seq).padStart(4, '0')}`,
    name, category, organization,
    email: email ?? null, phone: phone ?? `(206) 555-${num(1000, 9999)}`,
    schoolId: school?.id ?? null, schoolName: school?.name ?? null,
    userId, status: 'active', records, sample: true,
  });
}

for (const u of users.filter((x) => x.roleId === 'ehs-manager')) {
  addPerson({ name: u.name, category: 'employee-ehs', organization: 'Seattle Public Schools', email: u.email, phone: u.phone, userId: u.id });
}
for (const u of users.filter((x) => x.roleId === 'inspector')) {
  addPerson({ name: u.name, category: 'inspector', organization: 'Consulting Inspection Firm (sample)', email: u.email, phone: u.phone, userId: u.id });
}
for (const u of users.filter((x) => x.roleId === 'contractor')) {
  addPerson({ name: u.name, category: 'contractor-supervisor', organization: 'Abatement Contractor (sample)', email: u.email, phone: u.phone, userId: u.id });
}
for (let i = 0; i < 14; i++) {
  addPerson({ name: uniqueName(), category: 'contractor-worker', organization: 'Abatement Contractor (sample)' });
}
for (let i = 0; i < 28; i++) {
  addPerson({ name: uniqueName(), category: 'employee-maintenance', organization: 'Seattle Public Schools', schoolId: pick(schools).id });
}
for (let i = 0; i < 70; i++) {
  addPerson({ name: uniqueName(), category: 'employee-custodial', organization: 'Seattle Public Schools', schoolId: pick(schools).id });
}

const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).people : [];
const real = existing.filter((p) => !p.sample);
await writeFile(FILE, JSON.stringify({ people: [...real, ...people] }, null, 2));
console.log(`Wrote ${real.length + people.length} personnel (${real.length} added in the app, ${people.length} sample)`);
