import { naturalCompare } from '../data/naturalSort.js';
import { Router } from 'express';
import { schools, buildings, findSchool, findBuilding } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, allRooms } from '../data/roomsStore.js';
import * as META from '../data/acmMeta.js';
import { logAudit } from '../data/auditStore.js';

// Read-only views of the ACM inventory (acmMaterials.json). Creating and editing still goes through
// /api/acm-materials, so validation and audit stay in one place.

const router = Router();

// Looked up live so schools added in the app are found
const schoolName = { get: (id) => findSchool(id)?.name };
// Looked up live so buildings added in the app are found
const buildingById = { get: (id) => findBuilding(id) };
const addYears = (iso, n) => (iso ? `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}` : '');
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function records() {
  const floors = new Map(getAllFloors().map((f) => [f.id, f]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  return getMaterials().map((m) => {
    const room = rooms.get(m.roomId);
    const floor = floors.get(m.floorId);
    return {
      id: m.id,
      schoolId: m.schoolId,
      schoolName: schoolName.get(m.schoolId) ?? m.schoolId,
      buildingId: m.buildingId,
      buildingName: buildingById.get(m.buildingId)?.name ?? m.buildingId,
      floorId: m.floorId,
      floorName: floor?.name ?? '',
      floorNumber: floor?.number ?? 0,
      roomId: m.roomId,
      roomNumber: room?.number ?? '',
      roomName: room?.name ?? '',
      name: m.name,
      materialType: m.materialType,
      location: m.location,
      quantity: m.quantity,
      unit: m.unit,
      friability: m.friability,
      classification: m.classification,
      condition: m.condition || 'Not Assessed',
      riskRanking: m.riskRanking,
      acmStatus: m.acmStatus,
      assessmentDate: m.assessmentDate,
      nextDue: addYears(m.assessmentDate, 3), // AHERA 3-year reinspection
      attachments: m.attachments?.length ?? 0,
    };
  });
}

// Location filters (school/building/floor) are separate so the hierarchy tree can ignore them
function filterRecords(list, { school, building, floor, type, condition, status, q }, { location = true } = {}) {
  const term = q?.trim().toLowerCase();
  return list.filter((r) => (!location || ((!school || r.schoolId === school)
      && (!building || r.buildingId === building)
      && (!floor || r.floorId === floor)))
    && (!type || r.materialType === type)
    && (!condition || r.condition === condition)
    && (!status || r.acmStatus === status)
    && (!term || [r.id, r.name, r.materialType, r.location, r.roomNumber, r.roomName, `rm-${r.roomNumber}`]
      .some((v) => String(v ?? '').toLowerCase().includes(term))));
}

const SORTS = {
  id: (r) => r.id,
  room: (r) => `${r.schoolName} ${r.buildingName} ${String(r.floorNumber).padStart(3, '0')} ${r.roomNumber}`,
  material: (r) => r.name,
  quantity: (r) => r.quantity,
  condition: (r) => ['Significantly Damaged', 'Damaged', 'Not Assessed', 'Good'].indexOf(r.condition),
  status: (r) => ['ACM Present', 'Assumed ACM', 'No ACM'].indexOf(r.acmStatus),
  risk: (r) => ['High', 'Medium', 'Low'].indexOf(r.riskRanking),
  assessmentDate: (r) => r.assessmentDate,
  nextDue: (r) => r.nextDue,
};

function sortRecords(list, sort, dir) {
  const key = SORTS[sort] ? sort : 'room';
  const get = SORTS[key];
  const d = (dir ?? 'asc') === 'desc' ? -1 : 1;
  return {
    key,
    dir: d === 1 ? 'asc' : 'desc',
    rows: [...list].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return d * (typeof x === 'number' ? x - y : naturalCompare(String(x), String(y)))
        || naturalCompare(a.id, b.id);
    }),
  };
}

