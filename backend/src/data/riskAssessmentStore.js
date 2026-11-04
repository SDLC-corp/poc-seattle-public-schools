import { existsSync, readFileSync } from 'node:fs';
import { writeJson } from './atomicWrite.js';

// ACM risk assessments made in a management plan (material risk × priority risk), keyed by material id.
// Materials without an entry are shown with a baseline worked out from their AHERA inspection record.
const FILE = new URL('../../data/riskAssessments.json', import.meta.url);

let db = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { assessments: {} };
db.assessments ??= {};
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'ACM risk assessments (app)', assessments: db.assessments }));
  return writing;
};

export const getAssessment = (materialId) => db.assessments[materialId] ?? null;

// Saves the new assessment; the one it replaces moves into its history
export async function saveAssessment(materialId, entry) {
  const prev = db.assessments[materialId];
  const history = prev ? [{ ...prev, history: undefined }, ...(prev.history ?? [])].slice(0, 20) : [];
  db.assessments[materialId] = { ...entry, history };
  await persist();
  return db.assessments[materialId];
}
