// Users-page helpers; generic fetch/format helpers live in src/lib/api.js
export { request, initials, fmtDate, fmtDateTime } from '../../lib/api'

// Human summary of a user's school access
export function accessSummary(access, schoolName) {
  switch (access.scope) {
    case 'all': return 'All Schools'
    case 'lab': return 'Lab Results Only'
    case 'assigned': return `Assigned Projects (${access.schoolIds.length})`
    default:
      return access.schoolIds.length === 1 ? schoolName(access.schoolIds[0]) : `Multiple Schools (${access.schoolIds.length})`
  }
}

export const ACCESS_SCOPES = [
  { value: 'all', label: 'All schools', hint: 'District-wide access' },
  { value: 'schools', label: 'Specific schools', hint: 'Only the schools selected below' },
  { value: 'assigned', label: 'Assigned projects', hint: 'Contractors: schools with assigned work' },
  { value: 'lab', label: 'Lab results only', hint: 'No school data; upload lab results' },
]
