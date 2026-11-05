import { existsSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { uploadDir } from './paths.js';
import { ROOM_ACM_RANK } from './acmMeta.js';
import { writeJson, readPath } from './atomicWrite.js';

const ROOMS_FILE = new URL('../../data/rooms.json', import.meta.url);
const MATERIALS_FILE = new URL('../../data/acmMaterials.json', import.meta.url);
export const FILE_DIR = uploadDir('acm');

const load = (file, key) => (existsSync(readPath(file)) ? JSON.parse(readFileSync(readPath(file), 'utf8'))[key] : []);
let rooms = load(ROOMS_FILE, 'rooms');
let materials = load(MATERIALS_FILE, 'materials');

let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => Promise.all([
    writeJson(ROOMS_FILE, { note: 'Rooms mapped on floor plans (sample + app)', rooms }),
    writeJson(MATERIALS_FILE, { note: 'ACM materials recorded per room (sample + app)', materials }),
  ]));
  return writing;
};

export const filePath = (storedName) => path.join(FILE_DIR, storedName);
const removeFiles = (list) => Promise.all(list.map((f) => unlink(filePath(f.storedName)).catch(() => {})));

// Lookup tables over the materials, rebuilt only when the list changes (every change replaces the array), so
// listing thousands of rooms doesn't scan every material for each room
let indexCache = null;
function materialIndex() {
  if (indexCache?.src === materials) return indexCache;
  const add = (map, key, m) => { if (!map.has(key)) map.set(key, []); map.get(key).push(m); };
  const byRoom = new Map(); const byFloor = new Map(); const byBuilding = new Map();
  for (const m of materials) {
    add(byRoom, m.roomId, m);
    if (m.scope === 'floor') add(byFloor, m.floorId, m);
    else if (m.scope === 'building') add(byBuilding, m.buildingId, m);
  }
  indexCache = { src: materials, byRoom, byFloor, byBuilding };
  return indexCache;
}

// Materials that apply to a room: its own, plus floor-level ones on its floor and building-level ones in its building
export function materialsForRoom(room) {
  const ix = materialIndex();
  const own = ix.byRoom.get(room.id) ?? [];
  const shared = [...(ix.byFloor.get(room.floorId) ?? []), ...(ix.byBuilding.get(room.buildingId) ?? [])].filter((m) => m.roomId !== room.id);
  return shared.length ? [...own, ...shared] : own;
}

export function roomAcmStatus(list) {
  let best = 'Not Assessed';
  for (const m of list) {
    const s = m.acmStatus === 'Not Yet Assessed' ? 'Not Assessed' : m.acmStatus;
    if (ROOM_ACM_RANK[s] > ROOM_ACM_RANK[best]) best = s;
  }
  return best;
}

export const describeRoom = (r) => {
  const list = materialsForRoom(r);
  return { ...r, acmStatus: roomAcmStatus(list), materialCount: list.length };
};

// One shared collator: localeCompare with options builds a new one per comparison (seconds for thousands of rooms)
const byNumber = new Intl.Collator(undefined, { numeric: true });
export const getRooms = (filter = {}) => rooms
  .filter((r) => Object.entries(filter).every(([k, v]) => !v || r[k] === v))
  .map(describeRoom)
  .sort((a, b) => byNumber.compare(a.number, b.number));
export const getRoom = (id) => {
  const r = rooms.find((x) => x.id === id);
  return r ? describeRoom(r) : null;
};
export const rawRoom = (id) => rooms.find((x) => x.id === id) ?? null;
// Read-only list of every room, for bulk lookups (build a Map instead of calling rawRoom per record)
export const allRooms = () => rooms;

