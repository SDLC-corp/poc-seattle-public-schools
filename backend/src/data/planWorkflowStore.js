import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';

// Per-school management plan workflow diagrams edited in the plan's Workflow & Approvals tab.
// A school without an entry uses the standard plan cycle drawn by the frontend.
const FILE = new URL('../../data/planWorkflows.json', import.meta.url);

let db = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')) : { workflows: {} };
db.workflows ??= {};
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Management plan workflow diagrams (app)', workflows: db.workflows }));
  return writing;
};

export const getWorkflow = (schoolId) => db.workflows[schoolId] ?? null;

export async function saveWorkflow(schoolId, workflow) {
  db.workflows[schoolId] = workflow;
  await persist();
  return workflow;
}

export async function removeWorkflow(schoolId) {
  const had = Boolean(db.workflows[schoolId]);
  delete db.workflows[schoolId];
  await persist();
  return had;
}
