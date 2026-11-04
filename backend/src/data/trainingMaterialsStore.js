import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { writeJson } from './atomicWrite.js';
import { uploadDir } from './paths.js';
import { PROGRAMS } from './trainingPrograms.js';

// Learning material for each training program: uploaded files (PDF, video, image) or links
// { id, programId, title, description, kind: 'pdf'|'video'|'image'|'link', file|null, url|null, createdAt, createdBy, updatedAt? }
const FILE = new URL('../../data/trainingMaterials.json', import.meta.url);
export const MATERIAL_DIR = uploadDir('training-materials');
export const materialPath = (storedName) => path.join(MATERIAL_DIR, path.basename(storedName));

let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { materials }));
  return writing;
};

// --- Sample material (first start only): a course-outline PDF per program and official reference links ---

// A one-page PDF with a title and lines of text (Helvetica), enough for a readable sample handout
function simplePdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
  const text = [`BT /F2 18 Tf 56 780 Td (${esc(title)}) Tj ET`,
    ...lines.map((l, i) => `BT /${l.startsWith('#') ? 'F2 12' : 'F1 11'} Tf 56 ${744 - i * 18} Td (${esc(l.replace(/^#\s*/, ''))}) Tj ET`)].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = Buffer.byteLength(out); out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const OUTLINE_TOPICS = [
  '# Course modules',
  '1. Asbestos: what it is, its forms and where it was used in school buildings',
  '2. Health effects and why fibre release must be prevented',
  '3. Locations of asbestos-containing building material (ACBM) in your buildings',
  '4. Recognising damage, deterioration and delamination',
  '5. The district management plan and the Designated Person',
  '6. Work practices, notification and what to do if ACBM is disturbed',
  '',
  '# Assessment',
  'Short knowledge check at the end of the course; record completion in the system.',
];
const SAMPLE_LINKS = [
  { programId: 'awareness', title: 'EPA – Asbestos and School Buildings', url: 'https://www.epa.gov/asbestos/asbestos-and-school-buildings', description: 'EPA overview of AHERA responsibilities for schools, including staff training.' },
  { programId: 'designated-person', title: 'AHERA regulation – 40 CFR Part 763 (eCFR)', url: 'https://www.ecfr.gov/current/title-40/chapter-I/subchapter-R/part-763', description: 'Full text of the asbestos rules for schools (Subpart E), including training and management plans.' },
  { programId: 'om-16', title: 'OSHA – Asbestos', url: 'https://www.osha.gov/asbestos', description: 'OSHA asbestos standards and guidance for workers who may disturb ACM.' },
  { programId: 'respirator', title: 'OSHA – Respiratory Protection', url: 'https://www.osha.gov/respiratory-protection', description: 'Respirator selection, medical evaluation and annual fit-testing requirements.' },
];

function seedSamples(programs) {
  const now = new Date().toISOString();
  const by = { id: 'system', name: 'System (sample)' };
  const list = [];
  let n = 0;
  const id = () => `TM-${String(++n).padStart(4, '0')}`;
  for (const p of programs) {
    const storedName = `sample-${p.id}-outline.pdf`;
    const body = simplePdf(`${p.name} – Course Outline`, [
      `Duration: ${p.hours} hour${p.hours === 1 ? '' : 's'}   Renewal: ${p.renewalMonths ? `every ${p.renewalMonths} months` : 'none'}`,
      `Basis: ${p.basis}`, '', ...OUTLINE_TOPICS, '', 'SAMPLE MATERIAL - replace with your district course content.',
    ]);
    writeFileSync(materialPath(storedName), body);
    list.push({
      id: id(), programId: p.id, title: `${p.name} – Course Outline`, description: `Sample course outline: modules, duration and the requirement it meets.`,
      kind: 'pdf', url: null, sample: true, createdAt: now, createdBy: by,
      file: { id: storedName, name: `${p.id}-course-outline.pdf`, mime: 'application/pdf', size: body.length, storedName, uploadedAt: now, uploadedBy: by },
    });
  }
  for (const l of SAMPLE_LINKS) list.push({ id: id(), ...l, kind: 'link', file: null, sample: true, createdAt: now, createdBy: by });
  return list;
}

let materials = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).materials : seedSamples(PROGRAMS);
if (!existsSync(FILE)) persist();

export const getMaterials = () => materials;
export const getMaterial = (id) => materials.find((m) => m.id === id) ?? null;

export function nextMaterialId() {
  const n = materials.reduce((m, x) => Math.max(m, Number(x.id.slice(3)) || 0), 0) + 1;
  return `TM-${String(n).padStart(4, '0')}`;
}

export async function addMaterial(m) {
  materials = [...materials, m];
  await persist();
  return m;
}

export async function updateMaterial(id, patch) {
  materials = materials.map((m) => (m.id === id ? { ...m, ...patch } : m));
  await persist();
  return getMaterial(id);
}

export async function removeMaterial(id) {
  const m = getMaterial(id);
  materials = materials.filter((x) => x.id !== id);
  await persist();
  if (m?.file) await unlink(materialPath(m.file.storedName)).catch(() => {});
  return m;
}
