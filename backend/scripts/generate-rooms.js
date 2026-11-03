// Generates MOCK rooms (from each floor's sample layout or detected shapes) and ACM materials.
// data/floors.json → data/rooms.json + data/acmMaterials.json. Deterministic (seeded by floor id).
// Rooms and materials created in the app (source: 'app') are kept.
// Usage: npm run generate:rooms
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { floorLayout, rng } from '../src/data/floorLayout.js';
import { roomNumber } from '../src/data/buildingGeometry.js';

// A missing or unreadable (e.g. truncated) file counts as empty, so the generator can rebuild it
const read = async (file, key) => {
  const url = new URL(`../data/${file}`, import.meta.url);
  if (!existsSync(url)) return [];
  try {
    return JSON.parse(await readFile(url, 'utf8'))[key] ?? [];
  } catch {
    console.warn(`data/${file} is unreadable — rebuilding it from sample data`);
    return [];
  }
};

const TYPE_RULES = [
  [/classroom/i, 'Classroom'], [/office/i, 'Office'], [/science lab/i, 'Science Lab'], [/computer lab/i, 'Computer Lab'],
  [/library/i, 'Library'], [/cafeteria/i, 'Cafeteria'], [/kitchen/i, 'Kitchen'], [/restroom/i, 'Restroom'],
  [/storage/i, 'Storage'], [/mechanical/i, 'Mechanical'], [/nurse/i, 'Nurse'], [/staff/i, 'Staff Room'],
];
const roomType = (name) => TYPE_RULES.find(([re]) => re.test(name))?.[1] ?? 'Other';
const OCCUPANCY = { Classroom: 30, 'Science Lab': 28, 'Computer Lab': 30, Library: 60, Cafeteria: 200, Office: 4, 'Staff Room': 20 };
const USAGE = {
  Classroom: 'General classroom', 'Science Lab': 'Science instruction with fume hood and sinks', 'Computer Lab': 'Computer lab with workstations',
  Library: 'Library and media center', Office: 'Staff office', Storage: 'Storage', Mechanical: 'Boiler and HVAC equipment',
  Restroom: 'Student restrooms', Cafeteria: 'Student dining', Kitchen: 'Food preparation', Nurse: 'Health room', 'Staff Room': 'Staff lounge',
};

// q: 'area' → room floor area; [min,max] → random in range
const MATERIALS = [
  { name: 'Ceiling Tile', type: 'Ceiling Tile', location: 'Ceiling (entire room)', unit: 'Sq ft', friability: 'Non-Friable', q: 'area' },
  { name: 'Floor Tile & Mastic', type: 'Vinyl Floor Tile (VAT)', location: 'Floor (entire room)', unit: 'Sq ft', friability: 'Non-Friable', q: 'area' },
  { name: 'Pipe Insulation', type: 'Thermal System Insulation (TSI)', location: 'Above ceiling – pipe runs', unit: 'Linear ft', friability: 'Friable', q: [20, 120] },
  { name: 'Duct Wrap', type: 'Thermal System Insulation (TSI)', location: 'HVAC duct in ceiling plenum', unit: 'Linear ft', friability: 'Friable', q: [15, 80] },
  { name: 'Acoustic Plaster', type: 'Surfacing Material', location: 'Ceiling', unit: 'Sq ft', friability: 'Friable', q: 'area' },
  { name: 'Wall Plaster / Joint Compound', type: 'Joint Compound / Plaster', location: 'Walls', unit: 'Sq ft', friability: 'Non-Friable', q: [150, 600] },
  { name: 'Transite Panel', type: 'Asbestos Cement (AC)', location: 'Wall panels / counter tops', unit: 'Sq ft', friability: 'Non-Friable', q: [20, 120] },
  { name: 'Window Glazing', type: 'Window Glazing', location: 'Exterior windows', unit: 'Linear ft', friability: 'Non-Friable', q: [30, 150] },
  { name: 'Fire Door Core', type: 'Miscellaneous Material', location: 'Corridor door', unit: 'Each', friability: 'Non-Friable', q: [1, 2] },
];

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const between = (rand, min, max) => Math.round(min + rand() * (max - min));
const DAY = 86400000;
const isoDay = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function risk(friability, condition) {
  if (condition === 'Significantly Damaged' || (friability === 'Friable' && condition === 'Damaged')) return 'High';
  if (condition === 'Damaged' || friability === 'Friable') return 'Medium';
  return 'Low';
}

// Room polygons: detected shapes on an uploaded plan, else the sample layout's rectangles (0–1 fractions)
function roomShapes(floor) {
  if (floor.planImage && floor.shapes?.length) {
    return floor.shapes.map((s) => ({ key: s.id, name: s.name, polygon: s.points, areaSqFt: null, shapeId: s.id }));
  }
  const L = floorLayout(floor);
  return L.rooms.map((r) => ({
    key: r.id,
    name: r.name,
    polygon: [r.x / L.width, r.y / L.depth, (r.x + r.w) / L.width, r.y / L.depth, (r.x + r.w) / L.width, (r.y + r.h) / L.depth, r.x / L.width, (r.y + r.h) / L.depth].map((v) => +v.toFixed(4)),
    areaSqFt: Math.round(r.w * r.h * 10.7639),
    layoutRoomId: r.id,
  }));
}

