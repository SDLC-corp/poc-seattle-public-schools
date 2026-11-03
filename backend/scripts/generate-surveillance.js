// Generates SAMPLE periodic surveillance records (AHERA 6-month surveillance of known/assumed ACM)
// → data/surveillance.json. Records made in the app (sample: false) are kept; previous samples are replaced.
// Usage: npm run generate:surveillance
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const FILE = new URL('../data/surveillance.json', import.meta.url);
const DAY = 86400000;
const INTERVAL = 182; // days between surveillances (40 CFR 763.92(b))

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
const rand = rng('sps-surveillance');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayMs = (iso) => Date.parse(`${iso}T00:00:00`);

const { materials } = read('acmMaterials.json');
const { users } = read('users.json');
const inspectors = users.filter((u) => u.roleId === 'inspector').map((u) => ({ id: u.id, name: u.name }));

const COMMENTS = {
  Good: [
    'Material remains in good condition. No visible damage or deterioration. Area is dry and undisturbed.',
    'No change since last surveillance. Material intact and encapsulated.',
    'Condition unchanged; no evidence of disturbance or water damage.',
  ],
  Damaged: [
    'Localized damage observed (less than 10% of the area). Edges flaking near access point.',
    'Minor delamination noted; no debris on surrounding surfaces.',
    'Small tears in jacketing at elbow joints. Area cordoned off pending repair.',
  ],
  'Significantly Damaged': [
    'Extensive damage over a large part of the material; debris present. Access restricted.',
    'Water damage has caused delamination across most of the material. Area closed to occupants.',
  ],
};
const ACTIONS = {
  Damaged: [['Repair damaged section and re-encapsulate', 'Facilities – Asbestos Team'], ['Clean up debris using HEPA vacuum', 'O&M – Custodial'], ['Re-inspect after repair', 'EHS – Asbestos Program']],
  'Significantly Damaged': [['Restrict access to the area', 'EHS – Asbestos Program'], ['Schedule response action (removal or enclosure)', 'Abatement Contractor'], ['Air sampling before re-occupancy', 'EHS – Asbestos Program']],
};

function buildSamples() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = today.getTime();
  const out = [];
  for (const m of materials.filter((x) => x.acmStatus === 'ACM Present' || x.acmStatus === 'Assumed ACM')) {
    // Latest surveillance 0–8 months ago (so some are overdue), then earlier ones every ~6 months
    const latest = now - num(0, 240) * DAY;
    const earliest = m.assessmentDate ? dayMs(m.assessmentDate) : latest - 720 * DAY;
    const count = num(1, 3);
    const dates = [];
    for (let i = 0, t = latest; i < count && t >= earliest; i++, t -= (INTERVAL + num(-12, 12)) * DAY) dates.push(t);
    if (!dates.length) dates.push(latest);
    const finalCondition = m.condition === 'Not Assessed' ? 'Good' : m.condition;
    dates.reverse().forEach((t, i) => {
      const last = i === dates.length - 1;
      const condition = last ? finalCondition : (finalCondition === 'Good' || rand() < 0.5 ? 'Good' : 'Damaged');
      const previous = out.at(-1)?.materialId === m.id ? out.at(-1).condition : null;
      const inspector = pick(inspectors);
      const date = isoDay(t);
      const corrective = condition !== 'Good';
      const actionItems = corrective
        ? ACTIONS[condition].slice(0, num(1, ACTIONS[condition].length)).map(([text, team], k) => ({
          id: `AI-${k + 1}`,
          text,
          dueDate: isoDay(t + num(14, 60) * DAY),
          assignedTo: team,
          // Older findings have been worked off; the latest one may still be open
          status: !last ? 'Closed' : pick(['Open', 'Open', 'In Progress', 'Closed']),
        }))
        : [{ id: 'AI-1', text: 'Continue routine surveillance (6-month).', dueDate: isoDay(t + INTERVAL * DAY), assignedTo: 'EHS – Asbestos Program', status: last ? 'Open' : 'Closed' }];
      out.push({
        materialId: m.id,
        schoolId: m.schoolId,
        buildingId: m.buildingId,
        floorId: m.floorId,
        roomId: m.roomId,
        date,
        inspectorId: inspector.id,
        inspectorName: inspector.name,
        condition,
        changed: previous ? previous !== condition : false,
        correctiveAction: corrective,
        nextDue: isoDay(t + INTERVAL * DAY),
        comments: pick(COMMENTS[condition]),
        signature: { name: inspector.name, date, image: null },
        actionItems,
        attachments: [],
        state: 'recorded',
        createdAt: new Date(t + num(8, 16) * 3600000).toISOString(),
        createdBy: { id: inspector.id, name: inspector.name },
        sample: true,
      });
    });
  }
  return out;
}

const kept = existsSync(FILE) ? read('surveillance.json').records.filter((r) => !r.sample) : [];
// IDs: SUR-<year>-<4-digit sequence>, numbered by date within each year
const samples = buildSamples().sort((a, b) => a.date.localeCompare(b.date) || a.materialId.localeCompare(b.materialId));
const seq = {};
for (const r of kept) {
  const [, y, n] = r.id.split('-');
  seq[y] = Math.max(seq[y] ?? 0, Number(n));
}
for (const r of samples) {
  const y = r.date.slice(0, 4);
  seq[y] = (seq[y] ?? 0) + 1;
  r.id = `SUR-${y}-${String(seq[y]).padStart(4, '0')}`;
}
const records = [...samples, ...kept].map(({ id, ...rest }) => ({ id, ...rest }));
await writeFile(FILE, `${JSON.stringify({ note: 'ACM periodic surveillance records (sample + app)', records }, null, 2)}\n`);
console.log(`Wrote ${samples.length} sample + ${kept.length} kept surveillance records`);
