// Seeds the sample floor plan drawings (data/floors/*.png, rendered from the PDFs next to them) onto ONE
// building: the first school's first building (Adams Elementary – Main Building) gets Ground, First and
// Second floors, each with its plan (Ground → ground plan, First → first plan, Second → second plan).
// - Missing floors are added; floors that already have their own uploaded plan are left alone.
// - Sample plans / seeded floors elsewhere (from an earlier, wider seed) are removed again.
// Safe to run again. Restart the backend afterwards (it keeps floors and buildings in memory).
import { readFileSync, statSync } from 'node:fs';
import { writeJson } from '../src/data/atomicWrite.js';
import { floorName } from '../src/data/buildingGeometry.js';

const dataFile = (name) => new URL(`../data/${name}`, import.meta.url);
const read = (name) => JSON.parse(readFileSync(dataFile(name), 'utf8'));

const PLANS = [
  'School_Ground_Floor_Plan_UPDATE',
  'School_First_Floor_Plan_UPDATE',
  'School_Floor_Second_Plan_UPDATE',
].map((base) => {
  const storedName = `${base}.png`;
  return {
    storedName, name: `${base} (page 1).png`, mime: 'image/png',
    size: statSync(dataFile(`floors/${storedName}`)).size, uploadedAt: '2026-11-03T00:00:00.000Z', sample: true,
  };
});

const floorsDoc = read('floors.json');
const buildingsDoc = read('buildings.json');
const roomsDoc = read('rooms.json');
const schools = read('schools.json');
const firstSchool = (schools.schools ?? schools)[0];
const target = buildingsDoc.buildings.find((b) => b.schoolId === firstSchool.id);
const hasRooms = new Set((roomsDoc.rooms ?? roomsDoc).map((r) => r.floorId));

// 1. Undo seeding outside the target building: drop seeded (empty) floors, clear sample plans
const before = floorsDoc.floors.length;
floorsDoc.floors = floorsDoc.floors.filter((f) => f.buildingId === target.id
  || !(f.planImage?.sample && f.derivedCounts && f.rooms === 0 && !hasRooms.has(f.id)));
const removed = before - floorsDoc.floors.length;
let cleared = 0;
for (const f of floorsDoc.floors) {
  if (f.buildingId !== target.id && f.planImage?.sample) { f.planImage = null; cleared += 1; }
}

// 2. Target building: Ground, First and Second, each with its plan unless it has its own
let added = 0;
for (const n of [0, 1, 2]) {
  if (floorsDoc.floors.some((f) => f.buildingId === target.id && f.number === n)) continue;
  let id = `${target.id}-f${n + 1}`;
  while (floorsDoc.floors.some((f) => f.id === id)) id += 'x';
  floorsDoc.floors.push({
    id, buildingId: target.id, schoolId: target.schoolId, number: n, name: floorName(n),
    rooms: 0, acmRooms: 0, acmStatus: 'No ACM', planImage: null, labels: [], shapes: [],
    source: 'app', derivedCounts: true, // rooms come from what is mapped on the plan
  });
  added += 1;
}
let planned = 0;
for (const f of floorsDoc.floors.filter((x) => x.buildingId === target.id)) {
  const plan = PLANS[f.number];
  if (!plan || (f.planImage && !f.planImage.sample)) continue;
  f.planImage = plan;
  planned += 1;
}

// Building floor counts follow the floors
for (const b of buildingsDoc.buildings) b.floors = floorsDoc.floors.filter((f) => f.buildingId === b.id).length || b.floors;

await writeJson(dataFile('floors.json'), floorsDoc);
await writeJson(dataFile('buildings.json'), buildingsDoc);
console.log(`${firstSchool.name} – ${target.name}: added ${added} floor(s), plan drawings on ${planned} floor(s).`);
console.log(`Elsewhere: removed ${removed} seeded floor(s), cleared ${cleared} sample plan(s).`);
console.log(`${target.name} floors:`, floorsDoc.floors.filter((f) => f.buildingId === target.id).sort((a, b) => a.number - b.number)
  .map((f) => `${f.name}${f.planImage ? (f.planImage.sample ? ' [sample plan]' : ' [own plan]') : ''}`).join(', '));
