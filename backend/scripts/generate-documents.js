// Generates SAMPLE document records (metadata only, no files) → data/documents.json.
// Real uploads (source "upload", sample: false) are kept; previous samples are replaced.
// Usage: npm run generate:documents
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const DOCS_FILE = new URL('../data/documents.json', import.meta.url);
const COUNT = 240;

function rng(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng('sps-documents');
const pick = (list) => list[Math.floor(rand() * list.length)];
const num = (min, max) => Math.floor(min + rand() * (max - min + 1));

const { schools } = read('schools.json');
const { buildings } = read('buildings.json');
const { users } = read('users.json');
const staff = users.filter((u) => ['ehs-manager', 'facilities-manager', 'inspector'].includes(u.roleId));
const room = () => `Room ${num(1, 3)}${String(num(1, 40)).padStart(2, '0')}`;

// type → [weight, () => { name, ext, relatedTo, access, district? }]
const TEMPLATES = [
  ['Management Plan', 10, (s) => ({ name: `Management Plan ${num(2022, 2026)} – ${s.name}.pdf`, relatedTo: 'Building', access: 'Restricted' })],
  ['Inspection Report', 14, () => { const r = room(); return { name: `Inspection Report – ${r}.pdf`, relatedTo: r, access: 'Internal' } }],
  ['Lab Report', 10, () => { const n = String(num(1, 300)).padStart(3, '0'); return { name: `Lab Results – Sample ${n}.xlsx`, relatedTo: `Sample #${n}`, access: 'Restricted' } }],
  ['Floor Plan', 8, () => ({ name: `Floor Plan – Floor ${num(1, 3)}.png`, relatedTo: 'Floor Plan', access: 'Internal' })],
  ['Training Record', 6, () => ({ name: `Training Record – ${pick(['Contractor', 'Custodial', 'O&M'])} ${num(2024, 2026)}.pdf`, relatedTo: 'Contractor', access: 'Internal', district: true })],
  ['Notification', 6, (s) => ({ name: `Annual AHERA Notification – ${s.name}.docx`, relatedTo: 'School', access: 'Public' })],
  ['Photo', 14, () => { const r = room(); return { name: `ACM Photo – ${pick(['Pipe Insulation', 'Ceiling Tile', 'Floor Tile', 'Duct Wrap'])} ${r}.jpg`, relatedTo: r, access: 'Internal' } }],
  ['O&M Record', 6, () => ({ name: `O&M Activity – ${num(2025, 2026)}.docx`, relatedTo: 'Building', access: 'Internal' })],
  ['Air Monitoring', 5, () => ({ name: `Air Monitoring Results – ${pick(['Clearance', 'Baseline', 'Area'])}.pdf`, relatedTo: 'Project', access: 'Restricted' })],
  ['Response Action', 6, () => ({ name: `Response Action Report – ${pick(['Repair', 'Encapsulation', 'Removal'])}.pdf`, relatedTo: 'Project', access: 'Restricted' })],
  ['Other', 3, () => ({ name: `Correspondence – ${pick(['Contractor', 'State Agency', 'Vendor'])}.pdf`, relatedTo: 'Other', access: 'Internal' })],
];
const totalWeight = TEMPLATES.reduce((n, t) => n + t[1], 0);
const pickTemplate = () => {
  let r = rand() * totalWeight;
  return TEMPLATES.find((t) => (r -= t[1]) < 0) ?? TEMPLATES[0];
};

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

function buildSamples() {
  const now = Date.now();
  return Array.from({ length: COUNT }, (_, i) => {
    const [type, , make] = pickTemplate();
    const school = pick(schools);
    const made = make(school);
    const schoolBuildings = buildings.filter((b) => b.schoolId === school.id);
    const building = made.district || !schoolBuildings.length ? null : pick(schoolBuildings);
    const ext = made.name.split('.').pop();
    const source = rand() < 0.68 ? 'sharepoint' : 'upload';
    const u = pick(staff);
    const uploadedAt = new Date(now - num(0, 540) * 86400000 - num(0, 86399) * 1000).toISOString();
    return {
      id: `SAMPLE-DOC-${String(i + 1).padStart(4, '0')}`,
      name: made.name,
      type,
      ext,
      mime: MIME[ext],
      size: ext === 'png' || ext === 'jpg' ? num(300, 6000) * 1024 : num(80, 4200) * 1024,
      schoolId: made.district ? null : school.id,
      schoolName: made.district ? null : school.name,
      buildingId: building?.id ?? null,
      buildingName: building?.name ?? null,
      relatedTo: made.relatedTo,
      access: made.access,
      source,
      sharepointPath: source === 'sharepoint'
        ? `/sites/EHS/Asbestos/${type.replace(/[^A-Za-z]+/g, '')}/${made.name}` : null,
      storedName: null,
      uploadedAt,
      uploadedBy: { id: u.id, name: u.name },
      sample: true,
    };
  });
}

async function main() {
  const existing = existsSync(DOCS_FILE) ? JSON.parse(readFileSync(DOCS_FILE, 'utf8')).documents : [];
  const real = existing.filter((d) => !d.sample);
  await writeFile(DOCS_FILE, JSON.stringify({ documents: [...real, ...buildSamples()] }, null, 2));
  console.log(`Wrote ${real.length + COUNT} documents (${real.length} real uploads kept, ${COUNT} sample records)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
