// Local-calendar date helpers ("YYYY-MM-DD"; never via toISOString, which shifts to UTC)
export const pad = (n) => String(n).padStart(2, '0')
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromIso = (iso) => new Date(`${iso}T00:00:00`)
export const fmtDay = (iso) => (iso
  ? fromIso(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  : '—')
export const fmtLongDay = (iso) => fromIso(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const STATUS_LABEL = { compliant: 'Compliant', dueSoon: 'Due Soon', overdue: 'Non-Compliant' }
