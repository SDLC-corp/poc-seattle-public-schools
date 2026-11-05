import { readFileSync } from 'node:fs';
import { GAP_M, PRESUMED_ACM_BEFORE, offset, rectangle, shape } from './buildingGeometry.js';
import { writeJson, readPath } from './atomicWrite.js';

const dataFile = (file) => new URL(`../../data/${file}`, import.meta.url);
const load = (file) => JSON.parse(readFileSync(readPath(dataFile(file)), 'utf8'));

const schoolsDoc = load('schools.json');
// Mutated in place so every importer sees schools added in the app
export const { schools } = schoolsDoc;
const buildingsDoc = load('buildings.json');
// Mutated in place so every importer sees buildings added or edited in the app
export const { buildings } = buildingsDoc;

export const getSchoolBuildings = (schoolId) => buildings.filter((b) => b.schoolId === schoolId);

let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(dataFile('buildings.json'), {
    ...buildingsDoc, count: buildings.length, buildings,
  }));
  return writing;
};

let writingSchools = Promise.resolve();

/** fields: { name, type, category, address: { street, city, state, zip }, phone, website, principal, principalEmail, boardDistrict, location } */
export async function addSchool(fields) {
  // id from the name, like the district's own ids ("adamses"), kept unique
  const base = fields.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'school';
  let id = base;
  for (let n = 2; schools.some((s) => s.id === id); n += 1) id = `${base}${n}`;
  const a = fields.address;
  const school = {
    id, name: fields.name, type: fields.type, category: fields.category,
    address: { ...a, full: `${a.street}, ${a.city}, ${a.state} ${a.zip}` },
    website: fields.website || null, profileUrl: null, phone: fields.phone || null, fax: null,
    principal: fields.principal ? `Principal: ${fields.principal}` : null, principalTitle: fields.principal ? 'Principal' : null,
    principalEmail: fields.principalEmail || null, boardDistrict: fields.boardDistrict ?? null, boardDistrictUrl: null,
    location: fields.location ?? null, source: 'app',
  };
  schools.push(school);
  writingSchools = writingSchools.then(() => writeJson(dataFile('schools.json'), { ...schoolsDoc, count: schools.length, schools }));
  await writingSchools;
  return school;
}

const placeAt = (b, center) => ({
  ...b,
  location: { lat: +center.lat.toFixed(6), lng: +center.lng.toFixed(6) },
  footprint: { type: 'Polygon', coordinates: [rectangle(center, b.widthM, b.depthM)] },
});

// New buildings go north of the school's northernmost building so they show on the 3D map
function placeNew(b, school) {
  const anchor = getSchoolBuildings(school.id).filter((x) => x.location)
    .sort((x, y) => y.location.lat - x.location.lat)[0];
  if (anchor) return placeAt(b, offset(anchor.location, 0, anchor.depthM / 2 + GAP_M + b.depthM / 2));
  return school.location ? placeAt(b, school.location) : b;
}

/** fields: { name, code, yearBuilt, floors, areaSqFt, construction, rooms, roomsWithAcm, acmStatus } */
export async function addBuilding(school, fields) {
  const mine = getSchoolBuildings(school.id);
  const n = mine.reduce((m, b) => Math.max(m, Number(b.id.split('-b').at(-1)) || 0), 0) + 1;
  const isPortable = fields.construction === 'Modular';
  const building = placeNew({
    id: `${school.id}-b${n}`,
    schoolId: school.id,
    schoolName: school.name,
    ...fields,
    presumedAcm: fields.yearBuilt < PRESUMED_ACM_BEFORE,
    ...shape(fields.areaSqFt, fields.floors, isPortable),
    location: null,
    footprint: null,
    source: 'app',
  }, school);
  buildings.push(building);
  await persist();
  return building;
}

export async function updateBuilding(id, fields) {
  const i = buildings.findIndex((b) => b.id === id);
  const merged = { ...buildings[i], ...fields, presumedAcm: (fields.yearBuilt ?? buildings[i].yearBuilt) < PRESUMED_ACM_BEFORE };
  const resized = { ...merged, ...shape(merged.areaSqFt, merged.floors, merged.construction === 'Modular') };
  buildings[i] = merged.location ? placeAt(resized, merged.location) : resized;
  await persist();
  return buildings[i];
}
