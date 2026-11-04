import { Router } from 'express';
import { schools, getSchoolBuildings, addSchool } from '../data/store.js';
import { schoolCompliance } from '../data/complianceStore.js';
import { logAudit } from '../data/auditStore.js';

const router = Router();

const TYPES = ['Elementary', 'Middle', 'High', 'K-8', 'Other'];
const CATEGORIES = ['Attendance Area School', 'Option School', 'Service School', 'Alternative Learning Experience School'];
// New schools must be placed in or near Seattle to show on the map
const BOUNDS = { lat: [47.4, 47.8], lng: [-122.5, -122.2] };

router.get('/meta', (req, res) => res.json({ types: TYPES, categories: CATEGORIES, bounds: BOUNDS }));

// POST /api/schools  { name, type, category, street, city, state, zip, phone, website, principal, principalEmail, boardDistrict, lat, lng }
router.post('/', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    const s = (k, max) => (typeof b[k] === 'string' ? b[k].trim().slice(0, max) : '');
    const fields = {};
    const name = s('name', 100);
    if (!name) fields.name = 'Enter the school name';
    else if (schools.some((x) => x.name.toLowerCase() === name.toLowerCase())) fields.name = 'A school with this name already exists';
    if (!TYPES.includes(b.type)) fields.type = 'Choose a school type';
    const category = s('category', 80);
    if (category && !CATEGORIES.includes(category)) fields.category = 'Choose a category from the list';
    const address = { street: s('street', 120), city: s('city', 60) || 'Seattle', state: s('state', 2).toUpperCase() || 'WA', zip: s('zip', 10) };
    if (!address.street) fields.street = 'Enter the street address';
    if (!/^[A-Z]{2}$/.test(address.state)) fields.state = 'Use a 2-letter state code';
    if (!/^\d{5}(-\d{4})?$/.test(address.zip)) fields.zip = 'Enter a 5-digit ZIP code';
    const phone = s('phone', 30);
    if (phone && !/^[\d\s()+.-]{7,}$/.test(phone)) fields.phone = 'Enter a valid phone number';
    const website = s('website', 200);
    if (website && !/^https?:\/\/\S+\.\S+$/.test(website)) fields.website = 'Enter a full web address (https://…)';
    const principalEmail = s('principalEmail', 120);
    if (principalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(principalEmail)) fields.principalEmail = 'Enter a valid email address';
    const boardDistrict = b.boardDistrict === '' || b.boardDistrict == null ? null : Number(b.boardDistrict);
    if (boardDistrict !== null && !(Number.isInteger(boardDistrict) && boardDistrict >= 1 && boardDistrict <= 7)) fields.boardDistrict = 'Choose a board district (1–7)';
    let location = null;
    const hasLat = b.lat !== '' && b.lat != null;
    const hasLng = b.lng !== '' && b.lng != null;
    if (hasLat || hasLng) {
      const lat = Number(b.lat);
      const lng = Number(b.lng);
      if (!hasLat || !hasLng || !Number.isFinite(lat) || !Number.isFinite(lng)) fields.lat = 'Enter both latitude and longitude, or leave both empty';
      else if (lat < BOUNDS.lat[0] || lat > BOUNDS.lat[1] || lng < BOUNDS.lng[0] || lng > BOUNDS.lng[1]) fields.lat = 'The location must be in the Seattle area';
      else location = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
    }
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields', fields });

    const school = await addSchool({ name, type: b.type, category, address, phone, website, principal: s('principal', 80), principalEmail, boardDistrict, location });
    logAudit(req, {
      action: 'create', module: 'Schools & Facilities', recordId: school.id, link: `/schools/${school.id}`,
      summary: `Added school ${school.name}`,
      changes: [
        { field: 'Name', to: school.name }, { field: 'Type', to: school.type }, { field: 'Address', to: school.address.full },
        ...(category ? [{ field: 'Category', to: category }] : []), ...(location ? [{ field: 'Map location', to: `${location.lat}, ${location.lng}` }] : []),
      ],
      related: { school: school.name },
    });
    res.status(201).json(withBuildingCount(school));
  } catch (err) {
    next(err);
  }
});

// complianceStatus is derived from the inspection schedule: compliant | dueSoon | overdue
const withBuildingCount = (s) => ({
  ...s,
  buildingCount: getSchoolBuildings(s.id).length,
  complianceStatus: schoolCompliance(s.id).status,
});

// GET /api/schools?type=High&category=Option%20School&boardDistrict=2&q=ballard
router.get('/', (req, res) => {
  const { type, category, boardDistrict, q } = req.query;
  let result = schools;

  if (type) result = result.filter((s) => s.type === type);
  if (category) result = result.filter((s) => s.category === category);
  if (boardDistrict) result = result.filter((s) => s.boardDistrict === Number(boardDistrict));
  if (q) {
    const term = q.toLowerCase();
    result = result.filter((s) =>
      s.name.toLowerCase().includes(term) || s.address.full.toLowerCase().includes(term));
  }

  res.json({ count: result.length, schools: result.map(withBuildingCount) });
});

router.get('/:id', (req, res) => {
  const school = schools.find((s) => s.id === req.params.id);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json({ ...school, buildings: getSchoolBuildings(school.id) });
});

router.get('/:id/buildings', (req, res) => {
  if (!schools.some((s) => s.id === req.params.id)) {
    return res.status(404).json({ error: 'School not found' });
  }
  const result = getSchoolBuildings(req.params.id);
  res.json({ count: result.length, buildings: result });
});

export default router;
