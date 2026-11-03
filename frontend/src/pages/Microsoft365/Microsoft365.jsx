import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { Cloud, CircleCheck, CircleAlert } from 'lucide-react'
import OverviewTab from './OverviewTab'
import MailTab from './MailTab'
import CalendarTab from './CalendarTab'
import SharePointTab from './SharePointTab'
import '../Users/users.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import '../Login/login.css'
import './microsoft365.css'

const TABS = [
  { id: 'overview', label: 'Overview', path: '/microsoft-365' },
  { id: 'mail', label: 'Outlook Mail', path: '/microsoft-365/mail' },
  { id: 'calendar', label: 'Outlook Calendar', path: '/microsoft-365/calendar' },
  { id: 'sharepoint', label: 'SharePoint', path: '/microsoft-365/sharepoint' },
]

// Microsoft 365 for the signed-in user: Entra account, Outlook mail & calendar, SharePoint (Microsoft Graph, delegated)
export default function Microsoft365() {
  const { tab: tabParam } = useParams()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'overview'))
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (!tab) return <Navigate to="/microsoft-365" replace />

  return (
    <div className="ai-page m365-page">
      <div className="ai-head">
        <h1><Cloud size={24} />Microsoft 365</h1>
      </div>
      <nav className="u-tabs ai-tabs" aria-label="Microsoft 365">
        {TABS.map((t) => <Link key={t.id} to={t.path} className={`u-tab${t.id === tab.id ? ' active' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>{t.label}</Link>)}
      </nav>

      {tab.id === 'overview' && <OverviewTab />}
      {tab.id === 'mail' && <MailTab onToast={setToast} />}
      {tab.id === 'calendar' && <CalendarTab onToast={setToast} />}
      {tab.id === 'sharepoint' && <SharePointTab onToast={setToast} />}

      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
