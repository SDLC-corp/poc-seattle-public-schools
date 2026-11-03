import { Router } from 'express';
import { getLabData, RESULT_CLASSES } from '../data/labSamplesStore.js';

const router = Router();

const count = (list, cls) => list.filter((s) => s.resultClass === cls).length;

// GET /api/lab-samples?q=&result=&site=&sort=asc|desc&page=&pageSize=
// Stats ignore the result filter so the tiles always show the full breakdown for the site/search.
router.get('/', (req, res) => {
  const { q, result, site, sort } = req.query;
  const { samples, sourceFile, worksheet } = getLabData();
  const term = q?.trim().toLowerCase();
  const scoped = samples.filter((s) => (!site || s.site === site)
    && (!term || [s.sampleNo, s.description, s.site, s.room, s.result, s.homogeneousArea]
      .some((v) => v?.toLowerCase().includes(term))));
  let filtered = result ? scoped.filter((s) => s.resultClass === result) : scoped;
  if (sort === 'asc' || sort === 'desc') {
    const dir = sort === 'asc' ? 1 : -1;
    filtered = [...filtered].sort((a, b) => dir * a.sampleNo.localeCompare(b.sampleNo, 'en', { numeric: true }));
  }

  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    source: { file: sourceFile, worksheet, records: samples.length },
    stats: {
      total: scoped.length,
      detected: count(scoped, 'detected'),
      none: count(scoped, 'none'),
      assumed: count(scoped, 'assumed'),
      inconclusive: count(scoped, 'inconclusive'),
    },
    samples: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Filter options: sites with their sample counts, and the result classes
router.get('/facets', (req, res) => {
  const sites = new Map();
  for (const s of getLabData().samples) sites.set(s.site, (sites.get(s.site) ?? 0) + 1);
  res.json({
    sites: [...sites].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name)),
    results: Object.entries(RESULT_CLASSES).map(([value, label]) => ({ value, label })),
  });
});

router.get('/:id', (req, res) => {
  const { samples } = getLabData();
  const sample = samples[Number(req.params.id) - 1];
  if (!sample) return res.status(404).json({ error: 'Sample not found' });
  // The same sample number can appear on more than one row of the spreadsheet
  const sameNumber = samples.filter((s) => s.sampleNo === sample.sampleNo && s.id !== sample.id)
    .map(({ id, site, description, resultLabel, resultClass }) => ({ id, site, description, resultLabel, resultClass }));
  const siteSamples = samples.filter((s) => s.site === sample.site);
  res.json({
    ...sample,
    sameNumber,
    siteSummary: { total: siteSamples.length, detected: count(siteSamples, 'detected') },
  });
});

export default router;
