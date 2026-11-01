import { Router } from 'express';
import { getEntries, getEntry, logAudit, ACTIONS } from '../data/auditStore.js';

const DAY = 86400000;

// Tabs on the Audit Logs screen are preset action groups
const ACTION_GROUPS = {
  data: ['create', 'update', 'delete'],
  login: ['login', 'logout', 'login_failed'],
  export: ['export'],
};

function filterEntries({ from, to, user, module, action, group, q, sort }) {
  const fromMs = from ? Date.parse(from) : -Infinity;
  const toMs = to ? Date.parse(to) + DAY - 1 : Infinity; // `to` is inclusive (a date)
  const groupActions = ACTION_GROUPS[group];
  const term = q?.trim().toLowerCase();
  const dir = sort === 'asc' ? 1 : -1; // newest first by default
  return getEntries().filter((e) => {
    const t = Date.parse(e.at);
    return t >= fromMs && t <= toMs
      && (!user || e.user.id === user)
      && (!module || e.module === module)
      && (!action || e.action === action)
      && (!groupActions || groupActions.includes(e.action))
      && (!term || [e.summary, e.recordId, e.module, e.user.name, e.user.email, e.ip, e.id]
        .some((v) => v?.toLowerCase().includes(term)));
  }).sort((a, b) => dir * a.at.localeCompare(b.at));
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const router = Router();

// GET /api/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&user=&module=&action=&group=&q=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterEntries(req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  const count = (a) => filtered.filter((e) => e.action === a).length;
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    stats: { total: filtered.length, create: count('create'), update: count('update'), delete: count('delete') },
    entries: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Filter options: who appears in the log and which modules
router.get('/facets', (req, res) => {
  const users = new Map();
  const modules = new Set();
  for (const e of getEntries()) {
    users.set(e.user.id, { id: e.user.id, name: e.user.name });
    modules.add(e.module);
  }
  res.json({
    users: [...users.values()].sort((a, b) => a.name.localeCompare(b.name)),
    modules: [...modules].sort(),
    actions: ACTIONS,
  });
});

router.get('/export.csv', (req, res) => {
  const rows = filterEntries(req.query);
  logAudit(req, {
    action: 'export', module: 'Audit Logs', recordId: 'audit.csv',
    summary: `Exported ${rows.length} audit log entries to CSV`,
  });
  const header = ['ID', 'Date & Time (UTC)', 'User', 'Email', 'Action', 'Module', 'Record', 'Details', 'IP Address', 'Changes'];
  const lines = rows.map((e) => [
    e.id, e.at, e.user.name, e.user.email, e.action, e.module, e.recordId, e.summary, e.ip,
    e.changes.map((c) => (c.from !== undefined ? `${c.field}: ${c.from} -> ${c.to}` : `${c.field}: ${c.to}`)).join('; '),
  ]);
  res.type('text/csv').attachment('audit-logs.csv')
    .send([header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n'));
});

router.get('/:id', (req, res) => {
  const entry = getEntry(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Audit entry not found' });
  res.json(entry);
});

export default router;
