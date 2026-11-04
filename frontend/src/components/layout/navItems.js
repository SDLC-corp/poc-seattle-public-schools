import {
  House, School, Layers, ClipboardCheck, FileText, FlaskConical, ScanEye,
  TriangleAlert, Wrench, Wind, GraduationCap, ListChecks, Bell, FolderOpen,
  ChartLine, UsersRound, History, Settings, LifeBuoy, Plug,
} from 'lucide-react'

// Every item has a route `path`. Child items are placeholders until the real pages are defined.
export const mainNav = [
  { id: 'dashboard', label: 'Dashboard', icon: House, path: '/dashboard' },
  {
    id: 'schools', label: 'Schools & Facilities', icon: School, path: '/schools',
    children: [
      { id: 'schools-list', label: 'Schools', path: '/schools/list' },
      { id: 'buildings', label: 'Buildings', path: '/schools/buildings' },
      { id: 'floors', label: 'Floors', path: '/schools/floors' },
    ],
  },
  { id: 'acm', label: 'ACM Inventory', icon: Layers, path: '/acm' },
  { id: 'inspections', label: 'Inspections', icon: ClipboardCheck, path: '/inspections' },
  // hidden: kept for routing and page titles, not shown in the sidebar
  { id: 'management-plans', label: 'Management Plans', icon: FileText, path: '/management-plans', hidden: true },
  { id: 'sampling', label: 'Sampling & Lab Results', icon: FlaskConical, path: '/sampling' },
  { id: 'surveillance', label: 'Surveillance', icon: ScanEye, path: '/surveillance' },
  { id: 'response-actions', label: 'Response Actions', icon: TriangleAlert, path: '/response-actions' },
  { id: 'operations', label: 'Operations & Maintenance', icon: Wrench, path: '/operations' },
  { id: 'air-monitoring', label: 'Air Monitoring', icon: Wind, path: '/air-monitoring' },
  { id: 'personnel', label: 'Personnel, Training & Certifications', icon: GraduationCap, path: '/personnel' },
  { id: 'compliance', label: 'Compliance & Tracking', icon: ListChecks, path: '/compliance' },
  // badgeKey: the sidebar shows a live count for this item (see Sidebar.jsx)
  { id: 'notifications', label: 'Notifications', icon: Bell, badgeKey: 'unreadNotifications', path: '/notifications' },
  { id: 'documents', label: 'Document Management', icon: FolderOpen, path: '/documents' },
  { id: 'reports', label: 'Reports & Analytics', icon: ChartLine, path: '/reports' },
]

export const adminNav = [
  { id: 'users', label: 'User & Role Management', icon: UsersRound, path: '/users' },
  { id: 'audit', label: 'Audit Logs', icon: History, path: '/audit' },
  { id: 'integrations', label: 'Integrations', icon: Plug, path: '/integrations' },
  { id: 'help', label: 'Help & Learning', icon: LifeBuoy, path: '/help' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
]

const allTop = [...mainNav, ...adminNav]

// Does `pathname` belong to this nav path (exact match or a sub-path)?
export const isPathActive = (path, pathname) => pathname === path || pathname.startsWith(`${path}/`)

// The nav entry (and child, if any) for the current URL — used for titles and placeholders
export function findNav(pathname) {
  for (const item of allTop) {
    const child = item.children?.find((c) => isPathActive(c.path, pathname))
    if (child) return { item, child }
    if (isPathActive(item.path, pathname)) return { item, child: null }
  }
  return null
}

export const pathForId = (id) => {
  for (const item of allTop) {
    if (item.id === id) return item.path
    const child = item.children?.find((c) => c.id === id)
    if (child) return child.path
  }
  return null
}
