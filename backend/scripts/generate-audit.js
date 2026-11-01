// Generates SAMPLE audit history (last 90 days) → data/audit.json.
// Real entries recorded by the app (source: "app") are kept; previous samples are replaced.
// Actors are the fictional sample users; schools are the real school list.
// Usage: npm run generate:audit
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const AUDIT_FILE = new URL('../data/audit.json', import.meta.url);
const COUNT = 950;
const DAYS = 90;

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
const rand = rng('sps-audit');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));
const id = (prefix, digits = 6) => `${prefix}-${String(num(1, 10 ** digits - 1)).padStart(digits, '0')}`;

const { schools } = read('schools.json');
const { users } = read('users.json');
const { buildings } = read('buildings.json');
const byRole = (roleId) => users.filter((u) => u.roleId === roleId);
const actor = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.jobTitle });

const MATERIALS = ['Ceiling Tile', 'Floor Tile', 'Pipe Insulation', 'Duct Insulation', 'Joint Compound', 'Boiler Insulation'];
const CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged'];
const PRIORITY = ['Low', 'Medium', 'High'];
const RESPONSE = ['Repair', 'Encapsulation', 'Enclosure', 'Removal'];
const FILES = ['site-photo', 'floor-plan', 'inspection-report', 'lab-report', 'management-plan', 'old-photo'];

function place() {
  const school = pick(schools);
  const b = buildings.filter((x) => x.schoolId === school.id);
  const building = b.length ? pick(b) : null;
  return {
    school: school.name,
    building: building?.name ?? 'Main Building',
    room: `Room ${num(1, 3)}${String(num(1, 40)).padStart(2, '0')}`,
  };
}

