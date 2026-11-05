// Trend Analysis: labels and colours shared by the page, charts and timeline.
// Colours follow the app's status palette; each trend also has an icon and a label, so colour is never the only cue.
export const TRENDS = {
  significant: { label: 'Significantly Deteriorated', short: 'Significant', color: '#c94040', tone: 'critical' },
  deteriorating: { label: 'Deteriorating', short: 'Deteriorating', color: '#d9a21b', tone: 'warning' },
  stable: { label: 'Stable', short: 'Stable', color: '#2e9e4f', tone: 'good' },
  improved: { label: 'Improved', short: 'Improved', color: '#2a78d6', tone: 'primary' },
  baseline: { label: 'Single Assessment', short: 'Single', color: '#b8c3cf', tone: 'neutral' },
}
export const TREND_ORDER = ['significant', 'deteriorating', 'stable', 'improved', 'baseline']

// AHERA condition scale used across the system
export const CONDITIONS = {
  Good: { color: '#2e9e4f', rank: 0 },
  Damaged: { color: '#d9a21b', rank: 1 },
  'Significantly Damaged': { color: '#c94040', rank: 2 },
}

// How each AHERA condition is presented on the overview (label, short label, tone for pills)
export const CONDITION_VIEW = {
  Good: { label: 'Stable', short: 'Stable', tone: 'good' },
  Damaged: { label: 'Minor Deterioration', short: 'Minor', tone: 'warning' },
  'Significantly Damaged': { label: 'Significant Deterioration', short: 'Significant', tone: 'critical' },
}
export const CONDITION_KEYS = Object.keys(CONDITION_VIEW)

export const LEVEL_LABEL ={ school: 'School', building: 'Building', floor: 'Floor', room: 'Room', acm: 'ACM' }

export const fmtDay = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')
export const fmtMonth = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
