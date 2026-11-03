// Generates SAMPLE detailed ACM inspection records (the inspection form) → data/inspectionRecords.json.
// Records made in the app (sample: false) are kept; previous samples are replaced.
// Usage: npm run generate:inspection-records
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import {
  TYPES, DAMAGE_TYPES, DAMAGE_EXTENTS, LEVELS, RECOMMENDED_ACTIONS, TEAMS, conditionChange,
} from '../src/data/inspectionMeta.js';
import { MATERIAL_TYPES } from '../src/data/acmMeta.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const FILE = new URL('../data/inspectionRecords.json', import.meta.url);
const COUNT = 150; // started or finished
const SCHEDULED = 45; // assigned, not started
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
const rand = rng('sps-inspection-records');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));
const isoDay = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const { materials } = read('acmMaterials.json');
const { users } = read('users.json');
const { people } = read('personnel.json');
const { rooms } = read('rooms.json');
const roomById = new Map(rooms.map((r) => [r.id, r]));
const inspectors = users.filter((u) => u.roleId === 'inspector');
const reviewers = users.filter((u) => u.roleId === 'ehs-manager');
const certOf = (userId) => {
  const rec = people.find((p) => p.userId === userId)?.records.find((r) => r.programId === 'inspector');
  return rec ? { name: 'AHERA Building Inspector', number: rec.certificateNo, expiresOn: rec.expiresOn } : null;
};

const NOTES = {
  Good: ['Material intact, no visible damage. Accessible areas inspected; ceiling plenum above tiles not accessed.', 'No change from previous inspection. Labels present at mechanical room entrance.'],
  Damaged: ['Localized damage near access panel; recommend repair and continued surveillance.', 'Edges flaking along the north wall. Area is low traffic; maintenance staff informed.'],
  'Significantly Damaged': ['Widespread delamination with debris on floor below. Area restricted pending response action.', 'Water intrusion has caused extensive damage; recommend removal by licensed abatement contractor.'],
};
const ACTIONS = {
  Good: [['Continue O&M program and periodic surveillance', 'EHS – Asbestos Program', 'Low']],
  Damaged: [['Repair damaged material and re-encapsulate', 'Facilities – Asbestos Team', 'Medium'], ['Review damaged ceiling tile', 'Facilities Manager', 'Medium']],
  'Significantly Damaged': [['Restrict access to the area', 'Building Administrator', 'High'], ['Schedule removal by licensed abatement contractor', 'Abatement Contractor', 'Critical'], ['Clearance air sampling after abatement', 'EHS – Asbestos Program', 'High']],
};

