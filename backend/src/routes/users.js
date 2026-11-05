import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { getRoles, getRole, roleExists } from '../data/rolesStore.js';
import { schools } from '../data/store.js';
import { logAudit, diff, snapshot } from '../data/auditStore.js';
import { notify } from '../data/notificationsStore.js';
import { writeJson, readPath } from '../data/atomicWrite.js';

const USER_FIELDS = ['name', 'email', 'phone', 'department', 'jobTitle', 'roleId', 'status'];
// Audit-friendly view of a user: role name and school access as readable values
const auditView = (u) => ({
  ...Object.fromEntries(USER_FIELDS.map((f) => [f, u[f]])),
  roleId: getRole(u.roleId)?.name ?? u.roleId,
  access: u.access.scope === 'all' ? 'All schools' : `${u.access.scope}: ${u.access.schoolIds.join(', ') || '—'}`,
});

const USERS_FILE = new URL('../../data/users.json', import.meta.url);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCOPES = ['all', 'schools', 'assigned', 'lab'];
const STATUSES = ['active', 'inactive'];
const schoolIds = new Set(schools.map((s) => s.id));

const fileData = JSON.parse(readFileSync(readPath(USERS_FILE), 'utf8'));
let users = fileData.users;

const persist = () => writeJson(USERS_FILE, { ...fileData, users });

// Used by the roles API: a role with users can't be deleted
export const countUsersWithRole = (roleId) => users.filter((u) => u.roleId === roleId).length;
// Current user list (read-only use, e.g. people who can sign a surveillance)
export const listUsers = () => users;
// Order for people pickers: users flagged `listFirst` (e.g. the lead inspector) on top, then by name.
// Works on any { id, name } list whose ids are user ids.
const pinned = (x) => (users.find((u) => u.id === x.id)?.listFirst ? 1 : 0);
export const listOrder = (a, b) => pinned(b) - pinned(a) || a.name.localeCompare(b.name);

// `role` may be a comma-separated list, e.g. "facilities-manager,inspector"
function filterUsers({ q, role, school, status }) {
  const term = q?.trim().toLowerCase();
  const roleSet = role ? new Set(String(role).split(',').filter(Boolean)) : null;
  return users.filter((u) =>
    (!roleSet || roleSet.has(u.roleId))
    && (!status || u.status === status)
    && (!school || u.access.scope === 'all' || u.access.schoolIds.includes(school))
    && (!term || [u.name, u.email, u.jobTitle, u.department, getRole(u.roleId)?.name]
      .some((v) => v?.toLowerCase().includes(term))));
}

// Validate and normalise a create/update payload; `existing` is the user being edited
function validateUser(body, existing) {
  const errors = {};
  const user = {
    name: String(body.name ?? existing?.name ?? '').trim(),
    email: String(body.email ?? existing?.email ?? '').trim().toLowerCase(),
    phone: String(body.phone ?? existing?.phone ?? '').trim(),
    department: String(body.department ?? existing?.department ?? '').trim(),
    jobTitle: String(body.jobTitle ?? existing?.jobTitle ?? '').trim(),
    roleId: body.roleId ?? existing?.roleId,
    status: body.status ?? existing?.status ?? 'active',
    access: {
      scope: body.access?.scope ?? existing?.access.scope ?? 'schools',
      schoolIds: [...new Set(body.access?.schoolIds ?? existing?.access.schoolIds ?? [])],
    },
  };

  if (!user.name) errors.name = 'Name is required';
  if (!EMAIL.test(user.email)) errors.email = 'Enter a valid email';
  else if (users.some((u) => u.email === user.email && u.id !== existing?.id)) errors.email = 'Another user already has this email';
  if (!roleExists(user.roleId)) errors.roleId = 'Choose a role';
  if (!STATUSES.includes(user.status)) errors.status = 'Invalid status';
  if (!SCOPES.includes(user.access.scope)) errors.access = 'Invalid school access';
  else if (['schools', 'assigned'].includes(user.access.scope)) {
    if (!user.access.schoolIds.length) errors.access = 'Select at least one school';
    else if (user.access.schoolIds.some((id) => !schoolIds.has(id))) errors.access = 'Unknown school selected';
  } else {
    user.access.schoolIds = [];
  }
  return { user, errors };
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const router = Router();

// GET /api/users?q=&role=&school=&status=&page=1&pageSize=10
router.get('/', (req, res) => {
  const filtered = filterUsers(req.query);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  res.json({
    total: filtered.length,
    page,
    pageSize,
    pages,
    users: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
});

router.get('/stats', (req, res) => {
  const roles = getRoles();
  const byRole = Object.fromEntries(roles.map((r) => [r.id, countUsersWithRole(r.id)]));
  res.json({
    total: users.length,
    roles: roles.length,
    byRole,
    inactive: users.filter((u) => u.status === 'inactive').length,
  });
});

router.get('/export.csv', (req, res) => {
  const header = ['Name', 'Email', 'Phone', 'Role', 'Department', 'Job Title', 'School Access', 'Status', 'Last Login'];
  const matching = filterUsers(req.query);
  logAudit(req, {
    action: 'export', module: 'User & Roles', recordId: 'users.csv',
    summary: `Exported ${matching.length} users to CSV`,
  });
  const rows = matching.map((u) => [
    u.name, u.email, u.phone, getRole(u.roleId)?.name, u.department, u.jobTitle,
    u.access.scope === 'all' ? 'All Schools' : u.access.schoolIds.join('; ') || u.access.scope,
    u.status, u.lastLogin,
  ]);
  res.type('text/csv').attachment('users.csv')
    .send([header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
});

router.get('/:id', (req, res) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.post('/', async (req, res, next) => {
  try {
    const { user, errors } = validateUser(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid user', fields: errors });
    const nextNum = Math.max(0, ...users.map((u) => Number(u.id.slice(1)) || 0)) + 1;
    const created = { id: `u${String(nextNum).padStart(3, '0')}`, ...user, lastLogin: null, createdAt: new Date().toISOString() };
    users = [created, ...users];
    await persist();
    const view = auditView(created);
    logAudit(req, {
      action: 'create', module: 'User & Roles', recordId: created.id,
      summary: `Added user ${created.name} (${view.roleId})`,
      changes: snapshot(view, [...USER_FIELDS, 'access']), link: '/users',
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = users.find((u) => u.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    const { user, errors } = validateUser(req.body, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid user', fields: errors });
    const updated = { ...existing, ...user };
    users = users.map((u) => (u.id === existing.id ? updated : u));
    await persist();
    const changes = diff(auditView(existing), auditView(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'User & Roles', recordId: existing.id,
        summary: `Updated user ${updated.name}`, changes, link: '/users',
      });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const existing = users.find((u) => u.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Status must be active or inactive' });
    const updated = { ...existing, status: req.body.status };
    users = users.map((u) => (u.id === existing.id ? updated : u));
    await persist();
    if (existing.status !== updated.status) {
      logAudit(req, {
        action: 'update', module: 'User & Roles', recordId: existing.id,
        summary: `${updated.status === 'active' ? 'Activated' : 'Deactivated'} user ${updated.name}`,
        changes: [{ field: 'status', from: existing.status, to: updated.status }], link: '/users',
      });
      if (updated.status === 'inactive') {
        notify({
          type: 'system', priority: 'low', link: '/users', linkLabel: 'View Users',
          title: 'User Deactivated',
          message: `${updated.name} (${getRole(updated.roleId)?.name ?? updated.roleId}) no longer has access.`,
          description: `${updated.name}'s account was deactivated. They can't sign in until an administrator reactivates them.`,
        });
      }
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
