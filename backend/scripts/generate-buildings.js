// Generates 3 MOCK buildings per school from data/schools.json → data/buildings.json.
// Output is deterministic (seeded by school id), so re-running gives the same data.
// Buildings added in the app (source: 'app') are kept.
// Usage: npm run generate:buildings
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import {
  MAX_FLOORS, PRESUMED_ACM_BEFORE, GAP_M, offset, rectangle, shape, estimateRooms,
} from '../src/data/buildingGeometry.js';

const SCHOOLS_FILE = new URL('../data/schools.json', import.meta.url);
const OUT_FILE = new URL('../data/buildings.json', import.meta.url);
const BUILDINGS_PER_SCHOOL = 3;

// Slot 1 is always the main building; slots 2 and 3 pick from these.
const SECONDARY = ['Gymnasium', 'Annex', 'Science Wing', 'Library Building', 'Cafeteria Building'];
const TERTIARY = ['Portable Classrooms', 'Performing Arts Center', 'Maintenance Building', 'Early Learning Center', 'Career & Technical Wing'];
const CONSTRUCTION = ['Concrete', 'Masonry', 'Steel Frame', 'Wood Frame'];

// Small seeded PRNG (mulberry32) so each school always gets the same buildings
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

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const between = (rand, min, max) => Math.round(min + rand() * (max - min));

// Rooms and ACM use their own seed so the building layout above stays unchanged
function acmFields(acmRand, yearBuilt, areaSqFt) {
  const rooms = estimateRooms(areaSqFt);
  if (yearBuilt >= PRESUMED_ACM_BEFORE) return { rooms, roomsWithAcm: 0, acmStatus: 'No ACM' };
  // Pre-1981: most have been sampled and confirmed; the rest are still assumed
  const confirmed = acmRand() < 0.6;
  const share = confirmed ? 0.15 + acmRand() * 0.25 : 0.1 + acmRand() * 0.2;
  return {
    rooms,
    roomsWithAcm: Math.max(1, Math.round(rooms * share)),
    acmStatus: confirmed ? 'ACM Present' : 'Assumed ACM',
  };
}

function buildingsFor(school) {
  const rand = rng(school.id);
  const acmRand = rng(`${school.id}:acm`);
  const names = ['Main Building', pick(rand, SECONDARY), pick(rand, TERTIARY)];
  const mainYear = between(rand, 1905, 2018);

  const records = names.slice(0, BUILDINGS_PER_SCHOOL).map((name, i) => {
    const yearBuilt = i === 0 ? mainYear : Math.min(2024, mainYear + between(rand, 0, 50));
    const isPortable = name === 'Portable Classrooms';
    const floors = isPortable ? 1 : Math.min(MAX_FLOORS, between(rand, 1, i === 0 ? 4 : 2));
    const areaSqFt = isPortable ? between(rand, 1800, 4800) : between(rand, i === 0 ? 40000 : 6000, i === 0 ? 180000 : 30000);

    return {
      id: `${school.id}-b${i + 1}`,
      schoolId: school.id,
      schoolName: school.name,
      code: `${school.id.toUpperCase()}-${String.fromCharCode(65 + i)}`,
      name,
      yearBuilt,
      floors,
      areaSqFt,
      construction: isPortable ? 'Modular' : pick(rand, CONSTRUCTION),
      presumedAcm: yearBuilt < PRESUMED_ACM_BEFORE,
      ...acmFields(acmRand, yearBuilt, areaSqFt),
      ...shape(areaSqFt, floors, isPortable),
      location: null,
      footprint: null,
    };
  });

  if (!school.location) return records;

  // Campus layout: main building on the school's point, building 2 to the east, building 3 to the south
  const [main, east, south] = records;
  const placements = [
    school.location,
    offset(school.location, main.widthM / 2 + GAP_M + (east?.widthM ?? 0) / 2, 0),
    offset(school.location, 0, -(main.depthM / 2 + GAP_M + (south?.depthM ?? 0) / 2)),
  ];

  return records.map((b, i) => ({
    ...b,
    location: { lat: +placements[i].lat.toFixed(6), lng: +placements[i].lng.toFixed(6) },
    footprint: { type: 'Polygon', coordinates: [rectangle(placements[i], b.widthM, b.depthM)] },
  }));
}

async function main() {
  const { schools } = JSON.parse(await readFile(SCHOOLS_FILE, 'utf8'));
  const added = existsSync(OUT_FILE)
    ? JSON.parse(await readFile(OUT_FILE, 'utf8')).buildings.filter((b) => b.source === 'app')
    : [];
  const buildings = [...schools.flatMap(buildingsFor), ...added];

  await writeFile(OUT_FILE, JSON.stringify({
    note: 'MOCK DATA — generated from schools.json by scripts/generate-buildings.js',
    generatedAt: new Date().toISOString(),
    count: buildings.length,
    buildings,
  }, null, 2));

  console.log(`Wrote ${buildings.length} buildings (${added.length} added in the app) for ${schools.length} schools to data/buildings.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
