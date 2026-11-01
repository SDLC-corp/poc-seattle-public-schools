import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { GAP_M, PRESUMED_ACM_BEFORE, offset, rectangle, shape } from './buildingGeometry.js';

const dataFile = (file) => new URL(`../../data/${file}`, import.meta.url);
const load = (file) => JSON.parse(readFileSync(dataFile(file), 'utf8'));

export const { schools } = load('schools.json');
const buildingsDoc = load('buildings.json');
// Mutated in place so every importer sees buildings added or edited in the app
export const { buildings } = buildingsDoc;

export const getSchoolBuildings = (schoolId) => buildings.filter((b) => b.schoolId === schoolId);

let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeFile(dataFile('buildings.json'), JSON.stringify({
    ...buildingsDoc, count: buildings.length, buildings,
  }, null, 2)));
  return writing;
};

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
