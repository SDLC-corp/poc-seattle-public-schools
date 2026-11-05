import { Router } from 'express';
import {
  getInspections, getInspection, schoolRows, schoolCompliance, completeInspection, rescheduleInspection, bookInspection,
} from '../data/complianceStore.js';
import { logAudit, currentUser } from '../data/auditStore.js';
import { listUsers, listOrder } from './users.js';
import { notify } from '../data/notificationsStore.js';

const STATUS_LABEL = { compliant: 'Compliant', dueSoon: 'Due Soon', overdue: 'Non-Compliant' };

function filterSchools({ q, status, type }) {
  const term = q?.trim().toLowerCase();
  return schoolRows().filter((s) =>
    (!status || s.status === status)
    && (!type || s.type === type)
    && (!term || [s.name, s.id].some((v) => v.toLowerCase().includes(term))));
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const router = Router();

router.get('/summary', (req, res) => {
  const rows = schoolRows();
  const count = (st) => rows.filter((s) => s.status === st).length;
  const byType = {};
  for (const s of rows) {
    byType[s.type] ??= { compliant: 0, dueSoon: 0, overdue: 0 };
    byType[s.type][s.status] += 1;
  }
  res.json({
    total: rows.length,
    compliant: count('compliant'),
    dueSoon: count('dueSoon'),
    overdue: count('overdue'),
    compliancePct: rows.length ? Math.round((count('compliant') / rows.length) * 100) : 0,
    byType,
  });
});

// GET /api/compliance/schools?q=&status=&type=&page=&pageSize=  (or all=1 for every row, e.g. the map)
router.get('/schools', (req, res) => {
  const rows = filterSchools(req.query).sort((a, b) => {
    const rank = { overdue: 0, dueSoon: 1, compliant: 2 };
    return rank[a.status] - rank[b.status] || (a.nextDue ?? '').localeCompare(b.nextDue ?? '') || a.name.localeCompare(b.name);
  });
  if (req.query.all) return res.json({ total: rows.length, schools: rows });
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({ total: rows.length, page, pageSize, pages, schools: rows.slice((page - 1) * pageSize, page * pageSize) });
});

router.get('/schools/export.csv', (req, res) => {
  const rows = filterSchools(req.query);
  logAudit(req, { action: 'export', module: 'Compliance', recordId: 'compliance.csv', summary: `Exported compliance status for ${rows.length} schools` });
  const header = ['School', 'Type', 'Buildings', 'ACM Locations', 'Last Inspection', 'Next Due', 'Compliance Status'];
  const lines = rows.map((s) => [s.name, s.type, s.buildings, s.acmLocations, s.lastInspection?.slice(0, 10), s.nextDue, STATUS_LABEL[s.status]]);
  res.type('text/csv').attachment('compliance-status.csv')
    .send([header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n'));
});

router.get('/schools/:id', (req, res) => {
  const row = schoolRows().find((s) => s.id === req.params.id);
  if (!row) return res.status(404).json({ error: 'School not found' });
  const inspections = getInspections().filter((i) => i.schoolId === row.id)
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  res.json({ ...row, inspections });
});

// GET /api/compliance/inspections?from=YYYY-MM-DD&to=YYYY-MM-DD&schoolId=&status=&type=
router.get('/inspections', (req, res) => {
  const { from, to, schoolId, status, type } = req.query;
  const list = getInspections().filter((i) =>
    (!from || i.scheduledDate >= from) && (!to || i.scheduledDate <= to)
    && (!schoolId || i.schoolId === schoolId)
    && (!status || i.status === status)
    && (!type || i.type === type));
  res.json({ total: list.length, inspections: list });
});

router.get('/inspections/:id', (req, res) => {
  const i = getInspection(req.params.id);
  if (!i) return res.status(404).json({ error: 'Inspection not found' });
  res.json({ ...i, school: schoolCompliance(i.schoolId) });
});

// POST /api/compliance/inspections/:id/complete  { notes? }
router.post('/inspections/:id/complete', async (req, res, next) => {
  try {
    const existing = getInspection(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inspection not found' });
    if (existing.completedAt) return res.status(409).json({ error: 'This inspection is already completed' });
    const { inspection, next: nextInsp } = await completeInspection(existing.id, String(req.body?.notes ?? '').slice(0, 500));
    logAudit(req, {
      action: 'update', module: 'Inspection', recordId: inspection.id, link: '/compliance',
      summary: `Marked ${inspection.type} completed – ${inspection.schoolName}`,
      changes: [{ field: 'Status', from: existing.status, to: 'completed' }],
      related: { school: inspection.schoolName, building: inspection.buildingName },
    });
    if (nextInsp) {
      logAudit(req, {
        action: 'create', module: 'Inspection', recordId: nextInsp.id, link: '/compliance',
        summary: `Scheduled next 6-Month Surveillance – ${nextInsp.schoolName}`,
        changes: [{ field: 'Scheduled Date', to: nextInsp.scheduledDate }],
        related: { school: nextInsp.schoolName },
      });
    }
    notify({
      type: 'inspection', priority: 'low', title: 'Inspection Completed',
      message: `${inspection.type} marked as completed.`,
      schoolId: inspection.schoolId, schoolName: inspection.schoolName, buildingName: inspection.buildingName,
      link: '/compliance', linkLabel: 'View Compliance',
      description: `${inspection.type} at ${inspection.schoolName} was completed${nextInsp ? `; the next surveillance is scheduled for ${nextInsp.scheduledDate}` : ''}.`,
    });
    res.json({ inspection, next: nextInsp, school: schoolCompliance(inspection.schoolId) });
  } catch (err) {
    next(err);
  }
});

// POST /api/compliance/inspections/:id/reschedule  { date: "YYYY-MM-DD" }
router.post('/inspections/:id/reschedule', async (req, res, next) => {
  try {
    const existing = getInspection(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inspection not found' });
    if (existing.completedAt) return res.status(409).json({ error: 'Completed inspections can’t be rescheduled' });
    const date = String(req.body?.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({ error: 'Choose a valid date', fields: { date: 'Choose a valid date' } });
    }
    if (date === existing.scheduledDate) return res.status(400).json({ error: 'That is already the scheduled date', fields: { date: 'Pick a different date' } });
    const { inspection, from } = await rescheduleInspection(existing.id, date);
    logAudit(req, {
      action: 'update', module: 'Inspection', recordId: inspection.id, link: '/compliance',
      summary: `Rescheduled ${inspection.type} – ${inspection.schoolName}`,
      changes: [{ field: 'Scheduled Date', from, to: date }],
      related: { school: inspection.schoolName, building: inspection.buildingName },
    });
    res.json({ inspection, school: schoolCompliance(inspection.schoolId) });
  } catch (err) {
    next(err);
  }
});

// Accredited inspectors who can be booked (active app users with the inspector role)
const inspectors = () => listUsers().filter((u) => u.roleId === 'inspector' && u.status === 'active')
  .map((u) => ({ id: u.id, name: u.name })).sort(listOrder);

router.get('/meta', (req, res) => res.json({ inspectors: inspectors() }));

// POST /api/compliance/inspections/:id/schedule  { date: "YYYY-MM-DD", inspectorId } — book the date and inspector
router.post('/inspections/:id/schedule', async (req, res, next) => {
  try {
    const existing = getInspection(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Inspection not found' });
    if (existing.completedAt) return res.status(409).json({ error: 'Completed inspections can’t be scheduled' });
    const date = String(req.body?.date ?? '');
    const person = inspectors().find((p) => p.id === req.body?.inspectorId);
    const errors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.date = 'Choose the inspection date';
    else if (date < new Date().toISOString().slice(0, 10)) errors.date = 'The date can’t be in the past';
    if (!person) errors.inspectorId = 'Choose the inspector';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
    const me = currentUser();
    const { inspection, before } = await bookInspection(existing.id, { date, inspectorId: person.id, inspectorName: person.name, by: { id: me.id, name: me.name } });
    logAudit(req, {
      action: 'update', module: 'Inspection', recordId: inspection.id, link: '/compliance',
      summary: `Scheduled ${inspection.type} – ${inspection.schoolName}`,
      changes: [{ field: 'Scheduled Date', from: before.date, to: date }, { field: 'Inspector', from: before.inspector ?? '—', to: person.name }],
      related: { school: inspection.schoolName, building: inspection.buildingName },
    });
    res.json({ inspection, school: schoolCompliance(inspection.schoolId) });
  } catch (err) {
    next(err);
  }
});

export default router;