// Each template returns { action, module, recordId, summary, changes, related, link }
const TEMPLATES = [
  { weight: 14, actors: ['facilities-manager', 'inspector', 'ehs-manager'], make: () => {
    const p = place(); const m = pick(MATERIALS);
    return { action: 'create', module: 'ACM Inventory', recordId: id('ACM'), link: '/acm/locations', related: p,
      summary: `Added new ACM record – ${m} (${p.room}, ${p.building})`,
      changes: [
        { field: 'Material Type', to: m }, { field: 'Location', to: `${p.building}, ${p.room}` },
        { field: 'Condition', to: pick(CONDITIONS.slice(0, 2)) }, { field: 'Quantity', to: `${num(20, 900)} sq. ft.` },
      ] };
  } },
  { weight: 12, actors: ['inspector', 'facilities-manager'], make: () => {
    const p = place(); const m = pick(MATERIALS); const [from, to] = pick([['Good', 'Damaged'], ['Damaged', 'Significantly Damaged'], ['Damaged', 'Good']]);
    return { action: 'update', module: 'ACM Inventory', recordId: id('ACM'), link: '/acm/locations', related: p,
      summary: `Updated ACM condition – ${m} (${p.room})`, changes: [{ field: 'Condition', from, to }] };
  } },
  { weight: 12, actors: ['inspector', 'ehs-manager'], make: () => {
    const p = place(); const [from, to] = pick([['Scheduled', 'In Progress'], ['In Progress', 'Completed']]);
    return { action: 'update', module: 'Inspection', recordId: id('INSP'), link: '/inspections/history', related: { school: p.school, building: p.building },
      summary: `Updated inspection status to ${to}`, changes: [{ field: 'Status', from, to }] };
  } },
  { weight: 7, actors: ['ehs-manager'], make: () => {
    const p = place(); const type = pick(['3-Year Reinspection', 'Initial Inspection', 'Periodic Surveillance']);
    return { action: 'create', module: 'Inspection', recordId: id('INSP'), link: '/inspections/upcoming', related: { school: p.school, building: p.building },
      summary: `Scheduled ${type} – ${p.school}`,
      changes: [{ field: 'Type', to: type }, { field: 'School', to: p.school }, { field: 'Building', to: p.building }] };
  } },
  { weight: 7, actors: ['facilities-manager', 'inspector', 'contractor'], make: () => {
    const p = place(); const f = `${pick(FILES)}-${num(1, 99)}.${pick(['jpg', 'pdf', 'png'])}`;
    return { action: 'create', module: 'Attachment', recordId: id('ATT'), link: '/documents', related: p,
      summary: `Uploaded file – ${f}`, changes: [{ field: 'File', to: f }, { field: 'Size', to: `${num(80, 4800)} KB` }] };
  } },
  { weight: 3, actors: ['facilities-manager', 'ehs-manager'], make: () => {
    const p = place(); const f = `${pick(FILES)}-${num(1, 99)}.jpg`;
    return { action: 'delete', module: 'Attachment', recordId: id('ATT'), related: p,
      summary: `Deleted file – ${f}`, changes: [{ field: 'File', from: f, to: '(deleted)' }] };
  } },
  { weight: 6, actors: ['ehs-manager', 'facilities-manager'], make: () => {
    const p = place(); const r = pick(RESPONSE); const pr = pick(PRIORITY);
    return { action: 'create', module: 'Response Action', recordId: id('RA'), link: '/response-actions', related: p,
      summary: `Created response action – ${r} (${pr} Priority)`,
      changes: [{ field: 'Type', to: r }, { field: 'Priority', to: pr }, { field: 'Location', to: `${p.building}, ${p.room}` }] };
  } },
  { weight: 6, actors: ['contractor', 'facilities-manager'], make: () => {
    const p = place(); const [from, to] = pick([['Open', 'In Progress'], ['In Progress', 'Completed']]);
    return { action: 'update', module: 'Response Action', recordId: id('RA'), link: '/response-actions', related: p,
      summary: `Response action marked ${to}`, changes: [{ field: 'Status', from, to }] };
  } },
  { weight: 5, actors: ['inspector', 'ehs-manager'], make: () => {
    const p = place();
    return { action: 'create', module: 'Surveillance', recordId: id('SURV', 5), link: '/surveillance', related: { school: p.school, building: p.building },
      summary: 'Scheduled 6-month surveillance', changes: [{ field: 'Interval', to: '6 months' }, { field: 'School', to: p.school }] };
  } },
  { weight: 5, actors: ['lab-user'], make: () => {
    const p = place(); const res = pick(['Positive (>1% asbestos)', 'Negative', 'Trace (<1%)']);
    return { action: 'create', module: 'Lab Results', recordId: id('LAB'), link: '/sampling/lab-results', related: p,
      summary: `Uploaded lab results – Sample #${p.school.slice(0, 3).toUpperCase()}-2026-${String(num(1, 300)).padStart(3, '0')}`,
      changes: [{ field: 'Result', to: res }, { field: 'Method', to: 'PLM (EPA 600/R-93/116)' }] };
  } },
  { weight: 4, actors: ['facilities-manager', 'ehs-manager'], make: () => {
    const p = place(); const year = num(1995, 2024);
    return { action: 'update', module: 'Building', recordId: id('BLD', 4), link: '/schools/buildings', related: { school: p.school, building: p.building },
      summary: `Updated building details – ${p.building}`, changes: [{ field: 'Last Renovation', from: String(year - num(5, 20)), to: String(year) }] };
  } },
  { weight: 3, actors: ['ehs-manager', 'principal'], make: () => {
    const s = pick(schools);
    return { action: 'update', module: 'School', recordId: `SCH-${s.id}`, link: '/schools/list', related: { school: s.name },
      summary: `Updated school details – ${s.name}`,
      changes: [{ field: 'Emergency Contact', from: `(206) 555-${num(1000, 9999)}`, to: `(206) 555-${num(1000, 9999)}` }] };
  } },
  { weight: 3, actors: ['ehs-manager'], make: () => {
    const s = pick(schools);
    return { action: 'update', module: 'Management Plan', recordId: id('MP', 4), link: '/management-plans', related: { school: s.name },
      summary: `Updated AHERA management plan – ${s.name}`, changes: [{ field: 'Version', from: `v${num(1, 4)}`, to: `v${num(5, 8)}` }] };
  } },
  { weight: 24, actors: ['principal', 'facilities-manager', 'inspector', 'ehs-manager', 'capital-projects', 'contractor', 'lab-user'], make: () => (
    { action: 'login', module: 'Authentication', recordId: 'session', summary: 'Signed in', changes: [] }) },
  { weight: 8, actors: ['principal', 'facilities-manager', 'inspector', 'ehs-manager'], make: () => (
    { action: 'logout', module: 'Authentication', recordId: 'session', summary: 'Signed out', changes: [] }) },
  { weight: 3, actors: ['principal', 'contractor', 'facilities-manager'], make: () => (
    { action: 'login_failed', module: 'Authentication', recordId: 'session', summary: 'Failed sign-in attempt (wrong password)', changes: [] }) },
  { weight: 4, actors: ['ehs-manager', 'capital-projects', 'facilities-manager'], make: () => {
    const r = pick(['Compliance summary', 'ACM inventory', 'Inspection schedule', 'Response actions']);
    return { action: 'export', module: 'Reports', recordId: `${r.toLowerCase().replace(/ /g, '-')}.csv`, summary: `Exported ${r} report`, changes: [] };
  } },
];
const totalWeight = TEMPLATES.reduce((n, t) => n + t.weight, 0);
const pickTemplate = () => {
  let r = rand() * totalWeight;
  return TEMPLATES.find((t) => (r -= t.weight) < 0) ?? TEMPLATES[0];
};

function buildSamples() {
  const now = Date.now();
  return Array.from({ length: COUNT }, (_, i) => {
    const t = pickTemplate();
    const candidates = t.actors.flatMap((r) => byRole(r).filter((u) => u.status === 'active'));
    const u = pick(candidates.length ? candidates : users);
    // Working hours in Seattle (~14:00–02:00 UTC), spread over the last 90 days, never in the future
    const day = now - num(0, DAYS - 1) * 86400000;
    let at = day - (day % 86400000) + (14 * 3600 + num(0, 12 * 3600)) * 1000;
    if (at > now) at = now - num(60, 7200) * 1000;
    const made = t.make();
    return {
      id: `SAMPLE-${String(i + 1).padStart(5, '0')}`,
      at: new Date(at).toISOString(),
      ...made,
      related: made.related ?? null,
      link: made.link ?? null,
      user: actor(u),
      ip: `10.20.${num(1, 40)}.${num(2, 250)}`,
      source: 'sample',
    };
  });
}

async function main() {
  const existing = existsSync(AUDIT_FILE) ? JSON.parse(readFileSync(AUDIT_FILE, 'utf8')).entries : [];
  const appEntries = existing.filter((e) => e.source === 'app');
  const entries = [...appEntries, ...buildSamples()].sort((a, b) => b.at.localeCompare(a.at));
  await writeFile(AUDIT_FILE, JSON.stringify({ entries }, null, 2));
  console.log(`Wrote ${entries.length} audit entries (${appEntries.length} recorded by the app, ${COUNT} sample)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
