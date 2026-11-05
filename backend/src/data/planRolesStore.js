import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';

// Management plan roles & responsibilities per school. A school without an entry uses the standard
// roles filled from its live users / personnel (see routes/managementPlans.js).
const FILE = new URL('../../data/planRoles.json', import.meta.url);

let db = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : { roles: {} };
db.roles ??= {};
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Management plan roles & responsibilities (app)', roles: db.roles }));
  return writing;
};

export const getRoles = (schoolId) => db.roles[schoolId] ?? null;

export async function saveRoles(schoolId, roles) {
  db.roles[schoolId] = roles;
  await persist();
  return roles;
}
