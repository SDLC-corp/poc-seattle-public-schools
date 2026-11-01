import { CirclePlus, Pencil, Trash2, LogIn, LogOut, ShieldAlert, Download } from 'lucide-react'

const ACTIONS = {
  create: { label: 'Create', icon: CirclePlus },
  update: { label: 'Update', icon: Pencil },
  delete: { label: 'Delete', icon: Trash2 },
  login: { label: 'Sign in', icon: LogIn },
  logout: { label: 'Sign out', icon: LogOut },
  login_failed: { label: 'Failed sign-in', icon: ShieldAlert },
  export: { label: 'Export', icon: Download },
}

export function ActionBadge({ action }) {
  const a = ACTIONS[action] ?? { label: action, icon: Pencil }
  const Icon = a.icon
  return (
    <span className={`a-badge a-${action}`}>
      <Icon size={13} />{a.label}
    </span>
  )
}
