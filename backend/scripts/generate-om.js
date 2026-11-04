// Generates SAMPLE Operations & Maintenance data → data/om.json: activities (work orders), the district and
// facility O&M plans, and standard procedures (SOPs). Items created in the app (sample: false) are kept.
// Usage: npm run generate:om
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { ACTIVITY_TYPES, CONTROLS, trainingFor } from '../src/data/omMeta.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const FILE = new URL('../data/om.json', import.meta.url);
const COUNT = 270;
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
const rand = rng('sps-om');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const { materials } = read('acmMaterials.json');
const { schools } = read('schools.json');
const { people } = read('personnel.json');
const { users } = read('users.json');
const acm = materials.filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM');
const maintenance = people.filter((p) => p.category === 'employee-maintenance' || p.category === 'contractor-supervisor');
const custodial = people.filter((p) => p.category === 'employee-custodial');
const ehs = users.filter((u) => u.roleId === 'ehs-manager');

const DESCRIPTIONS = {
  'Routine Maintenance': ['Replace valve above insulated pipe run; wet and wrap affected section.', 'Service unit ventilator; work kept clear of ACM panel.'],
  'Preventive Maintenance': ['Check and re-seal pipe insulation jacketing at elbows.', 'Inspect boiler insulation jacket and tighten bands.'],
  'Minor Repair': ['Patch damaged ceiling tile edge with encapsulant.', 'Repair small tear in pipe insulation jacket (<3 linear ft).'],
  'Controlled Disturbance': ['Drill two anchor holes through mastic under wet methods with HEPA shroud.', 'Remove one ceiling tile for cable pull; mist and reinstall.'],
  'Encapsulation': ['Apply bridging encapsulant to damaged surfacing material.', 'Encapsulate exposed edges of floor tile after equipment move.'],
  'Fiber Release Response': ['Respond to minor fiber release from damaged insulation; isolate and HEPA clean.', 'Clean debris from fallen ceiling tile fragment.'],
  'Cleaning (O&M)': ['HEPA vacuum and wet wipe floor below damaged insulation.', 'Wet clean surfaces in mechanical room per SOP-004.'],
  'Enclosure Check': ['Verify enclosure around pipe insulation is intact.', 'Check access panels to enclosed ACM are sealed.'],
  'Labeling / Signage': ['Replace missing asbestos warning labels at mechanical room entry.', 'Post caution signs at boiler room per AHERA labeling.'],
};

function buildActivities() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = today.getTime();
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const m = pick(acm);
    const type = pick(ACTIVITY_TYPES).value;
    const crew = trainingFor(type) === 'om-16' ? maintenance : custodial.length ? custodial : maintenance;
    const person = pick(crew);
    const created = now - num(5, 270) * DAY;
    const due = created + num(5, 45) * DAY;
    // Older work is mostly done; recent work is spread across pending / in progress
    const age = (now - due) / DAY;
    const r = rand();
    const state = age > 20 ? (r < 0.9 ? 'completed' : 'inProgress') : age > 0 ? (r < 0.55 ? 'completed' : r < 0.8 ? 'inProgress' : 'pending') : (r < 0.25 ? 'completed' : r < 0.6 ? 'inProgress' : 'pending');
    const assignedBy = pick(ehs);
    const startedAt = state !== 'pending' ? created + num(1, 6) * DAY : null;
    const doneAt = state === 'completed' ? Math.min(now - DAY, (startedAt ?? created) + num(0, 10) * DAY) : null;
    const history = [
      { at: new Date(created).toISOString(), by: assignedBy.name, action: 'Created' },
      { at: new Date(created + 3600000).toISOString(), by: assignedBy.name, action: `Assigned to ${person.name}` },
    ];
    if (startedAt) history.push({ at: new Date(startedAt).toISOString(), by: person.name, action: 'Status → In Progress' });
    if (doneAt) history.push({ at: new Date(doneAt).toISOString(), by: person.name, action: 'Completed' });
    out.push({
      type,
      description: pick(DESCRIPTIONS[type]),
      materialId: m.id, schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
      priority: type === 'Fiber Release Response' ? 'Urgent' : pick(['Low', 'Medium', 'Medium', 'High']),
      dueDate: isoDay(due),
      assignedToId: person.id,
      assignedToName: person.name,
      state,
      work: doneAt ? {
        performedOn: isoDay(doneAt),
        hours: num(1, 8) / 2 + 0.5,
        notes: 'Work completed per SOP; area left clean.',
        controls: Object.fromEntries(CONTROLS.map((c) => [c.key, c.key === 'ppe' ? trainingFor(type) === 'om-16' : rand() < 0.85])),
      } : null,
      completedAt: doneAt ? new Date(doneAt).toISOString() : null,
      completedBy: doneAt ? person.name : null,
      attachments: [],
      history,
      createdAt: new Date(created).toISOString(),
      createdBy: { id: assignedBy.id, name: assignedBy.name },
      sample: true,
    });
  }
  return out;
}

