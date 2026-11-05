import { Router } from 'express';
import { schools, buildings, getSchoolBuildings, addBuilding, updateBuilding } from '../data/store.js';
import { MAX_FLOORS, ACM_STATUSES, PRESUMED_ACM_BEFORE } from '../data/buildingGeometry.js';
import { logAudit, diff } from '../data/auditStore.js';
import { seedFloors, getFloors } from '../data/floorsStore.js';
import { getMaterials, allRooms } from '../data/roomsStore.js';
import { getRecords as getInspectionRecords } from '../data/inspectionRecordsStore.js';
import { getRecords as getSurveillanceRecords } from '../data/surveillanceStore.js';
import { syncFloorRooms } from '../data/floorRoomsSync.js';

// Looked up live so schools added in the app are found
const schoolById = { get: (id) => schools.find((s) => s.id === id), has: (id) => schools.some((s) => s.id === id) };
const CONSTRUCTION = ['Concrete', 'Masonry', 'Steel Frame', 'Wood Frame', 'Modular'];
const BOUNDS = { lat: [47.4, 47.8], lng: [-122.5, -122.2] }; // Seattle area, same as schools
const THIS_YEAR = new Date().getFullYear();

const int = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function validateBuilding(body, existing, schoolId) {
  const errors = {};
  const pickInt = (key) => int(body[key] ?? existing?.[key]);
  const b = {
    name: String(body.name ?? existing?.name ?? '').trim().slice(0, 80),
    code: String(body.code ?? existing?.code ?? '').trim().toUpperCase().slice(0, 30),
    yearBuilt: pickInt('yearBuilt'),
    floors: pickInt('floors'),
    areaSqFt: pickInt('areaSqFt'),
    construction: body.construction ?? existing?.construction ?? 'Masonry',
    rooms: pickInt('rooms'),
    roomsWithAcm: pickInt('roomsWithAcm'),
    acmStatus: body.acmStatus ?? existing?.acmStatus,
  };
  // Map position (optional): both latitude and longitude, in the Seattle area like schools. Without one a new
  // building is placed beside the school's other buildings.
  const hasLat = body.lat !== '' && body.lat != null;
  const hasLng = body.lng !== '' && body.lng != null;
  if (hasLat || hasLng) {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!hasLat || !hasLng || !Number.isFinite(lat) || !Number.isFinite(lng)) errors.lat = 'Enter both latitude and longitude, or leave both empty';
    else if (lat < BOUNDS.lat[0] || lat > BOUNDS.lat[1] || lng < BOUNDS.lng[0] || lng > BOUNDS.lng[1]) errors.lat = 'The location must be in the Seattle area';
    else b.location = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
  }
  if (!b.name) errors.name = 'Building name is required';
  if (!b.code) errors.code = 'Building code is required';
  else if (buildings.some((x) => x.code === b.code && x.id !== existing?.id)) errors.code = 'That code is already used';
  else if (getSchoolBuildings(schoolId).some((x) => x.name.toLowerCase() === b.name.toLowerCase() && x.id !== existing?.id)) {
    errors.name = 'This school already has a building with that name';
  }
  if (!Number.isInteger(b.yearBuilt) || b.yearBuilt < 1850 || b.yearBuilt > THIS_YEAR) errors.yearBuilt = `Enter a year between 1850 and ${THIS_YEAR}`;
  // Initial floors for a new building; afterwards floors are added one by one (no upper limit) in the Floors tab
  if (!existing && (!Number.isInteger(b.floors) || b.floors < 1 || b.floors > MAX_FLOORS)) errors.floors = `Floors must be 1 to ${MAX_FLOORS}`;
  if (!Number.isInteger(b.areaSqFt) || b.areaSqFt < 200 || b.areaSqFt > 500000) errors.areaSqFt = 'Enter an area between 200 and 500,000 sq ft';
  if (!CONSTRUCTION.includes(b.construction)) errors.construction = 'Choose a construction type';
  // Rooms / ACM are entered once for a new building; after that they're totals of its floors (not validated here)
  if (!existing) {
    if (!Number.isInteger(b.rooms) || b.rooms < 1 || b.rooms > 1000) errors.rooms = 'Rooms must be 1 to 1,000';
    if (!ACM_STATUSES.includes(b.acmStatus)) errors.acmStatus = 'Choose an ACM status';
    if (b.acmStatus === 'No ACM') b.roomsWithAcm = 0;
    else if (!Number.isInteger(b.roomsWithAcm) || b.roomsWithAcm < 1) errors.roomsWithAcm = 'Enter at least 1 room with ACM';
    else if (b.roomsWithAcm > b.rooms) errors.roomsWithAcm = 'Can’t exceed the number of rooms';
  }
  return { b, errors };
}

const view = (x) => ({
  Name: x.name, Code: x.code, 'Year Built': x.yearBuilt, Floors: x.floors, 'Area (sq ft)': x.areaSqFt,
  Construction: x.construction, Rooms: x.rooms, 'Rooms with ACM': x.roomsWithAcm, 'ACM Status': x.acmStatus,
  'Map location': x.location ? `${x.location.lat}, ${x.location.lng}` : '—',
});

const router = Router();

