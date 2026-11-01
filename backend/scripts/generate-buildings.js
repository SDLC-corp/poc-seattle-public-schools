// Generates 3 MOCK buildings per school from data/schools.json → data/buildings.json.
// Output is deterministic (seeded by school id), so re-running gives the same data.
// Usage: npm run generate:buildings
import { readFile, writeFile } from 'node:fs/promises';

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

const SQFT_TO_M2 = 0.092903;
const FLOOR_HEIGHT_M = 4;
const GAP_M = 12; // spacing between buildings on a campus
const M_PER_DEG_LAT = 111320;

// Offset a lat/lng by metres east/north
function offset({ lat, lng }, eastM, northM) {
  return {
    lat: lat + northM / M_PER_DEG_LAT,
    lng: lng + eastM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)),
  };
}

// Axis-aligned rectangle (GeoJSON Polygon ring) centred on a point
function rectangle(center, widthM, depthM) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  return corners.map(([x, y]) => {
    const p = offset(center, (x * widthM) / 2, (y * depthM) / 2);
    return [+p.lng.toFixed(7), +p.lat.toFixed(7)];
  });
}

function buildingsFor(school) {
  const rand = rng(school.id);
  const names = ['Main Building', pick(rand, SECONDARY), pick(rand, TERTIARY)];
  const mainYear = between(rand, 1905, 2018);

  const records = names.slice(0, BUILDINGS_PER_SCHOOL).map((name, i) => {
    const yearBuilt = i === 0 ? mainYear : Math.min(2024, mainYear + between(rand, 0, 50));
    const isPortable = name === 'Portable Classrooms';
    const floors = isPortable ? 1 : between(rand, 1, i === 0 ? 4 : 2);
    const areaSqFt = isPortable ? between(rand, 1800, 4800) : between(rand, i === 0 ? 40000 : 6000, i === 0 ? 180000 : 30000);

    // Footprint: floor area per storey as a ~1.6:1 rectangle
    const floorM2 = (areaSqFt * SQFT_TO_M2) / floors;
    const widthM = Math.sqrt(floorM2 * 1.6);
    const depthM = floorM2 / widthM;

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
      // EPA treats buildings constructed before 1981 as presumed to contain asbestos
      presumedAcm: yearBuilt < 1981,
      heightM: isPortable ? 3.5 : floors * FLOOR_HEIGHT_M + 1,
      widthM: +widthM.toFixed(1),
      depthM: +depthM.toFixed(1),
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
  const buildings = schools.flatMap(buildingsFor);

  await writeFile(OUT_FILE, JSON.stringify({
    note: 'MOCK DATA — generated from schools.json by scripts/generate-buildings.js',
    generatedAt: new Date().toISOString(),
    count: buildings.length,
    buildings,
  }, null, 2));

  console.log(`Wrote ${buildings.length} buildings for ${schools.length} schools to data/buildings.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
