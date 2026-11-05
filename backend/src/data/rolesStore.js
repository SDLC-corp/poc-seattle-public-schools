import { existsSync, readFileSync } from 'node:fs';
import { writeJson, readPath } from './atomicWrite.js';
import {
  defaultRoles, permissions, TONES, ACCESS_SCOPES, SYSTEM_ROLE_ID, SYSTEM_ROLE_REQUIRED,
} from './roleDefaults.js';

const ROLES_FILE = new URL('../../data/roles.json', import.meta.url);
const permissionIds = new Set(permissions.map((p) => p.id));

// Seeded from the defaults the first time; afterwards data/roles.json is the source of truth
let roles = existsSync(readPath(ROLES_FILE))
  ? JSON.parse(readFileSync(readPath(ROLES_FILE), 'utf8')).roles
  : structuredClone(defaultRoles);

const persist = () => writeJson(ROLES_FILE, { roles });

export const getRoles = () => roles.map((r) => ({ ...r, system: r.id === SYSTEM_ROLE_ID }));
export const getRole = (id) => getRoles().find((r) => r.id === id);
export const roleExists = (id) => roles.some((r) => r.id === id);
export { permissions, SYSTEM_ROLE_ID, SYSTEM_ROLE_REQUIRED };

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role';

// Normalise + validate a role payload. Returns { role, errors }.
export function validateRole(body, existing) {
  const errors = {};
  const role = {
    name: String(body.name ?? existing?.name ?? '').trim(),
    description: String(body.description ?? existing?.description ?? '').trim(),
    tone: body.tone ?? existing?.tone ?? 'primary',
    defaultAccess: body.defaultAccess ?? existing?.defaultAccess ?? 'schools',
    permissions: [...new Set(body.permissions ?? existing?.permissions ?? [])],
  };

  if (!role.name) errors.name = 'Role name is required';
  else if (role.name.length > 40) errors.name = 'Keep the name under 40 characters';
  else if (roles.some((r) => r.name.toLowerCase() === role.name.toLowerCase() && r.id !== existing?.id)) {
    errors.name = 'Another role already has this name';
  }
  if (!TONES.includes(role.tone)) errors.tone = 'Unknown colour';
  if (!ACCESS_SCOPES.includes(role.defaultAccess)) errors.defaultAccess = 'Unknown school access';
  if (role.permissions.some((p) => !permissionIds.has(p))) errors.permissions = 'Unknown permission';
  else if (!role.permissions.length) errors.permissions = 'Grant at least one permission';
  else if (existing?.id === SYSTEM_ROLE_ID && SYSTEM_ROLE_REQUIRED.some((p) => !role.permissions.includes(p))) {
    errors.permissions = 'The EHS Manager role must keep "Manage users and roles" and "Manage system settings"';
  }
  // Keep catalogue order so lists read consistently
  role.permissions = permissions.map((p) => p.id).filter((id) => role.permissions.includes(id));
  return { role, errors };
}

export async function createRole(role) {
  let id = slugify(role.name);
  for (let n = 2; roles.some((r) => r.id === id); n++) id = `${slugify(role.name)}-${n}`;
  const created = { id, ...role };
  roles = [...roles, created];
  await persist();
  return getRole(id);
}

export async function updateRole(id, role) {
  roles = roles.map((r) => (r.id === id ? { ...r, ...role } : r));
  await persist();
  return getRole(id);
}

export async function deleteRole(id) {
  roles = roles.filter((r) => r.id !== id);
  await persist();
}

// Bulk permission update from the matrix: { roleId: [permissionIds] }. All-or-nothing.
export async function updateMatrix(matrix) {
  const errors = {};
  const next = roles.map((r) => {
    if (!(r.id in matrix)) return r;
    const { role, errors: e } = validateRole({ permissions: matrix[r.id] }, r);
    if (e.permissions) errors[r.id] = `${r.name}: ${e.permissions}`;
    return { ...r, permissions: role.permissions };
  });
  if (Object.keys(errors).length) return { errors };
  roles = next;
  await persist();
  return { roles: getRoles() };
}
