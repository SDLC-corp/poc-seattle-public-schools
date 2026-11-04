import { CircleCheck, Clock, TriangleAlert, CircleMinus } from 'lucide-react'

const STATUS = {
  compliant: { label: 'Compliant', icon: CircleCheck, cls: 'good' },
  valid: { label: 'Valid', icon: CircleCheck, cls: 'good' },
  dueSoon: { label: 'Due Soon', icon: Clock, cls: 'warn' },
  expired: { label: 'Expired', icon: TriangleAlert, cls: 'crit' },
  missing: { label: 'Missing', icon: CircleMinus, cls: 'crit' },
  notCertified: { label: 'Not Certified', icon: CircleMinus, cls: 'crit' },
  overdue: { label: 'Overdue', icon: TriangleAlert, cls: 'warn' },
}

// A person's overall status, matching the School Compliance sections: Not Certified (a required course never
// taken), Overdue (one lapsed), otherwise their training status (Compliant / Due Soon)
export const personStatus = (p) => (p.required.some((r) => r.status === 'missing') ? 'notCertified'
  : p.required.some((r) => r.status === 'expired') ? 'overdue' : p.trainingStatus)

export function TrainingStatus({ status }) {
  const s = STATUS[status] ?? STATUS.missing
  const Icon = s.icon
  return <span className={`p-status ${s.cls}`}><Icon size={12} />{s.label}</span>
}

const KIND_TONE = { Employee: 'teal', Contractor: 'violet', Inspector: 'good' }
export function CategoryBadge({ person }) {
  return <span className={`p-cat tone-${KIND_TONE[person.kind] ?? 'primary'}`}>{person.categoryLabel}</span>
}
