import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';

const app = express();
const PORT = process.env.PORT || 5000;

// CLIENT_URL: the frontend's URL(s), comma-separated. Only the origin counts (a path like /login is ignored),
// and the local Vite dev server is always allowed.
const toOrigin = (u) => { try { return new URL(u.trim()).origin; } catch { return null; } };
const allowedOrigins = new Set(['http://localhost:5173', ...(process.env.CLIENT_URL ?? '').split(',').map(toOrigin).filter(Boolean)]);
app.use(cors({ origin: (origin, done) => done(null, !origin || allowedOrigins.has(origin)) }));
app.use(express.json({ limit: '3mb' })); // settings can carry an uploaded logo (≤2 MB)

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
