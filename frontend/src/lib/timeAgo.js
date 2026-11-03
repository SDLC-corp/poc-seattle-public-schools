// "just now", "5 min ago", "3 h ago", "2 d ago" (or "in 10 min" for future times)
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '—'
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (s < 0) {
    const m = Math.round(-s / 60)
    return m < 60 ? `in ${m} min` : `in ${Math.round(m / 60)} h`
  }
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
