import { Router } from 'express';
import schoolsRoutes from './schools.js';
import buildingsRoutes from './buildings.js';

const router = Router();

router.use('/schools', schoolsRoutes);
router.use('/buildings', buildingsRoutes);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
