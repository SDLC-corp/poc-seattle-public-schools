import { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getMaterials, allRooms } from '../data/roomsStore.js';
import { dashboard, overview, acmTimeline, getRules, saveRules, CONDITIONS, TRENDS } from '../data/trends.js';
import { logAudit } from '../data/auditStore.js';

const router = Router();
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const FILTER_KEYS = ['school', 'building', 'floor', 'room', 'acm', 'materialType', 'classification', 'friability', 'condition', 'inspectionType', 'from', 'to'];
const filtersOf = (q) => Object.fromEntries(FILTER_KEYS.map((k) => [k, (k === 'from' || k === 'to') && !ISO_DAY.test(q[k] ?? '') ? '' : String(q[k] ?? '')]));
const TREND_ORDER = { significant: 0, deteriorating: 1, improved: 2, stable: 3, baseline: 4 };

// Filter options; the building / floor / room / ACM lists follow the chosen school, building, floor and room
router.get('/meta', (req, res) => {
  const { school, building, floor, room } = req.query;
  const mats = getMaterials().filter((m) => ['ACM Present', 'Assumed ACM'].includes(m.acmStatus));
  const uniq = (key) => [...new Set(mats.map((m) => m[key]).filter(Boolean))].sort();
  const floors = getAllFloors();
  res.json({
    schools: schools.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)),
    buildings: school ? buildings.filter((b) => b.schoolId === school).map((b) => ({ id: b.id, name: b.name })) : [],
    floors: building ? floors.filter((f) => f.buildingId === building).map((f) => ({ id: f.id, name: f.name })) : [],
    rooms: floor ? allRooms().filter((r) => r.floorId === floor).map((r) => ({ id: r.id, name: `${r.number} ${r.name}`.trim() })) : [],
    acms: room ? mats.filter((m) => m.roomId === room).map((m) => ({ id: m.id, name: `${m.id.replace(/^ACM-[^-]+-/, 'ACM-').toUpperCase()} – ${m.name}` })) : [],
    materialTypes: uniq('materialType'), classifications: uniq('classification'), friability: uniq('friability'),
    conditions: CONDITIONS, inspectionTypes: ['Baseline Assessment', '6-Month Surveillance', 'Initial Inspection', '3-Year Reinspection', 'Damage Assessment', 'Follow-up Inspection'],
    trends: TRENDS,
  });
});

// GET /api/trends?<filters>&trend=&q=&page=&pageSize= — KPIs, charts, alerts and the (paged) ACM table
router.get('/', (req, res) => {
  const q = filtersOf(req.query);
  const d = dashboard(q);
  const term = String(req.query.q ?? '').trim().toLowerCase();
  // The table defaults to deteriorating ACMs; trend=all shows every analysed ACM
  const trend = req.query.trend ?? 'worse';
  const list = d.rows
    .filter((r) => (trend === 'all' ? true : trend === 'worse' ? r.trend === 'deteriorating' || r.trend === 'significant' : r.trend === trend))
    .filter((r) => !term || [r.acmId, r.material, r.school, r.building, r.room].some((v) => String(v).toLowerCase().includes(term)))
    .sort((a, b) => TREND_ORDER[a.trend] - TREND_ORDER[b.trend] || b.lastDate.localeCompare(a.lastDate));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  const { rows, ...rest } = d;
  res.json({ ...rest, table: { total: list.length, page, pageSize, pages, rows: list.slice((page - 1) * pageSize, page * pageSize) } });
});

// GET /api/trends/overview?school=&materialType=&months=12 — condition counts now and per month, by material and school,
// and the ACMs that got worse in the period
router.get('/overview', (req, res) => {
  res.json(overview({ school: String(req.query.school ?? ''), materialType: String(req.query.materialType ?? ''), months: req.query.months }));
});

router.get('/export.csv', (req, res) => {
  const q = filtersOf(req.query);
  const { rows } = dashboard(q);
  const header = ['ACM ID', 'School', 'Building', 'Floor', 'Room', 'Material', 'Material Type', 'Classification', 'Friability',
    'Previous Condition', 'Previous Assessment', 'Current Condition', 'Last Assessment', 'Last Assessment Type', 'Assessments', 'Trend', 'Follow-up'];
  const lines = rows.sort((a, b) => TREND_ORDER[a.trend] - TREND_ORDER[b.trend]).map((r) => [r.acmId, r.school, r.building, r.floor, r.room, r.material, r.materialType,
    r.classification, r.friability, r.previous ?? '', r.previousDate ?? '', r.current, r.lastDate, r.lastType, r.assessments, TRENDS[r.trend], r.followUp.label]);
  logAudit(req, { action: 'export', module: 'Trend Analysis', recordId: 'acm-trends.csv', summary: `Exported ${rows.length} ACM condition trends to CSV` });
  res.type('text/csv').attachment('acm-condition-trends.csv').send(`﻿${[header, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n')}`);
});

router.get('/acm/:id', (req, res) => {
  const t = acmTimeline(req.params.id);
  if (!t) return res.status(404).json({ error: 'ACM not found' });
  res.json(t);
});

router.get('/alerts', (req, res) => res.json({ rules: getRules() }));

// PUT /api/trends/alerts { rules: [{ id, enabled, days?, threshold? }] } — switch rules on/off and tune them
router.put('/alerts', async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.rules) ? req.body.rules : [];
    const errors = {};
    const next_ = getRules().map((r) => {
      const x = incoming.find((y) => y.id === r.id);
      if (!x) return r;
      const out = { ...r, enabled: Boolean(x.enabled) };
      if (r.kind === 'recentDeterioration') {
        const v = Number(x.days);
        if (!Number.isInteger(v) || v < 7 || v > 730) errors[`${r.id}.days`] = 'Enter 7–730 days';
        else out.days = v;
      }
      if (r.kind === 'schoolCount') {
        const v = Number(x.threshold);
        if (!Number.isInteger(v) || v < 1 || v > 100) errors[`${r.id}.threshold`] = 'Enter 1–100';
        else out.threshold = v;
      }
      return out;
    });
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const saved = await saveRules(next_);
    logAudit(req, { action: 'update', module: 'Trend Analysis', recordId: 'alert-rules', summary: 'Updated deterioration alert rules',
      changes: saved.map((r) => ({ field: r.name, to: r.enabled ? `On${r.days ? ` · ${r.days} days` : ''}${r.threshold ? ` · ${r.threshold}+` : ''}` : 'Off' })) });
    res.json({ rules: saved });
  } catch (err) {
    next(err);
  }
});

export default router;
