import { CircleCheck, Clock, TriangleAlert, CalendarCheck, CalendarClock } from 'lucide-react'

const SCHOOL_STATUS = {
  compliant: { label: 'Compliant', icon: CircleCheck },
  dueSoon: { label: 'Due Soon', icon: Clock },
  overdue: { label: 'Non-Compliant', icon: TriangleAlert },
}

export function SchoolStatusBadge({ status }) {
  const s = SCHOOL_STATUS[status] ?? SCHOOL_STATUS.compliant
  const Icon = s.icon
  return <span className={`c-status c-${status}`}><Icon size={13} />{s.label}</span>
}

const INSPECTION_STATUS = {
  completed: { label: 'Completed', icon: CircleCheck },
  scheduled: { label: 'Scheduled', icon: CalendarCheck },
  dueSoon: { label: 'Upcoming', icon: CalendarClock },
  overdue: { label: 'Overdue', icon: TriangleAlert },
}

export function InspectionStatusBadge({ status }) {
  const s = INSPECTION_STATUS[status] ?? INSPECTION_STATUS.scheduled
  const Icon = s.icon
  return <span className={`c-istatus c-i-${status}`}><Icon size={12} />{s.label}</span>
}
