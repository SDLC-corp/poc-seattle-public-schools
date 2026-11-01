import { Router } from 'express';
import { schools, getSchoolBuildings } from '../data/store.js';
import { schoolCompliance } from '../data/complianceStore.js';

const router = Router();

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
