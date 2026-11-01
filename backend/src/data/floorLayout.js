// Deterministic SAMPLE floor plan for a floor (used when no real plan image is uploaded).
// Double-loaded corridor: a row of rooms above and below, with stairs (or the lobby on the ground floor).
// Units are metres inside a fixed PLAN_W × PLAN_D frame; label pins are stored as 0–1 fractions of it.
export const PLAN_W = 30;
export const PLAN_D = 20;
const CORRIDOR_Y = 8.6;
const CORRIDOR_H = 2.8;
const STAIRS_W = 4;

export function rng(seedText) {
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

const OTHER_ROOMS = ['Office', 'Storage', 'Restrooms', 'Mechanical', 'Science Lab', 'Library', 'Staff Room', 'Computer Lab'];
const GROUND_ROOMS = ['Main Office', 'Nurse', 'Cafeteria', 'Kitchen'];

// Split `total` metres into n widths with some variety
function splitWidths(rand, total, n) {
  const weights = Array.from({ length: n }, () => 0.7 + rand() * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}

// floor: { id or layoutSeed, number }. Floors added in the app keep the seed they were previewed with.
export function floorLayout(floor) {
  const rand = rng(`${floor.layoutSeed ?? floor.id}:plan`);
  const perRow = 3 + Math.floor(rand() * 3); // 3–5 rooms per side
  const rooms = [];
  let classroom = 1;
  let groundIdx = 0;
  const used = new Map();

  const nameFor = () => {
    if (floor.number === 1 && groundIdx < GROUND_ROOMS.length && rand() < 0.45) return GROUND_ROOMS[groundIdx++];
    if (rand() < 0.62) return `Classroom ${floor.number}${String(classroom++).padStart(2, '0')}`;
    const base = OTHER_ROOMS[Math.floor(rand() * OTHER_ROOMS.length)];
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n > 1 ? `${base} ${n}` : base;
  };
  const add = (x, y, w, h) => {
    rooms.push({ id: `r${rooms.length + 1}`, name: nameFor(), x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2) });
  };

  // Top row
  let x = 0;
  for (const w of splitWidths(rand, PLAN_W, perRow)) { add(x, 0, w, CORRIDOR_Y); x += w; }

  // Bottom row with stairs / lobby in the middle
  const bottomY = CORRIDOR_Y + CORRIDOR_H;
  const bottomH = PLAN_D - bottomY;
  const left = Math.floor(perRow / 2);
  const right = perRow - left;
  const stairsX = (PLAN_W - STAIRS_W) / 2;
  x = 0;
  for (const w of splitWidths(rand, stairsX, left)) { add(x, bottomY, w, bottomH); x += w; }
  x = stairsX + STAIRS_W;
  for (const w of splitWidths(rand, PLAN_W - x, right)) { add(x, bottomY, w, bottomH); x += w; }

  return {
    width: PLAN_W,
    depth: PLAN_D,
    corridor: { x: 0, y: CORRIDOR_Y, w: PLAN_W, h: CORRIDOR_H },
    stairs: { x: stairsX, y: bottomY, w: STAIRS_W, h: bottomH, label: floor.number === 1 ? 'Lobby / Entrance' : 'Stairs' },
    rooms,
    sample: true,
  };
}
