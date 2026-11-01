import { Router } from 'express';
import { buildings } from '../data/store.js';

const router = Router();

// GET /api/buildings?schoolId=ballardhs&presumedAcm=true&q=gym
router.get('/', (req, res) => {
  const { schoolId, presumedAcm, q } = req.query;
  let result = buildings;

  if (schoolId) result = result.filter((b) => b.schoolId === schoolId);
  if (presumedAcm) result = result.filter((b) => b.presumedAcm === (presumedAcm === 'true'));
  if (q) {
    const term = q.toLowerCase();
    result = result.filter((b) =>
      b.name.toLowerCase().includes(term) || b.schoolName.toLowerCase().includes(term) || b.code.toLowerCase().includes(term));
  }

  res.json({ count: result.length, buildings: result });
});

router.get('/:id', (req, res) => {
  const building = buildings.find((b) => b.id === req.params.id);
  if (!building) return res.status(404).json({ error: 'Building not found' });
  res.json(building);
});

export default router;
