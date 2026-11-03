// Generates MOCK floors (max 3 per building) from data/buildings.json → data/floors.json.
// Rooms and ACM rooms are split across each building's floors so the totals match the building.
// Rooms and ACM materials on each floor come from scripts/generate-rooms.js. Floors created in the app (source: 'app') are kept.
// Usage: npm run generate:floors
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { rng } from '../src/data/floorLayout.js';
import { floorName } from '../src/data/buildingGeometry.js';

const BUILDINGS_FILE = new URL('../data/buildings.json', import.meta.url);
const OUT_FILE = new URL('../data/floors.json', import.meta.url);

// Split n into `parts` integers (random weights) that add up to n
function split(rand, n, parts, caps) {
  const weights = Array.from({ length: parts }, () => 0.5 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w, i) => Math.min(caps?.[i] ?? Infinity, Math.floor((w / sum) * n)));
  let left = n - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % parts) {
    if (out[i] < (caps?.[i] ?? Infinity)) { out[i] += 1; left -= 1; }
  }
  return out;
}

function floorsFor(b) {
  const rand = rng(`${b.id}:floors`);
  const rooms = split(rand, b.rooms, b.floors);
  const acm = split(rand, b.roomsWithAcm, b.floors, rooms);
  return rooms.map((r, i) => ({
    id: `${b.id}-f${i + 1}`,
    buildingId: b.id,
    schoolId: b.schoolId,
    number: i, // 0 = ground floor
    name: floorName(i),
    rooms: r,
    acmRooms: acm[i],
    acmStatus: acm[i] ? b.acmStatus : 'No ACM',
    planImage: null,
    shapes: [],
    source: 'sample',
  }));
}

async function main() {
  const { buildings } = JSON.parse(await readFile(BUILDINGS_FILE, 'utf8'));
  const kept = existsSync(OUT_FILE)
    ? JSON.parse(await readFile(OUT_FILE, 'utf8')).floors.filter((f) => f.source === 'app')
    : [];
  // A sample floor edited in the app becomes source 'app' and replaces its generated version
  const keptIds = new Set(kept.map((f) => f.id));
  const generated = buildings.filter((b) => b.source !== 'app').flatMap(floorsFor).filter((f) => !keptIds.has(f.id));
  const floors = [...generated, ...kept];

  await writeFile(OUT_FILE, JSON.stringify({
    note: 'MOCK DATA — generated from buildings.json by scripts/generate-floors.js',
    generatedAt: new Date().toISOString(),
    floors,
  }, null, 2));
  console.log(`Wrote ${floors.length} floors (${kept.length} added in the app) to data/floors.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
