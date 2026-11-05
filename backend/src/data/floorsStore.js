import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { unlink, copyFile } from 'node:fs/promises';
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
// The file name is part of the address (&f=), so any server instance can serve the file even if its own copy of the
// floor record is behind (Vercel runs several instances that don't share saved data)
export const planSourceUrl = (f) => (f.planSource ? `/api/floors/${f.id}/plan/source?v=${encodeURIComponent(f.planSource.uploadedAt)}&f=${encodeURIComponent(path.basename(f.planSource.storedName))}` : null);
export const planImageUrl = (f) => (f.planImage ? `/api/floors/${f.id}/plan?v=${encodeURIComponent(f.planImage.uploadedAt)}&f=${encodeURIComponent(path.basename(f.planImage.storedName))}` : null);
export const present = (f) => ({
  ...f,
  layout: f.derivedCounts ? null : floorLayout(f), // app-added floors have no sample layout
  planUrl: planImageUrl(f),
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
// A file name as a set of words, with floor numbers written any way made the same: "Second" = "2nd" = "2",
// "Ground" = "G" = "0", … — so "School_Floor_2_Plan_UPDATE.pdf" is the same plan as "School_Floor_Second_Plan_UPDATE"
const NUMBER_WORDS = {
  ground: '0', g: '0', gf: '0', basement: 'b', first: '1', '1st': '1', second: '2', '2nd': '2', third: '3', '3rd': '3',
  fourth: '4', '4th': '4', fifth: '5', '5th': '5', one: '1', two: '2', three: '3', four: '4', five: '5',
};
const NOISE = new Set(['copy', 'final', 'pdf', 'png']);
// A copy number ("plan (1).pdf", "plan - Copy (2)") is ignored so it's never read as a floor number
const words = (s) => String(s ?? '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/\s*(-\s*copy\s*)?\(\d+\)\s*$/, '')
  .split(/[^a-z0-9]+/).filter(Boolean).map((w) => NUMBER_WORDS[w] ?? w).filter((w) => !NOISE.has(w) && !/^\d{1,2}$/.test(w) || /^\d$/.test(w));
const floorNumber = (ws) => ws.find((w) => /^(\d|b)$/.test(w)) ?? null;

export function knownPlans() {
  if (!existsSync(SAMPLE_PLAN_DIR)) return [];
  return readdirSync(SAMPLE_PLAN_DIR).filter((n) => /\.pdf$/i.test(n)).map((pdf) => {
    // The plan image is the PNG (or JPG / WebP) with the same name in the same folder
    const base = pdf.replace(/\.pdf$/i, '');
    const image = ['.png', '.jpg', '.jpeg', '.webp'].map((x) => base + x).find((n) => existsSync(path.join(SAMPLE_PLAN_DIR, n)));
    if (!image) return null;
    const ws = words(pdf);
    return { key: ws.join(' '), words: ws, floor: floorNumber(ws), pdf, image, label: base.replace(/_/g, ' ') };
  }).filter(Boolean);
}

/**
 * The known plan an uploaded file is: every word of the plan's name is in the file's name, in any order, and the
 * floor number agrees ("School_Floor_2_Plan_UPDATE (1).pdf" → School_Floor_Second_Plan_UPDATE). The best match wins.
 */
export const matchKnownPlan = (fileName) => {
  const ws = words(fileName);
  if (!ws.length) return null;
  const have = new Set(ws);
  const floor = floorNumber(ws);
  const hits = knownPlans().filter((p) => p.words.every((w) => have.has(w)) && (p.floor === null || floor === null || p.floor === floor));
  return hits.sort((a, b) => b.words.length - a.words.length)[0] ?? null;
};
/**
 * A plan uploaded before under this file name (on any floor) whose files are still on this server — so the same PDF
 * or image isn't rendered and sent again: the server copies it. Matched by the original file name, ignoring case and
 * separators. Returns the floor that has it.
 */
const plainName = (s) => String(s ?? '').toLowerCase().replace(/\s*\(page \d+\)(?=\.[a-z0-9]+$)/, '').replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]/g, '');
export function findUploadedPlan(fileName) {
  const want = plainName(fileName);
  if (!want) return null;
  return floors.find((f) => f.planImage && !f.planImage.sample
    && plainName(f.planSource?.name ?? f.planImage.name) === want
    && existsSync(planPath(f)) && (!f.planSource || existsSync(planSourcePath(f)))) ?? null;
}

// The floor's plan copied (on the server) from another floor's earlier upload of the same file
export async function copyUploadedPlan(id, from) {
  const at = new Date().toISOString();
  const stamp = Date.now();
  const imageName = `${id}-${stamp}${path.extname(from.planImage.storedName)}`;
  await copyFile(planPath(from), path.join(PLAN_DIR, imageName));
  await setPlanImage(id, { ...from.planImage, storedName: imageName, uploadedAt: at });
  if (!from.planSource) return { floor: getFloor(id) };
  const pdfName = `${id}-${stamp}.pdf`;
  await copyFile(planSourcePath(from), path.join(PLAN_DIR, pdfName));
  return setPlanSource(id, { ...from.planSource, storedName: pdfName, uploadedAt: at, sample: false });
}

/**
 * A floor's plan file named in its address (&f=), found even when this instance's floor record doesn't list it:
 * a known plan's image / PDF (part of the app), or a file uploaded for this floor (named "<floorId>-…").
 * Only those files can be reached this way.
 */
export function findFloorFile(floorId, name, kind) {
  const file = path.basename(String(name ?? ''));
  const ok = kind === 'pdf' ? /\.pdf$/i.test(file) : /\.(png|jpe?g|webp)$/i.test(file);
  if (!file || !ok) return null;
  const known = knownPlanPath(file);
  if (known) return known;
  if (!file.startsWith(`${floorId}-`)) return null;
  const p = uploadedFile(file);
  return existsSync(p) ? p : null;
}

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
  if (!b) return b;
  // No floors left: nothing in it (the totals mustn't keep the old numbers)
  if (!mine.length) return updateBuilding(buildingId, { floors: 0, rooms: 0, roomsWithAcm: 0, acmStatus: 'Not Assessed' });
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
