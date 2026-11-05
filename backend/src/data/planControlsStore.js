import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';

// Control measures set in a school's management plan, keyed by ACM (material) id.
// ACMs without an entry use measures worked out from their risk, condition and O&M work.
const FILE = new URL('../../data/planControls.json', import.meta.url);

let db = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : { controls: {} };
db.controls ??= {};
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Management plan control measures (app)', controls: db.controls }));
  return writing;
};

export const getControls = (schoolId) => db.controls[schoolId] ?? {};

// control = null removes it (back to the worked-out measures)
export async function saveControl(schoolId, materialId, control) {
  const all = { ...(db.controls[schoolId] ?? {}) };
  if (control) all[materialId] = control;
  else delete all[materialId];
  db.controls[schoolId] = all;
  await persist();
  return control;
}