function generate(floor, buildingYear, now) {
  const rand = rng(`${floor.id}:rooms`);
  const rooms = roomShapes(floor).map((s, i) => {
    const type = roomType(s.name);
    const number = roomNumber(floor.number, i + 1);
    return {
      id: `${floor.id}-${s.key}`,
      floorId: floor.id, buildingId: floor.buildingId, schoolId: floor.schoolId,
      number,
      // Classrooms are named after their room number ("Classroom 303" is room 303)
      name: type === 'Classroom' ? `Classroom ${number}` : s.name,
      type,
      description: USAGE[type] ?? '',
      maxOccupancy: OCCUPANCY[type] ?? null,
      status: 'Active',
      areaSqFt: s.areaSqFt,
      polygon: s.polygon,
      layoutRoomId: s.layoutRoomId ?? null,
      shapeId: s.shapeId ?? null,
      photos: [],
      source: 'sample',
    };
  });

  // ACM: about as many rooms as the floor's ACM share, at least one when the floor has ACM rooms
  const materials = [];
  const order = [...rooms].sort(() => rand() - 0.5).filter((r) => r.type !== 'Restroom');
  const acmCount = floor.acmRooms ? Math.min(order.length, Math.max(1, Math.round(rooms.length * (floor.acmRooms / floor.rooms)))) : 0;
  order.forEach((room, idx) => {
    const hasAcm = idx < acmCount;
    // Rooms without ACM: some were sampled (negative result), the rest not yet assessed
    if (!hasAcm && rand() > (buildingYear < 1981 ? 0.3 : 0.2)) return;
    const status = hasAcm ? floor.acmStatus : 'No ACM';
    const count = hasAcm ? 1 + (rand() < 0.35 ? 1 : 0) : 1;
    const used = new Set();
    for (let k = 0; k < count; k += 1) {
      let def = pick(rand, MATERIALS);
      while (used.has(def.name)) def = pick(rand, MATERIALS);
      used.add(def.name);
      const assessed = now - between(rand, 20, 700) * DAY;
      const condition = status === 'No ACM' ? 'Good'
        : status === 'Assumed ACM' && rand() < 0.4 ? 'Not Assessed'
          : pick(rand, ['Good', 'Good', 'Good', 'Damaged', 'Damaged', 'Significantly Damaged']);
      const pct = between(rand, 2, 25);
      materials.push({
        id: `ACM-${room.id}-${k + 1}`,
        roomId: room.id, floorId: floor.id, buildingId: floor.buildingId, schoolId: floor.schoolId,
        scope: 'room',
        name: def.name,
        materialType: def.type,
        location: def.location,
        quantity: def.q === 'area' ? room.areaSqFt ?? between(rand, 200, 900) : between(rand, def.q[0], def.q[1]),
        unit: def.unit,
        friability: def.friability,
        classification: status === 'ACM Present' ? 'Confirmed' : status === 'No ACM' ? 'Negative'
          : def.friability === 'Friable' ? 'Presumed (PACM)' : 'Assumed',
        condition,
        riskRanking: status === 'No ACM' ? 'Low' : risk(def.friability, condition),
        assessmentDate: isoDay(assessed),
        acmStatus: status,
        notes: status === 'ACM Present' ? `Confirmed ACM per bulk sample report (${pct}% chrysotile).`
          : status === 'Assumed ACM' ? 'Not yet sampled; treated as ACM under AHERA until lab results are received.'
            : 'Bulk sample negative (<1% asbestos).',
        relatedTracking: status === 'ACM Present' ? ['Inspection', 'Sample Results'] : status === 'Assumed ACM' ? ['Inspection'] : ['Sample Results'],
        attachments: [],
        createdAt: new Date(assessed).toISOString(),
        createdBy: { id: null, name: 'Sample data' },
        source: 'sample',
      });
    }
  });
  return { rooms, materials };
}

async function main() {
  const floors = await read('floors.json', 'floors');
  const buildings = await read('buildings.json', 'buildings');
  const yearOf = new Map(buildings.map((b) => [b.id, b.yearBuilt]));
  const keptRooms = (await read('rooms.json', 'rooms')).filter((r) => r.source === 'app');
  const keptMaterials = (await read('acmMaterials.json', 'materials')).filter((m) => m.source === 'app');
  // Floors that already have app-made rooms keep them instead of generated ones
  const appFloors = new Set(keptRooms.map((r) => r.floorId));
  const now = Date.now();

  const rooms = [];
  const materials = [];
  for (const f of floors) {
    if (appFloors.has(f.id)) continue;
    const out = generate(f, yearOf.get(f.buildingId) ?? 1970, now);
    rooms.push(...out.rooms);
    materials.push(...out.materials);
  }
  const allRooms = [...rooms, ...keptRooms];
  const roomIds = new Set(allRooms.map((r) => r.id));
  const allMaterials = [...materials, ...keptMaterials.filter((m) => roomIds.has(m.roomId) || m.scope !== 'room')];

  const out = (file, key, list) => writeFile(new URL(`../data/${file}`, import.meta.url), JSON.stringify({
    note: `MOCK DATA — generated from floors.json by scripts/generate-rooms.js`, generatedAt: new Date().toISOString(), [key]: list,
  }, null, 2));
  await out('rooms.json', 'rooms', allRooms);
  await out('acmMaterials.json', 'materials', allMaterials);
  const by = (s) => allMaterials.filter((m) => m.acmStatus === s).length;
  console.log(`Wrote ${allRooms.length} rooms and ${allMaterials.length} ACM materials (present ${by('ACM Present')}, assumed ${by('Assumed ACM')}, negative ${by('No ACM')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
