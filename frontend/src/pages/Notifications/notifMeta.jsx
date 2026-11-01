import {
  CalendarCheck, ShieldAlert, Layers, ShieldCheck, Bell, TriangleAlert, CircleCheck, Settings, CalendarClock,
} from 'lucide-react'

const TYPE_META = {
  inspection: { label: 'Inspection', icon: CalendarCheck },
  compliance: { label: 'Compliance', icon: ShieldAlert },
  acm: { label: 'ACM Update', icon: Layers },
  system: { label: 'System Alert', icon: ShieldCheck },
  other: { label: 'Other', icon: Bell },
}

export function TypeBadge({ type }) {
  const m = TYPE_META[type] ?? TYPE_META.other
  const Icon = m.icon
  return <span className={`n-type n-type-${type}`}><Icon size={13} />{m.label}</span>
}

// Row icon: urgency first (overdue/high → warning, completed → check), then type
export function NotificationIcon({ n, size = 18 }) {
  let Icon = TYPE_META[n.type]?.icon ?? Bell
  let tone = n.type
  if (/overdue|damage/i.test(n.title) || (n.priority === 'high' && n.type !== 'acm')) { Icon = TriangleAlert; tone = 'danger' }
  else if (/completed|reviewed/i.test(n.title)) { Icon = CircleCheck; tone = 'done' }
  else if (n.type === 'system') Icon = Settings
  else if (n.type === 'compliance') Icon = CalendarClock
  return <span className={`n-icon n-icon-${tone}`}><Icon size={size} /></span>
}

export function PriorityBadge({ priority }) {
  return <span className={`n-priority ${priority}`}>{priority[0].toUpperCase() + priority.slice(1)}</span>
}
