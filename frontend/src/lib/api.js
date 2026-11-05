// Backend base URL, e.g. https://api.example.org/api. Unset: same-origin /api (Vite proxies it in dev).
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

/**
 * A file address the backend hands out ("/api/floors/…/plan") as a URL the browser can load. With the API on another
 * host (VITE_API_BASE_URL, e.g. the backend's own Vercel project) a bare "/api/…" would hit the frontend's site, which
 * answers with the app page instead of the file; locally the dev server proxies /api, so it's left as is.
 */
export const apiFileUrl = (path) => (typeof path === 'string' && path.startsWith('/api/') ? `${API_BASE.replace(/\/api$/, '')}${path}` : path)

// The signed-in user's token for this API (set by the auth provider); the backend credits actions to them
let apiTokenProvider = null
export const setApiTokenProvider = (fn) => { apiTokenProvider = fn }

// { Authorization } for the signed-in user, or {} (demo mode, or no token available)
export async function authHeaders() {
  if (!apiTokenProvider) return {}
  try {
    const token = await apiTokenProvider()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

// Shared fetch + formatting helpers. Errors carry the server's per-field messages in `fields`.
export async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    // Content-Type only when there's a body: on a plain GET it would make the browser send an extra CORS
    // "preflight" request first whenever the API is on another host (the deployed setup)
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()), ...options.headers },
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

// Raw file upload (body = the file) with metadata in the query string; same error shape as request()
export async function uploadFile(path, file, params = {}) {
  const qs = new URLSearchParams({ name: file.name, ...params }).toString()
  const res = await fetch(`${API_BASE}${path}?${qs}`, {
    method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', ...(await authHeaders()) }, body: file,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.fields = body.fields
    err.status = res.status
    throw err
  }
  return body
}

export const initials =(name) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Never')

export const fmtDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  : '—')
