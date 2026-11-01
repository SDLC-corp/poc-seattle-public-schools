import { CircleCheck, TriangleAlert, Clock } from 'lucide-react'

const STATUS = {
  compliant: { label: 'Compliant', icon: CircleCheck },
  exceedance: { label: 'Exceedance', icon: TriangleAlert },
  pending: { label: 'Pending', icon: Clock },
}

export function AirStatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.pending
  const Icon = s.icon
  return <span className={`air-status air-${status}`}><Icon size={12} />{s.label}</span>
}
