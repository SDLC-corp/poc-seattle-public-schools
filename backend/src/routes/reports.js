import { naturalCompare } from '../data/naturalSort.js';
import { Router } from 'express';
import { REPORTS, filterRows } from '../data/reports.js';
import { logAudit } from '../data/auditStore.js';
import { listUsers } from './users.js';

const router = Router();

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const describe = (id, r) => ({
  id,
  title: r.title,
  description: r.description,
  filters: r.filters,
  filterLabels: r.filterLabels ?? {},
  statusLabel: r.statusLabel,
  statuses: Object.entries(r.statuses).map(([value, s]) => ({ value, ...s })),
  columns: r.columns.filter((c) => !c.csvOnly),
});

// `status` may be a comma-separated list (e.g. the "Scheduled" tile covers scheduled + dueSoon)
function query(report, q) {
  const scoped = filterRows(report.rows(), q, report);
  const statuses = q.status ? new Set(String(q.status).split(',')) : null;
  const rows = statuses ? scoped.filter((r) => statuses.has(r.status)) : scoped;
  const key = report.columns.some((c) => c.key === q.sort) ? q.sort : (report.columns.some((c) => c.key === 'date') ? 'date' : null);
  const dir = (q.dir ?? (key === 'date' ? 'desc' : 'asc')) === 'asc' ? 1 : -1;
  if (key) {
    rows.sort((a, b) => {
      const x = a[key] ?? '';
      const y = b[key] ?? '';
      // Blank values always sort last
      if (x === '' || y === '') return (x === '') - (y === '');
      return dir * (typeof x === 'number' && typeof y === 'number' ? x - y : naturalCompare(String(x), String(y)));
    });
  }
  return { scoped, rows, sort: key, dir: dir === 1 ? 'asc' : 'desc' };
}

const getReport = (req, res) => {
  const report = REPORTS[req.params.id];
  if (!report) res.status(404).json({ error: 'Report not found' });
  return report;
};

router.get('/', (req, res) => {
  res.json(Object.entries(REPORTS).map(([id, r]) => describe(id, r)));
});

// Headline numbers for every report (Overview tab)
router.get('/overview', (req, res) => {
  res.json(Object.entries(REPORTS).map(([id, r]) => ({ id, title: r.title, description: r.description, stats: r.stats(r.rows()) })));
});

// GET /api/reports/:id?school=&building=&floor=&inspector=&status=&from=&to=&q=&sort=&dir=&page=&pageSize=
router.get('/:id', (req, res) => {
  const report = getReport(req, res);
  if (!report) return;
  const { scoped, rows, sort, dir } = query(report, req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    ...describe(req.params.id, report),
    total: rows.length,
    page,
    pageSize,
    pages,
    sort,
    dir,
    stats: report.stats(scoped),
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Filter options, narrowed by the parent selection (school → buildings → floors)
router.get('/:id/facets', (req, res) => {
  const report = getReport(req, res);
  if (!report) return;
  const { school, building } = req.query;
  const all = report.rows();
  const uniq = (list, key, label = key) => [...new Map(list.filter((r) => r[key]).map((r) => [r[key], { value: r[key], label: r[label] }])).values()]
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  const inSchool = school ? all.filter((r) => r.schoolId === school) : all;
  const inBuilding = building ? inSchool.filter((r) => r.buildingId === building) : inSchool;
  res.json({
    schools: uniq(all, 'schoolId', 'school'),
    buildings: school ? uniq(inSchool, 'buildingId', 'building') : [],
    floors: building ? uniq(inBuilding, 'floor') : [],
    // Users flagged listFirst (the lead inspector) head the list
    inspectors: (() => { const top = new Set(listUsers().filter((u) => u.listFirst).map((u) => u.name)); return uniq(inSchool, 'inspector').sort((a, b) => top.has(b.value) - top.has(a.value)); })(),
  });
});

router.get('/:id/export.csv', (req, res) => {
  const report = getReport(req, res);
  if (!report) return;
  const { rows } = query(report, req.query);
  const statusLabel = (v) => report.statuses[v]?.label ?? v;
  const name = `${req.params.id}-report.csv`;
  logAudit(req, { action: 'export', module: report.module, recordId: name, summary: `Exported ${rows.length} rows of the ${report.title} report to CSV` });
  const header = report.columns.map((c) => c.label);
  const lines = rows.map((r) => report.columns.map((c) => (c.type === 'status' ? statusLabel(r[c.key]) : r[c.key])));
  res.type('text/csv').attachment(name).send([header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n'));
});

export default router;