function buildPlans() {
  const owner = ehs[0]?.name ?? 'EHS Manager';
  const year = new Date().getFullYear();
  const district = {
    id: 'PLAN-DISTRICT', schoolId: null, name: 'SPS O&M Plan', version: '3.2',
    effectiveDate: `${year}-01-01`, nextReview: `${year + 1}-01-01`, owner,
    notes: 'District-wide O&M program for known and assumed ACM (AHERA 40 CFR 763.91).', attachments: [], sample: true,
  };
  const withAcm = new Set(acm.map((m) => m.schoolId));
  const facility = schools.filter((s) => withAcm.has(s.id)).map((s) => {
    const eff = new Date(year - (rand() < 0.3 ? 1 : 0), num(0, 11), num(1, 28));
    const review = new Date(eff.getFullYear() + 1, eff.getMonth(), eff.getDate());
    return {
      id: `PLAN-${s.id}`, schoolId: s.id, name: `${s.name} O&M Plan`, version: `${num(1, 3)}.${num(0, 4)}`,
      effectiveDate: isoDay(eff), nextReview: isoDay(review), owner: pick(ehs)?.name ?? owner,
      notes: '', attachments: [], sample: true,
    };
  });
  return [district, ...facility];
}

const PROCEDURES = [
  ['Wet Methods for Minor ACM Disturbance', 'Work Practice', 'Misting, glove-bag and drop-cloth practice for small-scale work on ACM.'],
  ['HEPA Vacuum Use and Maintenance', 'Cleaning', 'Operating, filter changes and bagging for HEPA vacuums.'],
  ['Minor Fiber Release Response', 'Fiber Release', 'Isolate, wet, HEPA clean and report a minor fiber release (<3 sq ft / 3 linear ft).'],
  ['Wet Wiping and Cleaning in ACM Areas', 'Cleaning', 'Routine O&M cleaning of floors and surfaces in areas with damaged ACM.'],
  ['Asbestos Waste Bagging and Labeling', 'Waste Handling', 'Double-bagging, labeling and storage of asbestos-containing waste.'],
  ['Respirator Use for O&M Work', 'PPE & Respiratory', 'When respirators are required, fit testing and inspection.'],
  ['Asbestos Warning Labels and Signs', 'Labeling', 'Placement and wording of AHERA warning labels in routine maintenance areas.'],
  ['Notifying Building Occupants Before O&M Work', 'General', 'Notices to staff and contractors before work that may disturb ACM.'],
];

function buildProcedures() {
  const year = new Date().getFullYear();
  return PROCEDURES.map(([title, category, description], i) => ({
    id: `SOP-${String(i + 1).padStart(3, '0')}`, title, category, description,
    version: `${num(1, 3)}.${num(0, 2)}`, effectiveDate: `${year - (i % 2)}-0${(i % 9) + 1}-15`,
    file: null, createdAt: new Date().toISOString(), createdBy: { id: null, name: 'Sample data' }, sample: true,
  }));
}

const prev = existsSync(FILE) ? read('om.json') : { activities: [], plans: [], procedures: [] };
const keep = (list) => (list ?? []).filter((x) => !x.sample);
const activities = buildActivities().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const keptActivities = keep(prev.activities);
const seq = {};
for (const a of keptActivities) {
  const [, y, n] = a.id.split('-');
  seq[y] = Math.max(seq[y] ?? 0, Number(n));
}
for (const a of activities) {
  const y = a.createdAt.slice(0, 4);
  seq[y] = (seq[y] ?? 0) + 1;
  a.id = `OM-${y}-${String(seq[y]).padStart(4, '0')}`;
}
const withId = (list) => list.map(({ id, ...rest }) => ({ id, ...rest }));
const keptPlans = keep(prev.plans);
const keptSops = keep(prev.procedures);
const data = {
  note: 'Operations & Maintenance (sample + app)',
  activities: [...withId(activities), ...keptActivities],
  plans: [...buildPlans().filter((p) => !keptPlans.some((k) => k.id === p.id)), ...keptPlans],
  procedures: [...buildProcedures().filter((p) => !keptSops.some((k) => k.id === p.id)), ...keptSops],
};
await writeFile(FILE, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Wrote ${activities.length} sample activities, ${data.plans.length} plans, ${data.procedures.length} procedures (kept ${keptActivities.length} app activities)`);
