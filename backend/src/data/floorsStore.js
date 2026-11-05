import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { uploadDir } from './paths.js';
import { buildings, updateBuilding } from './store.js';
import { floorLayout } from './floorLayout.js';
import { floorName } from './buildingGeometry.js';
import { writeJson, readPath } from './atomicWrite.js';

const FILE = new URL('../../data/floors.json', import.meta.url);
export const PLAN_DIR = uploadDir('floorplans');
// Seeded sample plans (Ground / First / Second floor drawings), shared by many floors – never deleted
const SAMPLE_PLAN_DIR = fileURLToPath(new URL('../../data/floors/', import.meta.url));

const doc = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : { floors: [] };
let floors = doc.floors;
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { ...doc, floors }));
  return writing;
};

const ACM_RANK = { 'ACM Present': 2, 'Assumed ACM': 1, 'No ACM': 0 };

// API shape: adds the sample layout, the plan image URL (cache-busted) and, when the plan came from a PDF, the
// original PDF's URL
export const planSourceUrl = (f) => (f.planSource ? `/api/floors/${f.id}/plan/source?v=${encodeURIComponent(f.planSource.uploadedAt)}` : null);
export const present = (f) => ({
  ...f,
  layout: f.derivedCounts ? null : floorLayout(f), // app-added floors have no sample layout
  planUrl: f.planImage ? `/api/floors/${f.id}/plan?v=${encodeURIComponent(f.planImage.uploadedAt)}` : null,
  planSourceUrl: planSourceUrl(f),
  ...planFiles(f),
});

export const getFloors = (buildingId) => floors.filter((f) => f.buildingId === buildingId).sort((a, b) => a.number - b.number);
export const getAllFloors = () => floors;
export const getFloor = (id) => floors.find((f) => f.id === id) ?? null;
// Plan files uploaded in the app live in uploads/floorplans (not in git, so never deployed). Copies of the plans
// already on record are kept in data/floorplans, which is deployed: a file not found in uploads is served from there.
const SHIPPED_PLAN_DIR = fileURLToPath(new URL('../../data/floorplans/', import.meta.url));
const uploadedFile = (storedName) => {
  const name = path.basename(storedName);
  const uploaded = path.join(PLAN_DIR, name);
  if (existsSync(uploaded)) return uploaded;
  const shipped = path.join(SHIPPED_PLAN_DIR, name);
  return existsSync(shipped) ? shipped : uploaded;
};
export const planPath = (f) => (f?.planImage ? (f.planImage.sample ? path.join(SAMPLE_PLAN_DIR, f.planImage.storedName) : uploadedFile(f.planImage.storedName)) : null);
// The original PDF a plan image was rendered from (uploads/floorplans/<floor>-<time>.pdf)
export const planSourcePath = (f) => (f?.planSource ? (f.planSource.sample ? path.join(SAMPLE_PLAN_DIR, path.basename(f.planSource.storedName)) : uploadedFile(f.planSource.storedName)) : null);

/**
 * The district's floor plan PDFs that ship with the app (data/floors): each PDF with the plan image made from it.
 * Uploading one of these PDFs (recognised by its file name) uses this image directly, so the plan always loads,
 * also on a server where uploads aren't kept.
 */
const squash = (s) => String(s ?? '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, '');
export function knownPlans() {
  if (!existsSync(SAMPLE_PLAN_DIR)) return [];
  return readdirSync(SAMPLE_PLAN_DIR).filter((n) => /\.pdf$/i.test(n)).map((pdf) => {
    const image = pdf.replace(/\.pdf$/i, '.png');
    if (!existsSync(path.join(SAMPLE_PLAN_DIR, image))) return null;
    return { key: squash(pdf), pdf, image, label: pdf.replace(/\.pdf$/i, '').replace(/_/g, ' ') };
  }).filter(Boolean);
}
// The known plan an uploaded file is: its name contains the plan's name (ignoring case, spaces, "_", "(1)" etc.)
export const matchKnownPlan = (fileName) => {
  const name = squash(fileName);
  return name ? knownPlans().find((p) => name.includes(p.key)) ?? null : null;
};
export const knownPlanPath = (file) => {
  const plan = knownPlans().find((p) => p.pdf === file || p.image === file);
  return plan ? path.join(SAMPLE_PLAN_DIR, file) : null;
};
// Whether the plan's files are actually on this server. On Vercel, uploads live in /tmp and aren't deployed, so a
// plan uploaded elsewhere (or before the instance restarted) can be on record without its file; the app then shows
// the floor's layout and asks for the plan to be uploaded again instead of a broken image
export const planFiles = (f) => ({
  planAvailable: f.planImage ? existsSync(planPath(f)) : null,
  planSourceAvailable: f.planSource ? existsSync(planSourcePath(f)) : null,
});

// Only the floor's own uploaded files (plan image and its PDF) are removed with it — never the shipped copies in
// data/floorplans or the sample plans, which are part of the code
const removeUpload = (p) => (p && p.startsWith(PLAN_DIR) ? unlink(p).catch(() => {}) : null);
const removePlanFile = (f) => Promise.all([
  f?.planImage && !f.planImage.sample ? removeUpload(planPath(f)) : null,
  f?.planSource ? removeUpload(planSourcePath(f)) : null,
]);

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
      number: i, // 0 = ground floor
      name: floorName(i),
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
  await removePlanFile(f);
  return { building: await syncBuilding(f.buildingId) };
}

// Building deleted: all its floors (and their uploaded plan images) go too
export async function removeBuildingFloors(buildingId) {
  const gone = floors.filter((f) => f.buildingId === buildingId);
  floors = floors.filter((f) => f.buildingId !== buildingId);
  await persist();
  await Promise.all(gone.map(removePlanFile));
  return gone.length;
}

// A new (or removed) plan image replaces the old one and its PDF; the new PDF, if any, follows with setPlanSource
export async function setPlanImage(id, planImage) {
  const f = getFloor(id);
  if (f.planImage && f.planImage.storedName !== planImage?.storedName) await removePlanFile(f);
  return updateFloor(id, { planImage, planSource: null });
}

// A floor's plan set to one of the known plans (no upload): its image and PDF are the shipped files
export async function useKnownPlan(id, plan, uploadedName) {
  const at = new Date().toISOString();
  const size = (n) => statSync(path.join(SAMPLE_PLAN_DIR, n)).size;
  await setPlanImage(id, { storedName: plan.image, name: uploadedName || plan.pdf, mime: 'image/png', size: size(plan.image), uploadedAt: at, sample: true });
  return setPlanSource(id, { storedName: plan.pdf, name: uploadedName || plan.pdf, size: size(plan.pdf), page: 1, pages: 1, uploadedAt: at, sample: true });
}

// The original PDF of the current plan image: { storedName, name, size, page, pages, uploadedAt }
export async function setPlanSource(id, planSource) {
  const f = getFloor(id);
  if (f.planSource && f.planSource.storedName !== planSource?.storedName) await removeUpload(planSourcePath(f));
  return updateFloor(id, { planSource });
}
