import { useEffect, useState } from 'react'
import { Plug, CircleCheck, CircleAlert } from 'lucide-react'
import Integrations from './Integrations'
import './settings.css'
import './integrations.css'

// Integrations has its own sidebar entry (formerly a Settings tab)
export default function IntegrationsPage() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="settings">
      <div className="s-head">
        <h1><Plug size={22} className="s-head-icon" />Integrations</h1>
        <p>Microsoft 365 connections for your account, and the district database</p>
      </div>
      <Integrations onToast={setToast} />
      {toast && (
        <div className={`s-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
