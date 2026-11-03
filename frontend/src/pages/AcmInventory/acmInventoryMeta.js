import { fmtDate } from '../../lib/api'

export const TABS = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'material-types', label: 'By Material Type', groupBy: 'type', groupLabel: 'Material Type' },
  { id: 'buildings', label: 'By Building', groupBy: 'building', groupLabel: 'Building' },
  { id: 'condition', label: 'By Condition', groupBy: 'condition', groupLabel: 'Condition' },
  { id: 'assessment', label: 'By Assessment', groupBy: 'status', groupLabel: 'ACM Status' },
  { id: 'history', label: 'Inventory History' },
]

// Badge tones (dashboard .tone-* classes)
export const CONDITION_TONE = { Good: 'good', Damaged: 'warning', 'Significantly Damaged': 'critical', 'Not Assessed': 'neutral' }
export const STATUS_TONE = { 'ACM Present': 'critical', 'Assumed ACM': 'warning', 'No ACM': 'good' }
export const RISK_TONE = { High: 'critical', Medium: 'warning', Low: 'good' }

export const EMPTY_FILTERS = { school: '', building: '', floor: '', type: '', condition: '', status: '', q: '' }

// Material dates are calendar days ("YYYY-MM-DD"); parse as local midnight so they don't shift a day
export const fmtDay = (iso) => (iso ? fmtDate(`${iso}T00:00:00`) : '—')

export const floorLink = (r) => `/schools/${r.schoolId}/buildings/${r.buildingId}/floors/${r.floorId}?room=${encodeURIComponent(r.roomId)}`
