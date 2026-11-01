// MOCK DATA — placeholder figures until the backend has ACM, inspection and activity
// data. Schools and buildings come from the backend API instead.

export const STATUS = {
  compliant: { label: 'In Compliance', color: 'var(--status-good)' },
  dueSoon: { label: 'Due Soon', color: 'var(--status-warning)' },
  overdue: { label: 'Out of Compliance', color: 'var(--status-critical)' },
}

// Deterministic fake compliance status per school (~68% / 17% / 15%) so the map,
// the donut and the filters stay consistent across reloads.
export function mockComplianceStatus(schoolId) {
  let h = 0
  for (const ch of schoolId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const bucket = h % 100
  if (bucket < 68) return 'compliant'
  if (bucket < 85) return 'dueSoon'
  return 'overdue'
}

export const kpis = {
  acmLocations: 2845,
  inspectionsDue: 128,
  overdueItems: 24,
  responseActions: 18,
}

export const acmByMaterial = [
  { label: 'Ceiling Tile', value: 1081 },
  { label: 'Floor Tile', value: 626 },
  { label: 'Pipe Insulation', value: 427 },
  { label: 'Duct Insulation', value: 285 },
  { label: 'Joint Compound', value: 227 },
  { label: 'Other', value: 199 },
]

export const inspectionStatus = [
  { label: 'Completed', value: 178, status: 'good' },
  { label: 'In Progress', value: 64, status: 'info' },
  { label: 'Due Soon', sublabel: '(30 days)', value: 52, status: 'warning' },
  { label: 'Overdue', value: 24, status: 'critical' },
]

export const upcomingInspections = [
  { date: '2026-11-04', school: 'Lincoln High School', building: 'Main Building', type: '3-Year Reinspection', status: 'Due Soon' },
  { date: '2026-11-07', school: 'Roosevelt High School', building: 'Building A', type: 'Annual Surveillance', status: 'Scheduled' },
  { date: '2026-11-10', school: 'West Seattle High School', building: 'Building B', type: 'Initial Inspection', status: 'Scheduled' },
  { date: '2026-11-12', school: 'Ballard High School', building: 'Main Building', type: '3-Year Reinspection', status: 'Overdue' },
  { date: '2026-11-17', school: 'Garfield High School', building: 'Building C', type: 'Periodic Surveillance', status: 'Scheduled' },
]

export const recentActivities = [
  { at: '2026-10-31T10:24', user: 'Sarah Mitchell', kind: 'inspection', activity: 'Inspection Completed', details: 'Lincoln High School - Room 101' },
  { at: '2026-10-31T09:15', user: 'Mike Johnson', kind: 'lab', activity: 'Lab Results Uploaded', details: 'Sample #LHS-2026-014' },
  { at: '2026-10-30T16:32', user: 'Jennifer Lee', kind: 'response', activity: 'Response Action Updated', details: 'Asbestos Abatement - Building B' },
  { at: '2026-10-30T11:20', user: 'David Kim', kind: 'acm', activity: 'ACM Location Added', details: 'Roosevelt High School - Room 203' },
  { at: '2026-10-29T15:10', user: 'Robert Green', kind: 'document', activity: 'Document Uploaded', details: 'Management Plan - 2026' },
]
