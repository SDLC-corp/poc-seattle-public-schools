import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  FileText, Building2, Layers, TriangleAlert, CalendarDays, CalendarCheck, ShieldCheck, Download, ChevronRight,
  Workflow, UserRound, Siren, Pencil, Ellipsis, Printer, CalendarClock,
} from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import WorkflowEditor from './WorkflowEditor'
import RegisterTab from './RegisterTab'
import RiskTab from './RiskTab'
import RolesTab from './RolesTab'
import MonitoringTab from './MonitoringTab'
import EmergencyTab from './EmergencyTab'
import ControlsTab from './ControlsTab'
import DocumentsTab from './DocumentsTab'
import { fmtDay } from '../Surveillance/survMeta'
import { request } from '../../lib/api'
import '../Users/users.css'
import '../AcmInventory/acmInventory.css'
import './managementPlan.css'

// One school for now (the district roll-out comes later)
const PLAN_SCHOOL = 'garfieldhs'

const STATUS_TONE = { Active: 'good', 'Review Overdue': 'critical', Draft: 'neutral' }

// Plan sections (Workflow is the default view)
const TABS = [
  { id: 'workflow', label: 'Workflow', icon: Workflow, element: 'review' },
  { id: 'register', label: 'Asbestos Register', icon: Layers, element: 'identify' },
  { id: 'risk', label: 'Risk Assessment', icon: TriangleAlert, element: 'assess' },
  { id: 'controls', label: 'Control Measures', icon: ShieldCheck, element: 'control' },
  { id: 'monitoring', label: 'Monitoring', icon: CalendarDays, element: 'monitor' },
  { id: 'roles', label: 'Roles & Responsibilities', icon: UserRound, element: 'train' },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'emergency', label: 'Emergency Response', icon: Siren, element: 'respond' },
]


// Flat illustration of a school building for the plan header (decorative)
function SchoolArt() {
  return (
    <svg className="mp-art" viewBox="0 0 160 110" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="mp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9ec9ec" /><stop offset="1" stopColor="#e3f0fa" /></linearGradient>
      </defs>
      <rect width="160" height="110" fill="url(#mp-sky)" />
      <rect y="88" width="160" height="22" fill="#8cbf6e" />
      <rect y="92" width="160" height="18" fill="#7aae5f" />
      <circle cx="18" cy="70" r="16" fill="#4f8f45" /><rect x="16" y="78" width="4" height="14" fill="#6b4a2d" />
      <circle cx="144" cy="72" r="14" fill="#5a9a4e" /><rect x="142" y="80" width="4" height="12" fill="#6b4a2d" />
      <rect x="30" y="46" width="100" height="44" fill="#b5523b" />
      <polygon points="24,48 80,22 136,48" fill="#5b3a2e" />
      <rect x="70" y="28" width="20" height="62" fill="#a84a35" />
      <polygon points="66,30 80,16 94,30" fill="#4a2f25" />
      {[38, 50, 104, 116].map((x) => [54, 70].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="8" height="10" fill="#f4efe2" stroke="#7a3828" strokeWidth="1" />))}
      <rect x="75" y="36" width="10" height="10" fill="#f4efe2" stroke="#7a3828" strokeWidth="1" />
      <rect x="74" y="72" width="12" height="18" fill="#3e2a22" />
      <rect x="60" y="88" width="40" height="3" fill="#d8cbb2" />
    </svg>
  )
}


function Tile({ icon: Icon, value, label, tone }) {
  return (
    <div className={`mp-tile ${tone}`}>
      <span className="mp-tile-icon"><Icon size={26} strokeWidth={1.7} /></span>
      <span className="mp-tile-text"><strong>{value ?? '—'}</strong><span>{label}</span></span>
    </div>
  )
}

function MoreMenu({ schoolId }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const go = (to) => { setOpen(false); navigate(to) }
  return (
    <div className="mp-more" ref={ref}>
      <button type="button" className="u-btn u-btn-outline mp-more-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Ellipsis size={18} /></button>
      {open && (
        <div className="ai-menu mp-more-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => go(`/schools/${schoolId}`)}><Building2 size={14} />Open school</button>
          <button type="button" role="menuitem" onClick={() => go('/operations/plans')}><FileText size={14} />O&amp;M plan details</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); window.print() }}><Printer size={14} />Print</button>
        </div>
      )}
    </div>
  )
}

