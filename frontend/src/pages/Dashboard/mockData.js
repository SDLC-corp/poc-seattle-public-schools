// School compliance status labels/colours. Statuses come from the backend (the inspection schedule); the
// deterministic placeholder below is only used if a school arrives without one.

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
