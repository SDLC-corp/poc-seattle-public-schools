// Generates MOCK floors (max 3 per building) from data/buildings.json → data/floors.json.
// Rooms and ACM rooms are split across each building's floors so the totals match the building.
// A few ACM-labelled rooms are pinned on the sample floor plan. Floors created in the app (source: 'app') are kept.
// Usage: npm run generate:floors
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { floorLayout, rng, PLAN_W, PLAN_D } from '../src/data/floorLayout.js';
import { FLOOR_NAMES } from '../src/data/buildingGeometry.js';

const BUILDINGS_FILE = new URL('../data/buildings.json', import.meta.url);
const OUT_FILE = new URL('../data/floors.json', import.meta.url);

const MATERIALS = [
  '9"x9" vinyl floor tile & mastic', 'Pipe insulation (TSI)', 'Ceiling tile 2x4', 'Sprayed-on acoustic plaster',
  'Boiler insulation (TSI)', 'Duct wrap', 'Window glazing compound', 'Fire door core', 'Transite wall panel',
];
const CONDITIONS = ['Good', 'Good', 'Good', 'Damaged', 'Significantly Damaged'];

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

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
  return rooms.map((r, i) => {
    const floor = {
      id: `${b.id}-f${i + 1}`,
      buildingId: b.id,
      schoolId: b.schoolId,
      number: i + 1,
      name: FLOOR_NAMES[i],
      rooms: r,
      acmRooms: acm[i],
      acmStatus: acm[i] ? b.acmStatus : 'No ACM',
      planImage: null,
      labels: [],
      source: 'sample',
    };
    if (acm[i]) {
      const layout = floorLayout(floor);
      const candidates = layout.rooms.filter((rm) => !/Restrooms/.test(rm.name));
      const count = Math.min(acm[i], 1 + Math.floor(rand() * 3), candidates.length);
      floor.labels = candidates.sort(() => rand() - 0.5).slice(0, count).map((rm, k) => ({
        id: `L${k + 1}`,
        roomId: rm.id,
        name: rm.name,
        x: +((rm.x + rm.w / 2) / PLAN_W).toFixed(4),
        y: +((rm.y + rm.h / 2) / PLAN_D).toFixed(4),
        acmStatus: floor.acmStatus,
        material: pick(rand, MATERIALS),
        condition: floor.acmStatus === 'Assumed ACM' ? 'Not assessed' : pick(rand, CONDITIONS),
      }));
    }
    return floor;
  });
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