// GET /api/buildings?schoolId=ballardhs&presumedAcm=true&acmStatus=No%20ACM&q=gym
router.get('/', (req, res) => {
  const { schoolId, presumedAcm, acmStatus, q } = req.query;
  let result = buildings;

  if (schoolId) result = result.filter((b) => b.schoolId === schoolId);
  if (presumedAcm) result = result.filter((b) => b.presumedAcm === (presumedAcm === 'true'));
  if (acmStatus) result = result.filter((b) => b.acmStatus === acmStatus);
  if (q) {
    const term = q.toLowerCase();
    result = result.filter((b) =>
      b.name.toLowerCase().includes(term) || b.schoolName.toLowerCase().includes(term) || b.code.toLowerCase().includes(term));
  }

  res.json({ count: result.length, buildings: result });
});

router.get('/meta', (req, res) => res.json({ maxFloors: MAX_FLOORS, acmStatuses: ACM_STATUSES, construction: CONSTRUCTION, presumedAcmBefore: PRESUMED_ACM_BEFORE }));

router.get('/:id', (req, res) => {
  const building = buildings.find((b) => b.id === req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });
  res.json(building);
});

// Summary for the map's building popup / side panel: counts, ACM condition, inspections, surveillance
router.get('/:id/overview', (req, res) => {
  const b = buildings.find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Building not found' });
  const school = schoolById.get(b.schoolId);
  const today = new Date().toISOString().slice(0, 10);
  const addYears = (iso, n) => (iso ? `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}` : null);
  const maxIso = (list) => list.filter(Boolean).sort().at(-1) ?? null;

  const floors = getFloors(b.id);
  const rooms = allRooms().filter((r) => r.buildingId === b.id);
  const acm = getMaterials({ buildingId: b.id }).filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM');
  const condition = (c) => acm.filter((m) => (m.condition || 'Not Assessed') === c).length;

  const insp = getInspectionRecords().filter((r) => r.buildingId === b.id);
  const inspDone = insp.filter((r) => ['approved', 'submitted'].includes(r.state));
  const lastInspection = maxIso([...inspDone.map((r) => r.date), ...acm.map((m) => m.assessmentDate)]);

  const surv = getSurveillanceRecords().filter((r) => r.buildingId === b.id && r.state !== 'draft');
  const lastSurv = new Map();
  for (const r of surv) if (!lastSurv.has(r.materialId) || r.date > lastSurv.get(r.materialId).date) lastSurv.set(r.materialId, r);
  const survDue = acm.filter((m) => { const l = lastSurv.get(m.id); return !l || l.nextDue <= today; }).length;
  const followUps = surv.flatMap((r) => r.actionItems ?? []).filter((a) => a.status !== 'Closed').length;

  res.json({
    id: b.id, name: b.name, code: b.code, status: 'Active',
    school: { id: b.schoolId, name: b.schoolName ?? school?.name, facilityId: `SCH-${String(schools.indexOf(school) + 1).padStart(3, '0')}`, type: school?.type ?? null },
    counts: { floors: floors.length || b.floors, rooms: rooms.length || b.rooms, acmRecords: acm.length, acmRooms: new Set(acm.map((m) => m.roomId)).size },
    info: {
      yearBuilt: b.yearBuilt, usage: school?.type ? `Educational (${school.type})` : 'Educational', address: school?.address?.full ?? null,
      areaSqFt: b.areaSqFt, construction: b.construction ?? null, presumedAcm: b.presumedAcm,
    },
    condition: { good: condition('Good'), damaged: condition('Damaged'), significantlyDamaged: condition('Significantly Damaged'), notAssessed: condition('Not Assessed') },
    inspections: {
      last: lastInspection, nextDue: addYears(lastInspection, 3),
      completed: inspDone.length, pending: insp.filter((r) => ['scheduled', 'draft', 'returned'].includes(r.state)).length,
    },
    surveillance: { last: maxIso(surv.map((r) => r.date)), completed: surv.length, pending: survDue, followUps },
  });
});

// POST /api/buildings  { schoolId, name, code, yearBuilt, floors (1–3), areaSqFt, construction, rooms, roomsWithAcm, acmStatus }
router.post('/', async (req, res, next) => {
  try {
    const school = schoolById.get(req.body?.schoolId);
    if (!school) return res.status(400).json({ error: 'Invalid building', fields: { schoolId: 'Choose a school' } });
    const { b, errors } = validateBuilding(req.body ?? {}, null, school.id);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid building', fields: errors });
    const added = await addBuilding(school, b);
    for (const floor of await seedFloors(added)) await syncFloorRooms(floor); // sample-layout rooms per floor
    const created = buildings.find((x) => x.id === added.id); // totals re-synced from its floors
    logAudit(req, {
      action: 'create', module: 'Schools & Facilities', recordId: created.id, link: `/schools/${school.id}/buildings`,
      summary: `Added building ${created.name} – ${school.name}`,
      changes: diff({}, view(created)).map(({ field, to }) => ({ field, to })),
      related: { school: school.name, building: created.name },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = buildings.find((b) => b.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Building not found' });
    // Floors, rooms and ACM are managed per floor (Floors tab), so they're not editable here
    const { floors, rooms, roomsWithAcm, acmStatus, ...editable } = req.body ?? {}; // eslint-disable-line no-unused-vars
    const { b, errors } = validateBuilding(editable, existing, existing.schoolId);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid building', fields: errors });
    const before = view(existing);
    const updated = await updateBuilding(existing.id, b);
    const changes = diff(before, view(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Schools & Facilities', recordId: updated.id, link: `/schools/${updated.schoolId}/buildings`,
        summary: `Updated building ${updated.name} – ${updated.schoolName}`,
        changes,
        related: { school: updated.schoolName, building: updated.name },
      });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
