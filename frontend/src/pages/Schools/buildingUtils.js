export const MAX_FLOORS = 3
export const PRESUMED_ACM_BEFORE = 1981
export const ACM_STATUSES = ['ACM Present', 'Assumed ACM', 'No ACM']
export const FLOOR_NAMES = ['Ground Floor', 'Second Floor', 'Third Floor']
// AHERA physical-condition categories for ACM ("Not assessed" for assumed material)
export const ACM_CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged', 'Not assessed']
export const CONSTRUCTION =['Concrete', 'Masonry', 'Steel Frame', 'Wood Frame', 'Modular']

// ACM filter used by the KPI cards and the status dropdown
export const ACM_FILTERS = {
  acm: { label: 'With ACM', test: (b) => b.acmStatus !== 'No ACM' },
  'ACM Present': { label: 'ACM Present', test: (b) => b.acmStatus === 'ACM Present' },
  'Assumed ACM': { label: 'Assumed ACM', test: (b) => b.acmStatus === 'Assumed ACM' },
  'No ACM': { label: 'No ACM', test: (b) => b.acmStatus === 'No ACM' },
}

export function buildingTotals(list) {
  const sum = (k) => list.reduce((n, b) => n + (b[k] ?? 0), 0)
  const rooms = sum('rooms')
  const withAcm = sum('roomsWithAcm')
  return { buildings: list.length, floors: sum('floors'), rooms, withAcm, noAcm: rooms - withAcm }
}

export const fmtNum = (n) => (n == null ? '—' : n.toLocaleString('en-US'))
