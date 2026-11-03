export const MAX_FLOORS = 3
export const PRESUMED_ACM_BEFORE = 1981
export const ACM_STATUSES = ['ACM Present', 'Assumed ACM', 'No ACM']
// Suggested floor name from its number: 0 = ground floor, then First, Second… (Floor 11+ beyond Tenth)
const ORDINALS = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
export const floorName = (n) => (Number.isInteger(n) && n >= 0 ? (ORDINALS[n] ? `${ORDINALS[n]} Floor` : `Floor ${n}`) : '')
// Room numbers: floor prefix + 2 digits; the ground floor (0) uses G — G01, G02… (matches the backend)
export const roomNumber = (floorNumber, n) => `${floorNumber === 0 ? 'G' : floorNumber}${String(n).padStart(2, '0')}`
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
