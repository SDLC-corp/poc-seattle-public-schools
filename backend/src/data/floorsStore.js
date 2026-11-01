import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildings, updateBuilding } from './store.js';
import { floorLayout } from './floorLayout.js';
import { FLOOR_NAMES } from './buildingGeometry.js';

const FILE = new URL('../../data/floors.json', import.meta.url);
export const PLAN_DIR = fileURLToPath(new URL('../../uploads/floorplans/', import.meta.url));
mkdirSync(PLAN_DIR, { recursive: true });

const doc = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { floors: [] };
let floors = doc.floors;
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeFile(FILE, JSON.stringify({ ...doc, floors }, null, 2)));
  return writing;
};

const ACM_RANK = { 'ACM Present': 2, 'Assumed ACM': 1, 'No ACM': 0 };

// API shape: adds the sample layout and the plan image URL (cache-busted)
export const present = (f) => ({
  ...f,
  layout: floorLayout(f),
  planUrl: f.planImage ? `/api/floors/${f.id}/plan?v=${encodeURIComponent(f.planImage.uploadedAt)}` : null,
});

export const getFloors = (buildingId) => floors.filter((f) => f.buildingId === buildingId).sort((a, b) => a.number - b.number);
export const getAllFloors = () => floors;
export const getFloor = (id) => floors.find((f) => f.id === id) ?? null;
export const planPath = (f) => (f?.planImage ? path.join(PLAN_DIR, f.planImage.storedName) : null);

// Building totals follow its floors: count, rooms, ACM rooms and the "worst" ACM status
async function syncBuilding(buildingId) {
  const mine = getFloors(buildingId);
  const b = buildings.find((x) => x.id === buildingId);
  if (!b || !mine.length) return b;
  const acmStatus = mine.reduce((s, f) => (ACM_RANK[f.acmStatus] > ACM_RANK[s] ? f.acmStatus : s), 'No ACM');
  return updateBuilding(buildingId, {
    floors: mine.length,
    rooms: mine.reduce((n, f) => n + f.rooms, 0),
    roomsWithAcm: mine.reduce((n, f) => n + f.acmRooms, 0),
    acmStatus,
  });
}

// New building: create its floors and split the rooms across them
export async function seedFloors(building) {
  const n = building.floors;
  const created = Array.from({ length: n }, (_, i) => {
    const share = (total) => Math.floor(total / n) + (i < total % n ? 1 : 0);
    const acmRooms = share(building.roomsWithAcm);
    return {
      id: `${building.id}-f${i + 1}`,
      buildingId: building.id,
      schoolId: building.schoolId,
      number: i + 1,
      name: FLOOR_NAMES[i],
      rooms: share(building.rooms),
      acmRooms,
      acmStatus: acmRooms ? building.acmStatus : 'No ACM',
      planImage: null,
      labels: [],
      source: 'app',
    };
  });
  floors = [...floors, ...created];
  await persist();
  await syncBuilding(building.id);
  return created;
}

export async function addFloor(f) {
  floors = [...floors, { ...f, planImage: null, source: 'app' }];
  await persist();
  const building = await syncBuilding(f.buildingId);
  return { floor: getFloor(f.id), building };
}

export async function updateFloor(id, patch) {
  floors = floors.map((f) => (f.id === id ? { ...f, ...patch, source: 'app' } : f));
  await persist();
  const f = getFloor(id);
  const building = await syncBuilding(f.buildingId);
  return { floor: f, building };
}

export async function removeFloor(id) {
  const f = getFloor(id);
  floors = floors.filter((x) => x.id !== id);
  await persist();
  if (f.planImage) await unlink(planPath(f)).catch(() => {});
  return { building: await syncBuilding(f.buildingId) };
}

export async function setPlanImage(id, planImage) {
  const f = getFloor(id);
  if (f.planImage && f.planImage.storedName !== planImage?.storedName) await unlink(planPath(f)).catch(() => {});
  return updateFloor(id, { planImage });
}
