import { Navigate, useNavigate, useParams, Link } from 'react-router'
import { Inbox } from 'lucide-react'
import ReportView from './ReportView'
import ReportsOverview from './ReportsOverview'
import { TABS } from './reportMeta'
import Documents from '../Documents/Documents'
import '../Users/users.css'
import '../Audit/audit.css'
import './reports.css'

// /reports/:tab/:report — tab = area (Inspections, Training…), report = the sub-tab inside it
export default function Reports() {
  const { tab: tabParam, report: reportParam } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'overview'))
  if (!tab) return <Navigate to="/reports" replace />
  const isDocs = tab.id === 'documents'
  const reportId = tab.reports?.includes(reportParam) ? reportParam : tab.reports?.[0]
  if (!isDocs && reportParam && reportParam !== reportId) return <Navigate to={`/reports/${tab.id}`} replace />

  return (
    <div className="rp-page">
      <h1 className="rp-title">Reports, Analytics &amp; Documents</h1>

      <nav className="u-tabs rp-tabs" aria-label="Report areas">
        {TABS.map((t) => (
          <Link key={t.id} to={t.id === 'overview' ? '/reports' : `/reports/${t.id}`}
            className={`u-tab${t.id === tab.id ? ' active' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab.id === 'overview' && <ReportsOverview />}
      {isDocs && <Documents category={reportParam ?? ''} />}

      {tab.reports && !tab.reports.length && (
        <div className="u-card rp-empty">
          <Inbox size={30} />
          <strong>No {tab.module} recorded yet</strong>
          <span>{tab.title} will appear here once {tab.module} are logged in the system.</span>
        </div>
      )}

      {reportId && (
        <ReportView key={reportId} tab={tab} reportId={reportId}
          onSelectReport={(id) => navigate(id === tab.reports[0] ? `/reports/${tab.id}` : `/reports/${tab.id}/${id}`)} />
      )}
    </div>
  )
}
