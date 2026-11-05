import { naturalCompare } from '../data/naturalSort.js';
import { Router } from 'express';
import { getLabData, RESULT_CLASSES } from '../data/labSamplesStore.js';
import { inspectionSamples } from '../data/inspectionSamples.js';

const router = Router();

const count = (list, cls) => list.filter((s) => s.resultClass === cls).length;

// Samples sent to the lab from inspections (live) first, then the imported spreadsheet (read-only)
const allSamples = () => {
  const { samples, sourceFile, worksheet } = getLabData();
  return { samples: [...inspectionSamples(), ...samples.map((s) => ({ ...s, source: 'spreadsheet' }))], sourceFile, worksheet, imported: samples.length };
};

// GET /api/lab-samples?q=&result=&site=&building=&room=&source=inspection|spreadsheet&sort=asc|desc&page=&pageSize=
// site is the school. Stats ignore the result filter so the tiles always show the full breakdown for the search.
router.get('/', (req, res) => {
  const { q, result, site, building, room, source, sort } = req.query;
  const { samples, sourceFile, worksheet, imported } = allSamples();
  const term = q?.trim().toLowerCase();
  const scoped = samples.filter((s) => (!site || s.site === site) && (!building || s.building === building)
    && (!room || s.room === room) && (!source || s.source === source)
    && (!term || [s.sampleNo, s.description, s.site, s.room, s.result, s.homogeneousArea, s.inspectionId, s.laboratory]
      .some((v) => v?.toLowerCase().includes(term))));
  let filtered = result ? scoped.filter((s) => s.resultClass === result) : scoped;
  if (sort === 'asc' || sort === 'desc') {
    const dir = sort === 'asc' ? 1 : -1;
    filtered = [...filtered].sort((a, b) => dir * naturalCompare(a.sampleNo, b.sampleNo));
  }

  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    source: { file: sourceFile, worksheet, records: imported, fromInspections: samples.length - imported },
    stats: {
      total: scoped.length,
      detected: count(scoped, 'detected'),
      none: count(scoped, 'none'),
      assumed: count(scoped, 'assumed'),
      inconclusive: count(scoped, 'inconclusive'),
      pending: count(scoped, 'pending'),
      fromInspections: scoped.filter((s) => s.source === 'inspection').length,
    },
    samples: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Filter options: schools (sites) with their sample counts, the result classes and the sources. With ?site= (and
// &building=) also that school's buildings and rooms — imported samples have no building, only a room
const tally = (values) => {
  const m = new Map();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([name, n]) => ({ name, count: n })).sort((a, b) => naturalCompare(a.name, b.name));
};

router.get('/facets', (req, res) => {
  const { site, building } = req.query;
  const { samples } = allSamples();
  const atSite = site ? samples.filter((s) => s.site === site) : [];
  res.json({
    sites: tally(samples.map((s) => s.site)),
    buildings: tally(atSite.map((s) => s.building)),
    rooms: tally(atSite.filter((s) => !building || s.building === building).map((s) => s.room)),
    results: Object.entries(RESULT_CLASSES).map(([value, label]) => ({ value, label })),
    sources: [
      { value: 'inspection', label: 'From inspections', count: samples.filter((s) => s.source === 'inspection').length },
      { value: 'spreadsheet', label: 'Imported lab data', count: samples.filter((s) => s.source === 'spreadsheet').length },
    ],
  });
});

router.get('/:id', (req, res) => {
  const { samples, sourceFile, worksheet } = allSamples();
  const sample = samples.find((s) => s.id === req.params.id);
  if (!sample) return res.status(404).json({ error: 'Sample not found' });
  // The same sample number can appear on more than one row of the spreadsheet
  const sameNumber = samples.filter((s) => s.sampleNo === sample.sampleNo && s.id !== sample.id)
    .map(({ id, site, description, resultLabel, resultClass }) => ({ id, site, description, resultLabel, resultClass }));
  const siteSamples = samples.filter((s) => s.site === sample.site);
  res.json({
    ...sample,
    sameNumber,
    siteSummary: { total: siteSamples.length, detected: count(siteSamples, 'detected') },
    // Where an imported sample came from (the details page shows it)
    ...(sample.source === 'spreadsheet' ? { sourceFile, worksheet } : {}),
  });
});

export default router;