export default function ManagementPlan() {
  const { tab: tabParam } = useParams()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'workflow'))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    request(`/management-plans/${PLAN_SCHOOL}`).then(setData).catch((e) => setError(e.message))
  }, [])

  if (!tab) return <Navigate to="/management-plans" replace />
  if (error) return <div className="u-banner">Couldn't load the management plan ({error}).</div>
  if (!data) return <div className="mp-loading">Loading management plan…</div>

  const { school, plan, stats } = data

  return (
    <div className="ai-page mp-page">
      <nav className="mp-crumbs" aria-label="Breadcrumb">
        <Link to="/schools/list">Schools</Link><ChevronRight size={14} />
        <Link to={`/schools/${school.id}`}>{school.name}</Link><ChevronRight size={14} />
        <span aria-current="page">Management Plan</span>
      </nav>

      <header className="mp-head">
        <SchoolArt />
        <div className="mp-head-text">
          <div className="mp-title-row">
            <h1>{plan.name}</h1>
            <Badge tone={STATUS_TONE[plan.status] ?? 'neutral'}>{plan.status}</Badge>
          </div>
          <p className="mp-meta">
            <span>Plan ID: {plan.id}</span>
            <span>Version: {plan.version}</span>
            <span>Created: {fmtDay(plan.effectiveDate)}</span>
            <span>Last Reviewed: {fmtDay(plan.lastReviewed)}</span>
            <span>Next Review: {fmtDay(plan.nextReview)}</span>
          </p>
        </div>
        <div className="mp-head-actions">
          <Link to="/operations/plans" className="u-btn u-btn-outline"><Pencil size={15} />Edit Plan</Link>
          <button type="button" className="u-btn u-btn-outline" onClick={() => window.print()}><Download size={15} />Download PDF</button>
          <MoreMenu schoolId={school.id} />
        </div>
      </header>

      <div className="mp-tiles">
        <Tile icon={Building2} value={stats.buildings} label="Buildings" tone="blue" />
        <Tile icon={Layers} value={stats.acmRecords} label="ACM Records" tone="purple" />
        <Tile icon={TriangleAlert} value={stats.highRisk} label="High Risk" tone="red" />
        <Tile icon={CalendarClock} value={stats.pendingActions} label="Pending Actions" tone="amber" />
        <Tile icon={CalendarCheck} value={stats.upcomingInspections} label="Upcoming Inspections" tone="green" />
        <Tile icon={ShieldCheck} value={`${stats.completeness}%`} label="Plan Completeness" tone="sky" />
      </div>

      <nav className="mp-tabs" aria-label="Management plan sections">
        {TABS.map((t) => (
          <Link key={t.id} to={t.id === 'workflow' ? '/management-plans' : `/management-plans/${t.id}`}
            className={t.id === tab.id ? 'active' : undefined} aria-current={t.id === tab.id ? 'page' : undefined}>
            <t.icon size={16} />{t.label}
          </Link>
        ))}
      </nav>

      {tab.id === 'documents' && <DocumentsTab schoolId={school.id} schoolName={school.name} plan={plan} />}

      {tab.id === 'controls' && <ControlsTab schoolId={school.id} />}

      {tab.id === 'emergency' && <EmergencyTab schoolId={school.id} schoolName={school.name} />}

      {tab.id === 'monitoring' && <MonitoringTab schoolId={school.id} />}

      {tab.id === 'roles' && <RolesTab schoolId={school.id} />}

      {tab.id === 'register' && <RegisterTab schoolId={school.id} schoolName={school.name} />}
      {tab.id === 'risk' && <RiskTab schoolId={school.id} nextReview={plan.nextReview} />}

      {tab.id === 'workflow' && (
        <section className="mp-card">
          <header className="mp-card-head">
            <span className="mp-card-icon plain"><Workflow size={20} /></span>
            <div><h2>Workflow</h2><p>The asbestos management workflow for this school. Add, move, connect, edit or remove steps, then save.</p></div>
          </header>
          <WorkflowEditor schoolId={school.id} />
        </section>
      )}

    </div>
  )
}
