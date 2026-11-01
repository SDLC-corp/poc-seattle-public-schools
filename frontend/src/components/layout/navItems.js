import {
  House, School, Layers, ClipboardCheck, FileText, FlaskConical, ScanEye,
  TriangleAlert, Wrench, Wind, HardHat, ListChecks, Bell, FolderOpen,
  ChartLine, UsersRound, History, Settings,
} from 'lucide-react'

// Child items are placeholders until the real pages are defined.
export const mainNav = [
  { id: 'dashboard', label: 'Dashboard', icon: House },
  {
    id: 'schools', label: 'Schools & Facilities', icon: School,
    children: [
      { id: 'schools-list', label: 'Schools' },
      { id: 'buildings', label: 'Buildings' },
      { id: 'rooms', label: 'Rooms & Floor Plans' },
    ],
  },
  {
    id: 'acm', label: 'ACM Inventory', icon: Layers,
    children: [
      { id: 'acm-locations', label: 'ACM Locations' },
      { id: 'acm-materials', label: 'Material Types' },
    ],
  },
  {
    id: 'inspections', label: 'Inspections', icon: ClipboardCheck,
    children: [
      { id: 'inspections-upcoming', label: 'Upcoming' },
      { id: 'inspections-history', label: 'History' },
    ],
  },
  { id: 'management-plans', label: 'Management Plans', icon: FileText },
  {
    id: 'sampling', label: 'Sampling & Lab Results', icon: FlaskConical,
    children: [
      { id: 'samples', label: 'Samples' },
      { id: 'lab-results', label: 'Lab Results' },
    ],
  },
  { id: 'surveillance', label: 'Surveillance', icon: ScanEye },
  { id: 'response-actions', label: 'Response Actions', icon: TriangleAlert },
  { id: 'operations', label: 'Operations & Maintenance', icon: Wrench },
  { id: 'air-monitoring', label: 'Air Monitoring', icon: Wind },
  { id: 'contractors', label: 'Contractors & Training', icon: HardHat },
  { id: 'compliance', label: 'Compliance Tracking', icon: ListChecks },
  { id: 'notifications', label: 'Notifications', icon: Bell, badge: 5 },
  { id: 'documents', label: 'Document Management', icon: FolderOpen },
  {
    id: 'reports', label: 'Reports & Analytics', icon: ChartLine,
    children: [
      { id: 'reports-compliance', label: 'Compliance Reports' },
      { id: 'reports-analytics', label: 'Analytics' },
    ],
  },
]

export const adminNav = [
  { id: 'users', label: 'User & Role Management', icon: UsersRound },
  { id: 'audit', label: 'Audit Trail', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
]
