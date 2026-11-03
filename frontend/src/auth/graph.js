// Minimal Microsoft Graph client (v1.0) using the signed-in user's access token
const BASE = 'https://graph.microsoft.com/v1.0'

export async function graph(token, path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const res = await fetch(path.startsWith('https://') ? path : `${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof Blob || body instanceof ArrayBuffer ? body : JSON.stringify(body),
  })
  if (raw) {
    if (!res.ok) throw new Error(`Microsoft Graph returned ${res.status}`)
    return res
  }
  if (res.status === 202 || res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Microsoft Graph returned ${res.status}`)
    err.status = res.status
    err.code = data?.error?.code
    throw err
  }
  return data
}

// Graph returns calendar times in UTC without a "Z" unless asked otherwise
export const graphTime = (dt) => (dt?.dateTime ? new Date(dt.timeZone === 'UTC' && !/Z$|[+-]\d\d:\d\d$/.test(dt.dateTime) ? `${dt.dateTime}Z` : dt.dateTime) : null)

export const fmtBytes = (n) => {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