function stats(list) {
  const n = (c) => list.filter((r) => r.condition === c).length;
  const pct = (v) => (list.length ? Math.round((v / list.length) * 1000) / 10 : 0);
  const good = n('Good');
  const damaged = n('Damaged');
  const sig = n('Significantly Damaged');
  return {
    total: list.length,
    good, goodPct: pct(good),
    damaged, damagedPct: pct(damaged),
    significantlyDamaged: sig, significantlyDamagedPct: pct(sig),
    notAssessed: n('Not Assessed'),
    acmPresent: list.filter((r) => r.acmStatus === 'ACM Present').length,
    assumed: list.filter((r) => r.acmStatus === 'Assumed ACM').length,
    facilities: new Set(list.map((r) => r.schoolId)).size,
  };
}

// GET /api/acm-inventory?school=&building=&floor=&type=&condition=&status=&q=&sort=&dir=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterRecords(records(), req.query);
  const { key, dir, rows } = sortRecords(filtered, req.query.sort, req.query.dir);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({ total: rows.length, page, pageSize, pages, sort: key, dir, stats: stats(filtered), records: rows.slice((page - 1) * pageSize, page * pageSize) });
});

router.get('/meta', (req, res) => res.json({
  types: META.MATERIAL_TYPES, conditions: META.CONDITIONS, statuses: META.MATERIAL_STATUSES,
}));

/**
 * Facility → building → floor tree (honours the non-location filters). `count` is the number of ACM there (present or
 * assumed) — materials surveyed as "No ACM" aren't asbestos, so they don't count — unless an ACM-status filter is
 * set, when it counts the records with that status. `records` is every material record (shown as a tooltip).
 */
