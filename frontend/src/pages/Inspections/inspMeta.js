// Badge tones for the inspection screens (dashboard .tone-* classes)
export const STATE_TONE = { scheduled: 'primary', draft: 'warning', submitted: 'violet', approved: 'good', returned: 'warning' }
// List status (server: inspectionMeta.statusOf)
export const STATUS_TONE = { scheduled: 'primary', inProgress: 'warning', pendingReview: 'violet', actionRequired: 'critical', completed: 'good' }
export const CONDITION_TONE = { Good: 'good', Damaged: 'warning', 'Significantly Damaged': 'critical', 'Not Assessed': 'neutral' }
export const PRIORITY_TONE = { Low: 'good', Medium: 'warning', High: 'critical', Critical: 'critical' }
export const CHANGE_TONE = { Improved: 'good', Unchanged: 'neutral', Deteriorated: 'critical', 'First Assessment': 'primary' }
export const ACTION_TONE = { Pending: 'warning', 'In Progress': 'primary', Completed: 'good' }
export const RESULT_TONE = { 'Asbestos Detected': 'critical', 'Exceeds Limit': 'critical', 'No Asbestos Detected': 'good', 'Below Limit': 'good', Pending: 'warning', 'Not Analyzed': 'neutral' }
export const PASS_TONE = { Pass: 'good', Fail: 'critical' }

const withUnit = (v, unit) => `${v}${unit === '%' ? '' : ' '}${unit ?? ''}`
// A sample's lab measurement, e.g. "3% Chrysotile" or "0.004 f/cc" (server: inspectionMeta.resultSummary)
export const measureText = (s) => {
  const v = s?.airValue ?? s?.measuredValue
  return v == null ? '' : `${withUnit(v, s.measureUnit)}${s.asbestosTypes?.length ? ` ${s.asbestosTypes.join(', ')}` : ''}`
}
export const limitText = (s) => (s?.limitValue == null ? '' : `limit ${withUnit(s.limitValue, s.measureUnit)}`)

// The samples of one ACM: the first is acm.sampling, any further ones in sampling.more; k is the position, 0 = first
// (server: inspectionMeta.samplesOf)
export const samplesOf = (a) => (a?.sampling?.required === 'Yes'
  ? [{ k: 0, s: a.sampling }, ...(a.sampling.more ?? []).map((s, j) => ({ k: j + 1, s }))] : [])
// Where a sample is listed once it's at the lab (server: inspectionSamples.labSampleId / airEventId)
export const sampleLink = (inspectionId, acmIndex, k, s) => (s?.sampleType === 'Air Sample'
  ? `/air-monitoring/events/${encodeURIComponent(`AIR-${inspectionId}-${acmIndex + 1}${k ? `-${k + 1}` : ''}`)}`
  : `/sampling/samples/${encodeURIComponent(`ins-${inspectionId}-${acmIndex}${k ? `-${k}` : ''}`)}`)

// "13:30" → "1:30 PM"
export const fmtTime = (hhmm) => {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const RANK ={ Good: 0, Damaged: 1, 'Significantly Damaged': 2 }
// Same rule as the server (backend/src/data/inspectionMeta.js)
export const conditionChange = (previous, current) => {
  if (!previous || !current || RANK[previous] === undefined) return 'First Assessment'
  const d = RANK[current] - RANK[previous]
  return d > 0 ? 'Deteriorated' : d < 0 ? 'Improved' : 'Unchanged'
}

// Form sections (ids are anchors for the section index)
export const SECTIONS = [
  { id: 'location', n: 1, title: 'School & Location Details' },
  { id: 'acm', n: 2, title: 'ACM Material Details' },
  { id: 'condition', n: 3, title: 'Material Condition Assessment' },
  { id: 'checklist', n: 4, title: 'Inspection Checklist' },
  { id: 'sampling', n: 5, title: 'Sampling & Laboratory Details' },
  { id: 'risk', n: 6, title: 'Risk Assessment & Recommendations' },
  { id: 'documents', n: 7, title: 'Photos & Documents' },
  { id: 'comments', n: 8, title: 'Comments & Observations' },
  { id: 'actions', n: 9, title: 'O&M Tasks' },
  { id: 'verification', n: 10, title: 'Verification & Signatures' },
]
