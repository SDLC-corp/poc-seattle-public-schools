import { useEffect, useState } from 'react'
import { API_BASE } from '../../lib/api'

// /test — public page showing the frontend is up and whether it can reach the backend (GET /api/test)
export default function TestPage() {
  const [backend, setBackend] = useState('Checking…')

  useEffect(() => {
    fetch(`${API_BASE}/test`)
      .then(async (r) => setBackend(r.ok ? await r.text() : `Error: HTTP ${r.status}`))
      .catch((e) => setBackend(`Error: ${e.message}`))
  }, [])

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
      <p>Frontend is working</p>
      <p>Backend: {backend}</p>
      <p style={{ color: '#666', fontSize: 13 }}>API: {API_BASE}/test</p>
    </main>
  )
}
