import {
  ClipboardList, CircleCheck, Clock, TriangleAlert, CalendarDays, CircleHelp, FlaskConical, Wind, Layers,
  GraduationCap, School, Bell,
} from 'lucide-react'
import { fmtDate } from '../../lib/api'

// Top-level tabs (one per report type) → the backend reports shown under each (backend/src/data/reports.js)
export const TABS = [
  { id: 'overview', label: 'Overview' },
  {
    id: 'inspections', label: 'Inspections', title: 'Inspection Reports',
    reports: ['inspection-records', 'inspection-summary', 'detailed-inspection', 'bulk-samples'],
  },
  { id: 'reinspection', label: 'Reinspection', title: 'Reinspection Reports', reports: ['reinspection', 'reinspection-due'] },
  { id: 'surveillance', label: 'Surveillance', title: 'Periodic Surveillance Reports', reports: ['surveillance', 'surveillance-records'] },
  { id: 'management-plans', label: 'Management Plans', title: 'Management Plan Reports', reports: ['management-plans'] },
  { id: 'air', label: 'Air Monitoring', title: 'Air Monitoring Reports', reports: ['air-monitoring'] },
  { id: 'training', label: 'Training', title: 'Training Compliance Reports', reports: ['training'] },
  { id: 'notifications', label: 'Notifications', title: 'Notification Reports', reports: ['annual-notifications', 'notifications'] },
  { id: 'acm', label: 'ACM Inventory', title: 'ACM Inventory Reports', reports: ['acm-inventory'] },
  { id: 'om', label: 'O&M', title: 'O&M Activity Reports', reports: ['om-activities'] },
  { id: 'compliance', label: 'Compliance', title: 'Regulatory Compliance Reports', reports: ['compliance'] },
  // Document Management, as a tab here (its categories are the next part of the path)
  { id: 'documents', label: 'Documents' },
]

export const REPORT_LABELS = {
  'inspection-records': 'Inspection Records',
  'inspection-summary': 'Inspection Schedule',
  'detailed-inspection': 'Material Assessments',
  'bulk-samples': 'Bulk Sample Results',
  reinspection: '3-Year Reinspection Schedule',
  'reinspection-due': 'ACM Reinspection Due',
  surveillance: '6-Month Surveillance Schedule',
  'surveillance-records': 'Surveillance Findings',
  'management-plans': 'Management Plans',
  'air-monitoring': 'Air Monitoring',
  training: 'Training Compliance',
  'annual-notifications': 'AHERA Annual Notifications',
  notifications: 'System Notifications',
  'acm-inventory': 'ACM Inventory',
  'om-activities': 'O&M Activities',
  compliance: 'School Compliance',
}

export const tabForReport = (reportId) => TABS.find((t) => t.reports?.includes(reportId))

export const STAT_ICONS = {
  clipboard: ClipboardList, check: CircleCheck, clock: Clock, alert: TriangleAlert, calendar: CalendarDays,
  help: CircleHelp, flask: FlaskConical, wind: Wind, layers: Layers, graduation: GraduationCap, school: School, bell: Bell,
}

// Report dates are calendar days ("YYYY-MM-DD"); parse as local midnight so they don't shift a day
export const fmtDay = (iso) => (iso ? fmtDate(`${iso.slice(0, 10)}T00:00:00`) : '—')

// Filters shared by every report — carried over to the CSV downloads of the sibling reports
export const COMMON_FILTERS = ['school', 'building', 'floor', 'inspector', 'from', 'to']
