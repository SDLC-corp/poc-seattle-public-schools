// Keeps a floor's rooms in step with its plan:
// - uploaded plan with detected shapes → one room per shape (polygon from the shape)
// - no uploaded plan → rooms from the sample layout (generated sample floors only; floors added in the app start empty)
// Rooms that already have their own ACM materials are never deleted; if their shape is gone they stay,
// unplaced (polygon: null), so the records aren't lost.
import { floorLayout } from './floorLayout.js';
import { getRooms, addRooms, updateRoom, removeRoom, getMaterials } from './roomsStore.js';
import { getFloor, getFloors, updateFloor } from './floorsStore.js';
import { roomNumber } from './buildingGeometry.js';
import { referencedMaterialIds } from './facilityHistory.js';

const rectPolygon = (r, L) => [r.x / L.width, r.y / L.depth, (r.x + r.w) / L.width, r.y / L.depth,
  (r.x + r.w) / L.width, (r.y + r.h) / L.depth, r.x / L.width, (r.y + r.h) / L.depth].map((v) => +v.toFixed(4));

function wanted(floor) {
  if (floor.planImage && floor.shapes?.length) {
    return floor.shapes.map((s) => ({ match: { shapeId: s.id }, name: s.name, polygon: s.points, areaSqFt: null }));
  }
  if (floor.planImage) return []; // image without detection yet: nothing to place
  if (floor.derivedCounts) return []; // floors added in the app have no sample layout — rooms come from the uploaded plan or are drawn
  const L = floorLayout(floor);
  return L.rooms.map((r) => ({ match: { layoutRoomId: r.id }, name: r.name, polygon: rectPolygon(r, L), areaSqFt: Math.round(r.w * r.h * 10.7639) }));
}

export async function syncFloorRooms(floor) {
  const existing = getRooms({ floorId: floor.id });
  const hasOwnMaterials = (room) => getMaterials({ roomId: room.id }).length > 0;
  const want = wanted(floor);
  const key = (m) => (m.shapeId ? `s:${m.shapeId}` : m.layoutRoomId ? `l:${m.layoutRoomId}` : null);
  const wantedKeys = new Set(want.map((w) => key(w.match)));

  // Remove or unplace rooms whose shape is no longer on the plan (hand-drawn rooms are kept as they are)
  for (const r of existing) {
    const k = key(r);
    if (!k || wantedKeys.has(k)) continue;
    if (hasOwnMaterials(r)) await updateRoom(r.id, { polygon: null, shapeId: null, layoutRoomId: null });
    else await removeRoom(r.id);
  }

  // Update polygons of matching rooms, create rooms for new shapes (numbering continues after the rooms that remain)
  const remaining = getRooms({ floorId: floor.id });
  const byKey = new Map(remaining.map((r) => [key(r), r]));
  const fresh = [];
  let next = remaining.reduce((m, r) => Math.max(m, Number(String(r.number).slice(-2)) || 0), 0);
  for (const w of want) {
    const r = byKey.get(key(w.match));
    if (r) {
      if (JSON.stringify(r.polygon) !== JSON.stringify(w.polygon)) await updateRoom(r.id, { polygon: w.polygon });
      continue;
    }
    next += 1;
    const number = roomNumber(floor.number, next);
    fresh.push({
      floorId: floor.id, buildingId: floor.buildingId, schoolId: floor.schoolId,
      number,
      // Sample-layout classrooms are named after their room number
      name: /^Classroom \d+$/.test(w.name) ? `Classroom ${number}` : w.name,
      type: /^Classroom/.test(w.name) ? 'Classroom' : 'Other', description: '', maxOccupancy: null, status: 'Active',
      areaSqFt: w.areaSqFt, polygon: w.polygon, shapeId: null, layoutRoomId: null, ...w.match,
    });
  }
  if (fresh.length) await addRooms(fresh);
  await refreshFloorCounts(floor.id);
  return getRooms({ floorId: floor.id });
}

/**
 * A new plan replaces the floor's rooms: every room is removed (with its ACM records and files) so detection starts
 * fresh — except rooms whose ACM is referenced by inspections, surveillance or O&M work, which must be kept as
 * asbestos records; those stay without an outline, to be placed on the new plan. Returns { removed, kept }.
 */
export async function resetFloorRooms(floor) {
  const referenced = referencedMaterialIds();
  let removed = 0;
  let kept = 0;
  for (const r of getRooms({ floorId: floor.id })) {
    const mats = getMaterials({ roomId: r.id });
    if (mats.some((m) => referenced.has(m.id))) {
      await updateRoom(r.id, { polygon: null, shapeId: null, layoutRoomId: null });
      kept += 1;
    } else {
      await removeRoom(r.id);
      removed += 1;
    }
  }
  await refreshFloorCounts(floor.id);
  return { removed, kept };
}

// Floors added in the app (derivedCounts) take rooms / ACM rooms / ACM status from their mapped rooms.
// updateFloor re-syncs the building totals.
export async function refreshFloorCounts(floorId) {
  const f = getFloor(floorId);
  if (!f?.derivedCounts) return;
  const rooms = getRooms({ floorId });
  const has = (s) => rooms.some((r) => r.acmStatus === s);
  const acmStatus = has('ACM Present') ? 'ACM Present' : has('Assumed ACM') ? 'Assumed ACM' : has('No ACM') ? 'No ACM' : 'Not Assessed';
  const acmRooms = rooms.filter((r) => r.acmStatus === 'ACM Present' || r.acmStatus === 'Assumed ACM').length;
  if (f.rooms === rooms.length && f.acmRooms === acmRooms && f.acmStatus === acmStatus) return;
  await updateFloor(floorId, { rooms: rooms.length, acmRooms, acmStatus });
}

// A material can apply floor- or building-wide, so refresh every floor of the building
export async function refreshBuildingFloors(buildingId) {
  for (const f of getFloors(buildingId)) await refreshFloorCounts(f.id);
}
