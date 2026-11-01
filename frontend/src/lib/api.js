// Shared fetch + formatting helpers. Errors carry the server's per-field messages in `fields`.
export async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.fields = body.fields
    err.status = res.status
    throw err
  }
  return body
}

export const initials = (name) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Never')

export const fmtDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  : '—')
