import {
  ClipboardList, CircleCheck, Clock, TriangleAlert, CalendarDays, CircleHelp, FlaskConical, Wind, Layers,
  GraduationCap, School,
} from 'lucide-react'
import { fmtDate } from '../../lib/api'

// Top-level tabs → the backend reports shown under each (backend/src/data/reports.js)
export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'acm', label: 'ACM Inventory', title: 'ACM Inventory Reports', reports: ['acm-inventory'] },
  {
    id: 'inspections', label: 'Inspections', title: 'Inspection Reports',
    reports: ['inspection-summary', 'detailed-inspection', 'reinspection', 'bulk-samples', 'air-monitoring'],
  },
  { id: 'surveillance', label: 'Surveillance', title: 'Surveillance Reports', reports: ['surveillance'] },
  { id: 'response-actions', label: 'Response Actions', title: 'Response Action Reports', reports: [], module: 'response actions' },
  { id: 'om', label: 'O&M', title: 'O&M Reports', reports: [], module: 'operations & maintenance activities' },
  { id: 'training', label: 'Training', title: 'Training Reports', reports: ['training'] },
  { id: 'compliance', label: 'Compliance', title: 'Compliance Reports', reports: ['compliance'] },
]

export const REPORT_LABELS = {
  'inspection-summary': 'Inspection Summary',
  'detailed-inspection': 'Detailed Inspection',
  reinspection: '3-Year Reinspection',
  'bulk-samples': 'Bulk Sample Results',
  'air-monitoring': 'Air Monitoring',
  'acm-inventory': 'ACM Inventory',
  surveillance: '6-Month Surveillance',
  training: 'Training & Certifications',
  compliance: 'School Compliance',
}

export const tabForReport = (reportId) => TABS.find((t) => t.reports?.includes(reportId))

export const STAT_ICONS = {
  clipboard: ClipboardList, check: CircleCheck, clock: Clock, alert: TriangleAlert, calendar: CalendarDays,
  help: CircleHelp, flask: FlaskConical, wind: Wind, layers: Layers, graduation: GraduationCap, school: School,
}

// Report dates are calendar days ("YYYY-MM-DD"); parse as local midnight so they don't shift a day
export const fmtDay = (iso) => (iso ? fmtDate(`${iso.slice(0, 10)}T00:00:00`) : '—')

// Filters shared by every report — carried over to the CSV downloads of the sibling reports
export const COMMON_FILTERS = ['school', 'building', 'floor', 'inspector', 'from', 'to']
