import { Router } from 'express';

const router = Router();

// GET /api/test — plain-text check that the backend is up and reachable
router.get('/', (req, res) => {
  res.type('text/plain').send('Backend is working');
});

export default router;
