import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ROOM_ACM_RANK } from './acmMeta.js';
import { writeJson } from './atomicWrite.js';

const ROOMS_FILE = new URL('../../data/rooms.json', import.meta.url);
const MATERIALS_FILE = new URL('../../data/acmMaterials.json', import.meta.url);
export const FILE_DIR = fileURLToPath(new URL('../../uploads/acm/', import.meta.url));
mkdirSync(FILE_DIR, { recursive: true });

const load = (file, key) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8'))[key] : []);
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

// Materials that apply to a room: its own, plus floor-level ones on its floor and building-level ones in its building
export function materialsForRoom(room) {
  return materials.filter((m) => m.roomId === room.id
    || (m.scope === 'floor' && m.floorId === room.floorId)
    || (m.scope === 'building' && m.buildingId === room.buildingId));
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

export const getRooms = (filter = {}) => rooms
  .filter((r) => Object.entries(filter).every(([k, v]) => !v || r[k] === v))
  .map(describeRoom)
  .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
export const getRoom = (id) => {
  const r = rooms.find((x) => x.id === id);
  return r ? describeRoom(r) : null;
};
export const rawRoom = (id) => rooms.find((x) => x.id === id) ?? null;
// Read-only list of every room, for bulk lookups (build a Map instead of calling rawRoom per record)
export const allRooms = () => rooms;

export const getMaterials = (filter = {}) => materials
  .filter((m) => Object.entries(filter).every(([k, v]) => !v || m[k] === v))
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
