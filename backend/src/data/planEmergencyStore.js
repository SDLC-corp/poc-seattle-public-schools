import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';

// Management plan emergency procedures per school: response steps and which contacts are listed.
// A school without an entry uses the standard steps and contacts from its Roles & Responsibilities.
const FILE = new URL('../../data/planEmergency.json', import.meta.url);

let db = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : { plans: {} };
db.plans ??= {};
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Management plan emergency procedures (app)', plans: db.plans }));
  return writing;
};

export const getEmergency = (schoolId) => db.plans[schoolId] ?? {};

// patch keys: steps, roleIds, extra (null removes a key → back to the standard)
export async function saveEmergency(schoolId, patch) {
  const next = { ...(db.plans[schoolId] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  db.plans[schoolId] = next;
  await persist();
  return next;
}