// Newest first. The sorted list is cached until the materials change (every change replaces the array); callers
// get their own copy, so sorting or filtering it can't disturb the cache
let sortedCache = null;
export const getMaterials = (filter = {}) => {
  if (sortedCache?.src !== materials) sortedCache = { src: materials, list: [...materials].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  const keys = Object.entries(filter).filter(([, v]) => v);
  return keys.length ? sortedCache.list.filter((m) => keys.every(([k, v]) => m[k] === v)) : sortedCache.list.slice();
};
export const getMaterial = (id) => materials.find((m) => m.id === id) ?? null;

const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function addRooms(list) {
  const created = list.map((r) => ({ id: newId('RM'), photos: [], source: 'app', createdAt: new Date().toISOString(), ...r }));
  rooms = [...rooms, ...created];
  await persist();
  return created.map(describeRoom);
}

export async function updateRoom(id, patch) {
  rooms = rooms.map((r) => (r.id === id ? { ...r, ...patch, source: 'app' } : r));
  await persist();
  return getRoom(id);
}

// Deleting a room deletes its room-level materials and every stored file of both
export async function removeRoom(id) {
  const r = rawRoom(id);
  const own = materials.filter((m) => m.roomId === id && m.scope === 'room');
  rooms = rooms.filter((x) => x.id !== id);
  materials = materials.filter((m) => !own.includes(m));
  await persist();
  await removeFiles([...(r?.photos ?? []), ...own.flatMap((m) => m.attachments)]);
  return own.length;
}

// Floor deleted: its rooms and their materials go too
export async function removeFloorRooms(floorId) {
  const ids = new Set(rooms.filter((r) => r.floorId === floorId).map((r) => r.id));
  const files = [...rooms.filter((r) => ids.has(r.id)).flatMap((r) => r.photos ?? [])];
  const gone = materials.filter((m) => ids.has(m.roomId) || (m.scope === 'floor' && m.floorId === floorId));
  files.push(...gone.flatMap((m) => m.attachments));
  rooms = rooms.filter((r) => !ids.has(r.id));
  materials = materials.filter((m) => !gone.includes(m));
  await persist();
  await removeFiles(files);
}

// Building deleted: its rooms and every material recorded in it (room-, floor- or building-level) go too
export async function removeBuildingRooms(buildingId) {
  const gone = rooms.filter((r) => r.buildingId === buildingId);
  const goneMaterials = materials.filter((m) => m.buildingId === buildingId);
  rooms = rooms.filter((r) => r.buildingId !== buildingId);
  materials = materials.filter((m) => m.buildingId !== buildingId);
  await persist();
  await removeFiles([...gone.flatMap((r) => r.photos ?? []), ...goneMaterials.flatMap((m) => m.attachments ?? [])]);
  return { rooms: gone.length, materials: goneMaterials.length };
}

export async function addMaterial(m) {
  const created = { id: newId('ACM'), attachments: [], source: 'app', createdAt: new Date().toISOString(), ...m };
  materials = [created, ...materials];
  await persist();
  return created;
}

export async function updateMaterial(id, patch) {
  materials = materials.map((m) => (m.id === id ? { ...m, ...patch, source: 'app', updatedAt: new Date().toISOString() } : m));
  await persist();
  return getMaterial(id);
}

export async function removeMaterial(id) {
  const m = getMaterial(id);
  materials = materials.filter((x) => x.id !== id);
  await persist();
  await removeFiles(m?.attachments ?? []);
}

export async function addFile(kind, id, file) {
  if (kind === 'photo') rooms = rooms.map((r) => (r.id === id ? { ...r, photos: [...(r.photos ?? []), file] } : r));
  else materials = materials.map((m) => (m.id === id ? { ...m, attachments: [...m.attachments, file] } : m));
  await persist();
}

export async function removeFile(kind, id, fileId) {
  let gone = null;
  if (kind === 'photo') {
    rooms = rooms.map((r) => {
      if (r.id !== id) return r;
      gone = r.photos.find((f) => f.id === fileId);
      return { ...r, photos: r.photos.filter((f) => f.id !== fileId) };
    });
  } else {
    materials = materials.map((m) => {
      if (m.id !== id) return m;
      gone = m.attachments.find((f) => f.id === fileId);
      return { ...m, attachments: m.attachments.filter((f) => f.id !== fileId) };
    });
  }
  await persist();
  if (gone) await removeFiles([gone]);
  return Boolean(gone);
}
