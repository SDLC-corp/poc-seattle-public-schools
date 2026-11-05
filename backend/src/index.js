import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { gzipSync } from 'node:zlib';
import apiRoutes from './routes/index.js';
import { authenticate } from './auth.js';

const app = express();
const PORT = process.env.PORT || 5000;

// CLIENT_URL: the frontend's URL(s), comma-separated. Only the origin counts (a path like /login is ignored),
// and the local Vite dev server is always allowed.
const toOrigin = (u) => { try { return new URL(u.trim()).origin; } catch { return null; } };
const allowedOrigins = new Set(['http://localhost:5173', ...(process.env.CLIENT_URL ?? '').split(',').map(toOrigin).filter(Boolean)]);
app.use(cors({ origin: (origin, done) => done(null, !origin || allowedOrigins.has(origin)) }));
app.use(express.json({ limit: '3mb' })); // settings can carry an uploaded logo (≤2 MB)

// gzip JSON responses (the room / material lists are megabytes as plain JSON, a tenth of that compressed).
// Small replies go out as they are; files (PDFs, images) are untouched.
const GZIP_FROM = 2048;
app.use((req, res, next) => {
  if (!/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) return next();
  const plain = res.json.bind(res);
  res.json = (body) => {
    const text = JSON.stringify(body);
    if (text === undefined || Buffer.byteLength(text) < GZIP_FROM) return plain(body);
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return res.send(gzipSync(text, { level: 5 }));
  };
  next();
});

// Credits each request to the signed-in Microsoft user (verified token), else the demo user
app.use('/api', authenticate, apiRoutes);

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