function build() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pool = materials.filter((m) => m.acmStatus !== 'No ACM' || rand() < 0.15);
  const out = [];
  for (let i = 0; i < COUNT; i++) {
    const m = pick(pool);
    const t = today.getTime() - num(1, 540) * DAY;
    const date = isoDay(t);
    const inspector = pick(inspectors);
    const current = m.condition === 'Not Assessed' ? pick(['Good', 'Good', 'Damaged']) : m.condition;
    const previous = rand() < 0.75 ? (current === 'Good' || rand() < 0.5 ? 'Good' : 'Damaged') : null;
    const damaged = current !== 'Good';
    const severe = current === 'Significantly Damaged';
    const water = damaged && rand() < 0.3;
    const labelled = m.scope === 'room' && rand() < 0.2 ? 'No' : 'Yes';
    const sampleRequired = m.acmStatus === 'Assumed ACM' ? rand() < 0.5 : rand() < 0.1;
    const sampleResult = sampleRequired ? (t > today.getTime() - 21 * DAY ? 'Pending' : pick(['Asbestos Detected', 'No Asbestos Detected', 'Asbestos Detected'])) : null;
    const room = roomById.get(m.roomId);
    const state = pick(['approved', 'approved', 'approved', 'approved', 'approved', 'submitted', 'submitted', 'draft', 'returned']);
    const reviewer = pick(reviewers);
    const reviewDate = isoDay(t + num(1, 10) * DAY);
    const actions = ACTIONS[current];
    out.push({
      type: severe ? 'Damage Assessment' : pick(TYPES.slice(0, 3)),
      date,
      scheduledDate: isoDay(t - num(0, 10) * DAY),
      materialId: m.id, schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
      locationDescription: `${m.location}${room ? `, ${room.name}` : ''}`,
      homogeneousAreaId: `HA-${String(MATERIAL_TYPES.indexOf(m.materialType) + 1).padStart(3, '0')}`,
      inspectorId: inspector.id,
      inspectorName: inspector.name,
      certification: certOf(inspector.id),
      assessment: {
        currentCondition: current,
        previousCondition: previous,
        conditionChange: conditionChange(previous, current),
        damageType: damaged ? (water ? 'Water Damage' : pick(DAMAGE_TYPES.slice(1, 8))) : 'None',
        damageExtent: severe ? DAMAGE_EXTENTS[3] : damaged ? pick(DAMAGE_EXTENTS.slice(1, 3)) : 'None',
        waterDamage: water ? 'Yes' : 'No',
        potentialDisturbance: severe ? 'High' : pick(LEVELS),
        labelled,
        managementPlanUpdated: state === 'approved' ? 'Yes' : pick(['Yes', 'No']),
      },
      checklist: {
        goodCondition: damaged ? 'No' : 'Yes',
        damaged: damaged ? 'Yes' : 'No',
        labelled,
        inManagementPlan: 'Yes',
        waterDamage: water ? 'Yes' : 'No',
        furtherAssessment: sampleRequired || damaged ? 'Yes' : 'No',
        immediateAction: severe ? 'Yes' : 'No',
      },
      sampling: sampleRequired
        ? { required: 'Yes', sampleId: `SMP-${String(num(10000, 99999))}`, collectionDate: date, sampleLocation: m.location, laboratory: pick(['Accredited PLM Lab A (sample)', 'Accredited PLM Lab B (sample)']), result: sampleResult }
        : { required: 'No' },
      risk: {
        priority: severe ? pick(['High', 'Critical']) : damaged ? 'Medium' : 'Low',
        damageSeverity: severe ? 'Severe' : damaged ? pick(['Minor', 'Moderate']) : 'None',
        recommendedAction: severe ? pick(['Removal', 'Enclosure', 'Restrict Access']) : damaged ? pick(['Repair', 'Encapsulation', 'Further Assessment']) : RECOMMENDED_ACTIONS[0],
        immediateAttention: severe ? 'Yes' : 'No',
        followUpRequired: damaged || sampleRequired ? 'Yes' : 'No',
        targetDate: damaged || sampleRequired ? isoDay(t + (severe ? num(3, 14) : num(14, 45)) * DAY) : '',
      },
      comments: pick(NOTES[current]),
      actionItems: actions.slice(0, num(1, actions.length)).map(([action, assignedTo, priority], k) => ({
        id: `AI-${k + 1}`, action, assignedTo, priority, dueDate: isoDay(t + num(7, 60) * DAY),
        status: state === 'approved' && t < today.getTime() - 120 * DAY ? 'Completed' : pick(['Pending', 'In Progress', 'Completed']),
      })),
      verification: {
        inspectorSignature: state === 'draft' ? null : 'on-file',
        completionDate: state === 'draft' ? '' : date,
        reviewerId: state === 'approved' || state === 'returned' ? reviewer.id : null,
        reviewerName: state === 'approved' || state === 'returned' ? reviewer.name : null,
        reviewerSignature: state === 'approved' ? 'on-file' : null,
        reviewStatus: { draft: 'Not Submitted', submitted: 'Pending Review', approved: 'Approved', returned: 'Returned for Changes' }[state],
        reviewComments: state === 'returned' ? 'Please add photos of the damaged area and confirm the quantity.' : '',
        approvalDate: state === 'approved' ? reviewDate : '',
      },
      state,
      attachments: [],
      createdAt: new Date(t + 9 * 3600000).toISOString(),
      createdBy: { id: inspector.id, name: inspector.name },
      sample: true,
    });
  }

  // Assigned but not started: mostly upcoming, a few already past their scheduled date
  const assigner = reviewers[0];
  for (let i = 0; i < SCHEDULED; i++) {
    const m = pick(pool);
    const inspector = pick(inspectors);
    const t = today.getTime() + num(-12, 75) * DAY;
    out.push({
      type: pick(['3-Year Reinspection', '3-Year Reinspection', 'Initial Inspection', 'Follow-up Inspection']),
      date: null,
      scheduledDate: isoDay(t),
      materialId: m.id, schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
      locationDescription: '', homogeneousAreaId: '',
      inspectorId: inspector.id, inspectorName: inspector.name, certification: certOf(inspector.id),
      assessment: {}, checklist: {}, sampling: {}, risk: {}, comments: '', actionItems: [],
      verification: { reviewStatus: 'Not Submitted' },
      assignment: { assignedBy: { id: assigner.id, name: assigner.name }, assignedAt: new Date(t - num(10, 40) * DAY).toISOString(), notes: '' },
      state: 'scheduled',
      attachments: [],
      createdAt: new Date(t - num(10, 40) * DAY).toISOString(),
      createdBy: { id: assigner.id, name: assigner.name },
      sample: true,
    });
  }
  return out;
}

const kept = existsSync(FILE) ? read('inspectionRecords.json').records.filter((r) => !r.sample) : [];
const samples = build().sort((a, b) => (a.date ?? a.scheduledDate).localeCompare(b.date ?? b.scheduledDate));
const seq = {};
for (const r of kept) {
  const [, y, n] = r.id.split('-');
  seq[y] = Math.max(seq[y] ?? 0, Number(n));
}
for (const r of samples) {
  const y = (r.date ?? r.scheduledDate).slice(0, 4);
  seq[y] = (seq[y] ?? 0) + 1;
  r.id = `INS-${y}-${String(seq[y]).padStart(5, '0')}`;
}
const records = [...samples, ...kept].map(({ id, ...rest }) => ({ id, ...rest }));
await writeFile(FILE, `${JSON.stringify({ note: 'Detailed ACM inspection records (sample + app)', records }, null, 2)}\n`);
console.log(`Wrote ${samples.length} sample + ${kept.length} kept inspection records`);
