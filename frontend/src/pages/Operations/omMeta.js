// Badge tones for O&M screens (dashboard .tone-* classes)
export const STATUS_TONE = { pending: 'neutral', inProgress: 'warning', completed: 'good', overdue: 'critical' }
export const PRIORITY_TONE = { Low: 'good', Medium: 'primary', High: 'warning', Urgent: 'critical' }
export const PLAN_STATUS = {
  current: { label: 'Current', tone: 'good' },
  reviewDue: { label: 'Review due ≤ 60 days', tone: 'warning' },
  reviewOverdue: { label: 'Review overdue', tone: 'critical' },
}

export const TABS = [
  { id: 'overview', label: 'O&M Overview', path: '/operations' },
  { id: 'work-orders', label: 'O&M Work Orders', path: '/operations/work-orders' },
  { id: 'plans', label: 'O&M Plans', path: '/operations/plans' },
  { id: 'procedures', label: 'Procedures & SOPs', path: '/operations/procedures' },
  { id: 'history', label: 'O&M History', path: '/operations/history' },
]
