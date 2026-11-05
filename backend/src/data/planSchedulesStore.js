import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';

// Management plan monitoring schedule per school:
// - schedules: extra activities added to the plan
// - overrides: edits to the standard activities (surveillance, inspections, plan review…), whose dates
//   otherwise come from live records
const FILE = new URL('../../data/planSchedules.json', import.meta.url);

let db = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : {};
db.schedules ??= {};
db.overrides ??= {};
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Management plan monitoring schedule (app)', schedules: db.schedules, overrides: db.overrides }));
  return writing;
};

export const getSchedules = (schoolId) => db.schedules[schoolId] ?? [];
export const getOverrides = (schoolId) => db.overrides[schoolId] ?? {};

export async function saveSchedules(schoolId, list) {
  db.schedules[schoolId] = list;
  await persist();
  return list;
}

// override = null removes it (back to the standard activity)
export async function saveOverride(schoolId, itemId, override) {
  const all = { ...(db.overrides[schoolId] ?? {}) };
  if (override) all[itemId] = override;
  else delete all[itemId];
  db.overrides[schoolId] = all;
  await persist();
  return override;
}
