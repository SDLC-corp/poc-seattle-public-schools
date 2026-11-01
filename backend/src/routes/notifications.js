import { Router } from 'express';
import {
  getNotifications, getNotification, setRead, removeNotifications, TYPES, PRIORITIES,
} from '../data/notificationsStore.js';

const DAY = 86400000;

// tab: "unread" | "priority" (high priority) | anything else = all
function filterItems({ tab, q, type, school, priority, from, to }) {
  const term = q?.trim().toLowerCase();
  const fromMs = from ? Date.parse(from) : -Infinity;
  const toMs = to ? Date.parse(to) + DAY - 1 : Infinity;
  return getNotifications().filter((n) => {
    const t = Date.parse(n.createdAt);
    return t >= fromMs && t <= toMs
      && (tab !== 'unread' || !n.read)
      && (tab !== 'priority' || n.priority === 'high')
      && (!type || n.type === type)
      && (!priority || n.priority === priority)
      && (!school || (school === 'all-schools' ? !n.schoolId : n.schoolId === school))
      && (!term || [n.title, n.message, n.schoolName, n.buildingName, n.id].some((v) => v?.toLowerCase().includes(term)));
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function summary() {
  const all = getNotifications();
  const unread = all.filter((n) => !n.read);
  return {
    counts: { all: all.length, unread: unread.length, priority: all.filter((n) => n.priority === 'high').length },
    unreadByType: Object.fromEntries(TYPES.map((t) => [t, unread.filter((n) => n.type === t).length])),
  };
}

const ids = (body) => (Array.isArray(body?.ids) ? body.ids.map(String) : []);

const router = Router();

// GET /api/notifications?tab=&q=&type=&school=&priority=&from=&to=&page=&pageSize=
router.get('/', (req, res) => {
  const filtered = filterItems(req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    ...summary(),
    types: TYPES,
    priorities: PRIORITIES,
    notifications: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

// Lightweight count for the top-bar bell and sidebar badge
router.get('/summary', (req, res) => res.json(summary()));

router.get('/:id', (req, res) => {
  const n = getNotification(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found' });
  res.json(n);
});

// PATCH /api/notifications/:id  { read: true|false }
router.patch('/:id', async (req, res, next) => {
  try {
    if (!getNotification(req.params.id)) return res.status(404).json({ error: 'Notification not found' });
    if (typeof req.body?.read !== 'boolean') return res.status(400).json({ error: '"read" must be true or false' });
    await setRead([req.params.id], req.body.read);
    res.json({ ...getNotification(req.params.id), ...summary() });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read  { ids: [...], read: true|false }  — or { all: true } to mark everything read
router.post('/read', async (req, res, next) => {
  try {
    const read = req.body?.read !== false;
    const target = req.body?.all ? getNotifications().map((n) => n.id) : ids(req.body);
    const changed = await setRead(target, read);
    res.json({ changed, ...summary() });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/delete  { ids: [...] }
router.post('/delete', async (req, res, next) => {
  try {
    const removed = await removeNotifications(ids(req.body));
    res.json({ removed, ...summary() });
  } catch (err) {
    next(err);
  }
});

export default router;
