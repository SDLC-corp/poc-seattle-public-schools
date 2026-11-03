import { fmtDate } from '../../lib/api'

export const TABS = [
  { id: 'list', label: 'Surveillance List', path: '/surveillance' },
  { id: 'schedule', label: 'Surveillance Schedule', path: '/surveillance/schedule' },
  { id: 'history', label: 'Surveillance History', path: '/surveillance/history' },
  { id: 'findings', label: 'Findings', path: '/surveillance/findings' },
]

export const CONDITION_TONE = { Good: 'good', Damaged: 'warning', 'Significantly Damaged': 'critical', 'Not Assessed': 'neutral' }
export const STATUS = {
  completed: { label: 'Completed', tone: 'primary' },
  actionRequired: { label: 'Action Required', tone: 'warning' },
  draft: { label: 'Draft', tone: 'neutral' },
}
export const SCHEDULE_STATUS = {
  overdue: { label: 'Overdue', tone: 'critical' },
  dueSoon: { label: 'Due ≤ 30 Days', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'good' },
}
export const ACTION_TONE = { Open: 'warning', 'In Progress': 'primary', Closed: 'good' }

// Calendar days ("YYYY-MM-DD") parsed as local midnight so they don't shift a day
export const fmtDay = (iso) => (iso ? fmtDate(`${iso.slice(0, 10)}T00:00:00`) : '—')
export const isoToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Sample ACM IDs embed the facility ("ACM-adamses-b2-f1-r2-1"); show the distinguishing part
export const shortAcm = (id, schoolId) => {
  const prefix = `ACM-${schoolId}-`
  return id?.startsWith(prefix) ? `ACM-${id.slice(prefix.length).toUpperCase()}` : id
}

export const floorLink = (x) => `/schools/${x.schoolId}/buildings/${x.buildingId}/floors/${x.floorId}?room=${encodeURIComponent(x.roomId)}`

export function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

export const toQs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v) })
  return p.toString()
}
