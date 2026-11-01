// Users-list filters live in the URL query: ?role=&status=&school=
// status defaults to "active" when absent; "all" means no status filter.

export const FACILITIES_STAFF = 'facilities-manager,inspector'

export function readFilters(params) {
  const status = params.get('status')
  return {
    role: params.get('role') ?? '',
    school: params.get('school') ?? '',
    status: status === null ? 'active' : status === 'all' ? '' : status,
  }
}

// Build a query string from filter values (dropping defaults to keep URLs short)
export function filterQuery({ role = '', school = '', status = 'active' }) {
  const p = new URLSearchParams()
  if (role) p.set('role', role)
  if (school) p.set('school', school)
  if (status !== 'active') p.set('status', status || 'all')
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}
