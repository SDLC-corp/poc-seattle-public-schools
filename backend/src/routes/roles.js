import { Router } from 'express';
import {
  getRoles, getRole, permissions, validateRole, createRole, updateRole, deleteRole, updateMatrix,
  SYSTEM_ROLE_ID, SYSTEM_ROLE_REQUIRED,
} from '../data/rolesStore.js';
import { countUsersWithRole } from './users.js';
import { logAudit, diff, snapshot } from '../data/auditStore.js';

const withCounts = (r) => ({ ...r, userCount: countUsersWithRole(r.id) });
const ROLE_FIELDS = ['name', 'description', 'tone', 'defaultAccess', 'permissions'];
const roleView = (r) => Object.fromEntries(ROLE_FIELDS.map((f) => [f, r[f]]));

const router = Router();

router.get('/', (req, res) => res.json({
  roles: getRoles().map(withCounts),
  permissions,
  systemRole: { id: SYSTEM_ROLE_ID, required: SYSTEM_ROLE_REQUIRED },
}));

router.post('/', async (req, res, next) => {
  try {
    const { role, errors } = validateRole(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid role', fields: errors });
    const created = await createRole(role);
    logAudit(req, {
      action: 'create', module: 'User & Roles', recordId: `role:${created.id}`,
      summary: `Created role ${created.name}`, changes: snapshot(roleView(created), ROLE_FIELDS), link: '/users/roles',
    });
    res.status(201).json(withCounts(created));
  } catch (err) {
    next(err);
  }
});

// Bulk permission changes from the matrix: { matrix: { roleId: [permissionIds] } }
router.put('/matrix', async (req, res, next) => {
  try {
    const before = Object.fromEntries(getRoles().map((r) => [r.id, r]));
    const result = await updateMatrix(req.body?.matrix ?? {});
    if (result.errors) {
      return res.status(400).json({ error: Object.values(result.errors).join(' '), fields: result.errors });
    }
    for (const r of result.roles) {
      const changes = diff({ permissions: before[r.id]?.permissions }, { permissions: r.permissions });
      if (changes.length) {
        logAudit(req, {
          action: 'update', module: 'User & Roles', recordId: `role:${r.id}`,
          summary: `Changed permissions for role ${r.name}`, changes, link: '/users/permissions',
        });
      }
    }
    res.json({ roles: result.roles.map(withCounts) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = getRole(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found' });
    const { role, errors } = validateRole(req.body, existing);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid role', fields: errors });
    const updated = await updateRole(existing.id, role);
    const changes = diff(roleView(existing), roleView(updated));
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'User & Roles', recordId: `role:${existing.id}`,
        summary: `Updated role ${updated.name}`, changes, link: '/users/roles',
      });
    }
    res.json(withCounts(updated));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = getRole(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found' });
    if (existing.system) return res.status(409).json({ error: `${existing.name} is the system administrator role and can't be deleted` });
    const count = countUsersWithRole(existing.id);
    if (count) return res.status(409).json({ error: `${count} user${count > 1 ? 's have' : ' has'} this role. Reassign them before deleting it.` });
    await deleteRole(existing.id);
    logAudit(req, {
      action: 'delete', module: 'User & Roles', recordId: `role:${existing.id}`,
      summary: `Deleted role ${existing.name}`, changes: snapshot(roleView(existing), ROLE_FIELDS),
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