router.get('/tree', (req, res) => {
  const list = filterRecords(records(), req.query, { location: false });
  const counts = (r) => (req.query.status ? 1 : Number(r.acmStatus === 'ACM Present' || r.acmStatus === 'Assumed ACM'));
  const tree = new Map();
  for (const r of list) {
    const n = counts(r);
    if (!tree.has(r.schoolId)) tree.set(r.schoolId, { id: r.schoolId, name: r.schoolName, count: 0, records: 0, buildings: new Map() });
    const s = tree.get(r.schoolId);
    s.count += n; s.records += 1;
    if (!s.buildings.has(r.buildingId)) s.buildings.set(r.buildingId, { id: r.buildingId, name: r.buildingName, count: 0, records: 0, floors: new Map() });
    const b = s.buildings.get(r.buildingId);
    b.count += n; b.records += 1;
    if (!b.floors.has(r.floorId)) b.floors.set(r.floorId, { id: r.floorId, name: r.floorName, number: r.floorNumber, count: 0, records: 0 });
    const f = b.floors.get(r.floorId);
    f.count += n; f.records += 1;
  }
  // Unfiltered, every building and floor is listed, including ones added in the app with no ACM recorded yet (count 0)
  const { type, condition, status, q } = req.query;
  const allFloors = type || condition || status || q?.trim() ? [] : getAllFloors();
  // …and every school (schools.json), even one with no buildings yet
  for (const s of allFloors.length ? schools : []) {
    if (!tree.has(s.id)) tree.set(s.id, { id: s.id, name: s.name, count: 0, records: 0, buildings: new Map() });
  }
  for (const bd of allFloors.length ? buildings : []) {
    if (!tree.has(bd.schoolId)) tree.set(bd.schoolId, { id: bd.schoolId, name: schoolName.get(bd.schoolId) ?? bd.schoolName, count: 0, records: 0, buildings: new Map() });
    const s = tree.get(bd.schoolId);
    if (!s.buildings.has(bd.id)) s.buildings.set(bd.id, { id: bd.id, name: bd.name, count: 0, records: 0, floors: new Map() });
    const b = s.buildings.get(bd.id);
    for (const f of allFloors) {
      if (f.buildingId === bd.id && !b.floors.has(f.id)) b.floors.set(f.id, { id: f.id, name: f.name, number: f.number, count: 0, records: 0 });
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  res.json([...tree.values()].sort(byName).map((s) => ({
    ...s,
    buildings: [...s.buildings.values()].sort(byName).map((b) => ({
      ...b, floors: [...b.floors.values()].sort((x, y) => x.number - y.number),
    })),
  })));
});

// Summaries: by=type | building | condition | status — each row says how to filter the inventory to it
const GROUPS = {
  type: { key: (r) => r.materialType, label: (r) => r.materialType, filter: (r) => ({ type: r.materialType }) },
  building: {
    key: (r) => r.buildingId,
    label: (r) => r.buildingName,
    sub: (r) => r.schoolName,
    filter: (r) => ({ school: r.schoolId, building: r.buildingId }),
  },
  condition: { key: (r) => r.condition, label: (r) => r.condition, filter: (r) => ({ condition: r.condition }) },
  status: { key: (r) => r.acmStatus, label: (r) => r.acmStatus, filter: (r) => ({ status: r.acmStatus }) },
};

router.get('/groups', (req, res) => {
  const g = GROUPS[req.query.by];
  if (!g) return res.status(400).json({ error: 'by must be one of type, building, condition, status' });
  const groups = new Map();
  for (const r of filterRecords(records(), req.query)) {
    const k = g.key(r);
    if (!groups.has(k)) {
      groups.set(k, {
        key: k, label: g.label(r), sub: g.sub?.(r) ?? null, filter: g.filter(r), total: 0,
        status: { 'ACM Present': 0, 'Assumed ACM': 0, 'No ACM': 0 },
        condition: { Good: 0, Damaged: 0, 'Significantly Damaged': 0, 'Not Assessed': 0 },
        friable: 0, quantities: {}, rooms: new Set(), acmRooms: new Set(), lastAssessed: '',
      });
    }
    const x = groups.get(k);
    x.total += 1;
    x.status[r.acmStatus] = (x.status[r.acmStatus] ?? 0) + 1;
    x.condition[r.condition] = (x.condition[r.condition] ?? 0) + 1;
    if (r.friability === 'Friable' && r.acmStatus !== 'No ACM') x.friable += 1;
    // Quantities only add up within a unit, and only for ACM (present or assumed)
    if (r.acmStatus !== 'No ACM') x.quantities[r.unit] = (x.quantities[r.unit] ?? 0) + r.quantity;
    x.rooms.add(r.roomId);
    if (r.acmStatus === 'ACM Present' || r.acmStatus === 'Assumed ACM') x.acmRooms.add(r.roomId);
    if (r.assessmentDate > x.lastAssessed) x.lastAssessed = r.assessmentDate;
  }
  const rows = [...groups.values()]
    .map(({ rooms, acmRooms, quantities, ...x }) => ({
      ...x,
      rooms: rooms.size,
      acmRooms: acmRooms.size, // rooms with known or assumed ACM
      quantities: Object.entries(quantities).map(([unit, total]) => ({ unit, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  res.json({ by: req.query.by, rows });
});

router.get('/export.csv', (req, res) => {
  const { rows } = sortRecords(filterRecords(records(), req.query), req.query.sort, req.query.dir);
  logAudit(req, { action: 'export', module: 'ACM Inventory', recordId: 'acm-inventory.csv', summary: `Exported ${rows.length} ACM inventory records to CSV` });
  const header = ['ACM ID', 'School', 'Building', 'Floor', 'Room', 'Room Name', 'Material', 'Material Type', 'Location in Room', 'Quantity', 'Unit',
    'Friability', 'Classification', 'ACM Status', 'Condition', 'Risk Ranking', 'Last Assessment', 'Next Due'];
  const lines = rows.map((r) => [r.id, r.schoolName, r.buildingName, r.floorName, r.roomNumber, r.roomName, r.name, r.materialType, r.location,
    r.quantity, r.unit, r.friability, r.classification, r.acmStatus, r.condition, r.riskRanking, r.assessmentDate, r.nextDue]);
  res.type('text/csv').attachment('acm-inventory.csv').send([header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n'));
});

export default router;
