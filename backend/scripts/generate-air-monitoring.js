// Generates SAMPLE air monitoring events (last ~6 months) → data/airMonitoring.json.
// Events logged in the app (sample: false) are kept; previous samples are replaced.
// Usage: npm run generate:air
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const FILE = new URL('../data/airMonitoring.json', import.meta.url);
const COUNT = 48;
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
const rand = rng('sps-air');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

const { schools } = read('schools.json');
const { buildings } = read('buildings.json');
const { users } = read('users.json');
const inspectors = users.filter((u) => u.roleId === 'inspector');
const contractors = users.filter((u) => u.roleId === 'contractor');

const PROJECTS = ['Abatement – Classroom Wing', 'Pipe Insulation Removal', 'Floor Tile Removal', 'Boiler Room Encapsulation', 'Ceiling Tile Replacement', 'Gym Renovation'];
const TYPES = [['Clearance', 30], ['Area', 30], ['Personal', 18], ['Background', 14], ['Excursion', 8]];
const typeTotal = TYPES.reduce((n, t) => n + t[1], 0);
const pickType = () => { let r = rand() * typeTotal; return TYPES.find((t) => (r -= t[1]) < 0)[0]; };

// Results near the relevant limit: ~70% compliant, ~22% exceed, rest pending
function result(type, method, recent) {
  if (recent && rand() < 0.6) return null; // lab results not back yet
  const r = rand();
  if (method === 'TEM') return r < 0.75 ? num(5, 65) : num(72, 140);
  const limit = type === 'Personal' ? 0.1 : type === 'Excursion' ? 1.0 : 0.01;
  return round(r < 0.74 ? limit * (0.08 + rand() * 0.88) : limit * (1.1 + rand() * 2.6));
}

function buildSamples() {
  const now = Date.now();
  const year = new Date(now).getFullYear();
  return Array.from({ length: COUNT }, (_, i) => {
    const school = pick(schools);
    const bs = buildings.filter((b) => b.schoolId === school.id);
    const building = bs.length ? pick(bs) : null;
    const type = pickType();
    const method = type === 'Clearance' && rand() < 0.3 ? 'TEM' : 'PCM';
    const daysAgo = num(0, 180);
    const at = new Date(now - daysAgo * DAY);
    at.setHours(num(7, 16), pick([0, 15, 30, 45]), 0, 0);
    const res = result(type, method, daysAgo <= 21);
    return {
      id: `AM-${year}-S${String(i + 1).padStart(3, '0')}`,
      sampledAt: at.toISOString(),
      schoolId: school.id,
      schoolName: school.name,
      buildingId: building?.id ?? null,
      buildingName: building?.name ?? 'Main Building',
      location: pick([`Room ${num(1, 3)}${String(num(1, 40)).padStart(2, '0')}`, 'Gym Floor', 'North Wing', 'Boiler Room', 'Corridor B', 'Basement']),
      type,
      method,
      durationMin: type === 'Excursion' ? 30 : num(120, 480),
      result: res,
      contractorName: pick(contractors)?.name ?? '—',
      inspectorName: pick(inspectors)?.name ?? '—',
      project: pick(PROJECTS),
      notes: res === null ? 'Awaiting laboratory analysis.' : '',
      sample: true,
    };
  });
}

async function main() {
  const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).events : [];
  const real = existing.filter((e) => !e.sample);
  const events = [...real, ...buildSamples()].sort((a, b) => b.sampledAt.localeCompare(a.sampledAt));
  await writeFile(FILE, JSON.stringify({ events }, null, 2));
  console.log(`Wrote ${events.length} air monitoring events (${real.length} logged in the app, ${COUNT} sample)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
