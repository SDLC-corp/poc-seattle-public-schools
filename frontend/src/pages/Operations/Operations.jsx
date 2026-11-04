import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import {
  Wrench, Plus, ChevronDown, Search, RotateCcw, CircleCheck, CircleAlert, Clock3, TriangleAlert, FileText, ExternalLink,
  Zap, Upload, CalendarDays, FileBarChart, History as HistoryIcon, ChevronRight, CircleDot, ClipboardList, BookOpen,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import ExportMenu from '../Reports/ExportMenu'
import LocationFilters from '../Surveillance/LocationFilters'
import { fmtDay } from '../Surveillance/survMeta'
import { timeAgo } from '../../lib/timeAgo'
import ActivityTable from './ActivityTable'
import PlansTab from './PlansTab'
import ProceduresTab from './ProceduresTab'
import SopDialog from './SopDialog'
import { useActivities } from './useActivities'
import { TABS } from './omMeta'
import { request, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import '../Reports/reports.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import '../Inspections/inspections.css'
import './operations.css'

const NO_LOCATION = { school: '', building: '', floor: '' }
// "OM-2026-0269 assigned to Imani Rowland" — lower-case only the verb, never names
const eventText = (action) => (action.startsWith('Status → ') ? `updated to ${action.slice(9)}` : action.charAt(0).toLowerCase() + action.slice(1))
const pct = (n, total) => (total ? `(${((n / total) * 100).toFixed(1)}%)` : '')

function Kpi({ icon: Icon, value, label, sub, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value?.toLocaleString('en-US') ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
}

// Shared filter row: facility / building / floor, activity type, status, assignee (work orders) and search
function Filters({ meta, tree, filters, setFilters, statusOptions, showAssignee, onChange }) {
  const set = (key) => (v) => { setFilters((f) => ({ ...f, [key]: v })); onChange() }
  const active = Object.values(filters).some(Boolean)
  return (
    <div className="ai-filters om-filters">
      <LocationFilters tree={tree} value={{ school: filters.school, building: filters.building, floor: filters.floor }}
        onChange={(loc) => { setFilters((f) => ({ ...f, ...loc })); onChange() }} />
      <div className="a-field">
        <span>Activity Type</span>
        <SearchSelect variant="field" label="Activity type" value={filters.type} onChange={set('type')} searchable={false}
          options={[{ value: '', label: 'All Activity Types' }, ...(meta?.types ?? []).map((t) => ({ value: t.value, label: t.value }))]} />
      </div>
      {statusOptions && (
        <div className="a-field">
          <span>Status</span>
          <SearchSelect variant="field" label="Status" value={filters.status} onChange={set('status')} searchable={false} options={statusOptions} />
        </div>
      )}
      {showAssignee && (
        <div className="a-field">
          <span>Assigned To</span>
          <SearchSelect variant="field" label="Assigned to" value={filters.assignee} onChange={set('assignee')} searchPlaceholder="Search people…"
            options={[{ value: '', label: 'Anyone' }, ...(meta?.assignees ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        </div>
      )}
      <div className="a-field ai-search-field">
        <span>Search</span>
        <div className="ai-search-row">
          <label className="u-search">
            <Search size={15} />
            <input type="search" placeholder="Activity ID, ACM ID, room or description…" value={filters.q} onChange={(e) => set('q')(e.target.value)} aria-label="Search O&M activities" />
          </label>
          <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!active} aria-label="Reset filters" title="Reset filters"
            onClick={() => { setFilters((f) => Object.fromEntries(Object.keys(f).map((k) => [k, '']))); onChange() }}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function OverviewTab({ meta, tree, onToast, onUploadSop }) {
  const navigate = useNavigate()
  const [confirm, confirmDialog] = useConfirm()
  const [filters, setFilters] = useState({ ...NO_LOCATION, type: '', status: '', q: '' })
  const q = useDebounced(filters.q)
  const list = useActivities({ ...filters, q })
  const [plans, setPlans] = useState(null)
  const [recent, setRecent] = useState(null)

  useEffect(() => {
    request('/om/plans').then(setPlans).catch(() => {})
    request('/om/recent?limit=5').then(setRecent).catch(() => {})
  }, [])

  const s = list.data?.stats
  const pick = (st) => { setFilters((f) => ({ ...f, status: f.status === st ? '' : st })); list.resetPage() }
  const del = async (r) => {
    if (!(await confirm({ title: `Delete ${r.id}?`, message: `The ${r.type.toLowerCase()} at ${r.schoolName} hasn't started yet and will be removed.`, confirmLabel: 'Delete Activity', tone: 'danger' }))) return
    try {
      await request(`/om/activities/${r.id}`, { method: 'DELETE' })
      onToast({ kind: 'success', text: `Deleted ${r.id}` })
      list.reload()
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }
  const district = plans?.district

  return (
    <>
      <Filters meta={meta} tree={tree} filters={filters} setFilters={setFilters} onChange={list.resetPage}
        statusOptions={[{ value: '', label: 'All Statuses' }, ...Object.entries(meta?.statusLabels ?? {}).map(([value, label]) => ({ value, label }))]} />

      <div className="om-layout">
        <div className="om-main">
          <div className="a-kpis om-kpis">
            <Kpi icon={Wrench} value={s?.total} label="Total O&M Activities" sub={s && `${s.pending} pending`} tone="primary" active={!filters.status} onClick={() => pick('')} />
            <Kpi icon={CircleCheck} value={s?.completed} label="Completed" sub={pct(s?.completed, s?.total)} tone="good" active={filters.status === 'completed'} onClick={() => pick('completed')} />
            <Kpi icon={Clock3} value={s?.inProgress} label="In Progress" sub={pct(s?.inProgress, s?.total)} tone="warning" active={filters.status === 'inProgress'} onClick={() => pick('inProgress')} />
            <Kpi icon={TriangleAlert} value={s?.overdue} label="Overdue" sub={pct(s?.overdue, s?.total)} tone="critical" active={filters.status === 'overdue'} onClick={() => pick('overdue')} />
          </div>

          <section className="u-card ai-records">
            <header className="ai-group-head">
              <h2 className="ai-records-title">O&amp;M Activities</h2>
              <ExportMenu csvHref={`${API_BASE}/om/activities/export.csv?${list.filterQs}`} title="O&M activities" />
            </header>
            {list.error && <div className="u-banner">Couldn't load O&amp;M activities ({list.error}).</div>}
            <ActivityTable data={list.data} columns={['id', 'type', 'place', 'material', 'dueDate', 'assignee', 'status']}
              sort={list.sort} onSort={list.toggleSort} onPage={list.setPage} pageSize={list.pageSize} onPageSize={list.setPageSize} onDelete={del} />
          </section>
        </div>

        <aside className="om-side">
          <section className="u-card sv-side-card">
            <h3><FileText size={16} />O&amp;M Plan</h3>
            {district ? (
              <dl className="sv-dl">
                <div><dt>Current Plan</dt><dd><Link to="/operations/plans" className="sv-id">{district.name} (v{district.version})</Link></dd></div>
                <div><dt>Effective Date</dt><dd>{fmtDay(district.effectiveDate)}</dd></div>
                <div><dt>Next Review</dt><dd>{fmtDay(district.nextReview)}</dd></div>
                <div><dt>Facility Plans</dt><dd>{plans.stats.total} · {plans.stats.reviewOverdue + plans.stats.reviewDue} need review</dd></div>
              </dl>
            ) : <p className="u-muted sv-empty-line">Loading…</p>}
            <Link to="/operations/plans" className="u-btn u-btn-outline u-btn-sm om-side-btn">View Plan <ExternalLink size={13} /></Link>
          </section>

          <section className="u-card sv-side-card">
            <h3><Zap size={16} />Quick Actions</h3>
            <ul className="om-quick">
              <li><button type="button" onClick={() => navigate('/operations/activities/new')}><Plus size={15} />Create O&amp;M Activity<ChevronRight size={14} /></button></li>
              <li><button type="button" onClick={onUploadSop}><Upload size={15} />Upload O&amp;M Procedure (SOP)<ChevronRight size={14} /></button></li>
              <li><button type="button" onClick={() => navigate('/operations/work-orders')}><CalendarDays size={15} />View O&amp;M Schedule<ChevronRight size={14} /></button></li>
              <li><a href={`${API_BASE}/om/activities/export.csv?${list.filterQs}`} download><FileBarChart size={15} />Generate O&amp;M Report (CSV)<ChevronRight size={14} /></a></li>
            </ul>
          </section>

          <section className="u-card sv-side-card">
            <h3><HistoryIcon size={16} />Recent O&amp;M Activity</h3>
            {!recent && <p className="u-muted sv-empty-line">Loading…</p>}
            <ul className="om-recent">
              {recent?.map((e) => (
                <li key={`${e.activityId}-${e.at}`}>
                  <span className={`om-recent-dot ${e.action === 'Completed' ? 'ok' : e.action.startsWith('Status') ? 'warn' : ''}`}>
                    {e.action === 'Completed' ? <CircleCheck size={14} /> : <CircleDot size={14} />}
                  </span>
                  <span>
                    <Link to={`/operations/activities/${e.activityId}`} className="sv-id">{e.activityId}</Link> {eventText(e.action)}
                    <small>{timeAgo(e.at)} · {e.by}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {confirmDialog}
    </>
  )
}

// Open work (pending / in progress / overdue), soonest due first
function WorkOrdersTab({ meta, tree, onToast }) {
  const [filters, setFilters] = useState({ ...NO_LOCATION, type: '', assignee: '', q: '' })
  const q = useDebounced(filters.q)
  const list = useActivities({ ...filters, q }, { status: 'open' }, { key: 'dueDate', dir: 'asc' })
  const start = async (r) => {
    try {
      await request(`/om/activities/${r.id}`, { method: 'PUT', body: { state: 'inProgress' } })
      onToast({ kind: 'success', text: `${r.id} started` })
      list.reload()
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }
  const s = list.data?.stats
  return (
    <>
      <Filters meta={meta} tree={tree} filters={filters} setFilters={setFilters} showAssignee onChange={list.resetPage} />
      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Open Work Orders</h2>
          <span className="u-muted om-head-note">
            {s ? `${s.overdue} overdue · ${s.inProgress} in progress · ${s.pending} pending` : ''}
          </span>
        </header>
        <ActivityTable data={list.data} columns={['dueDate', 'id', 'type', 'place', 'material', 'assignee', 'status']}
          sort={list.sort} onSort={list.toggleSort} onPage={list.setPage} pageSize={list.pageSize} onPageSize={list.setPageSize} onStart={start}
          empty="No open work orders — everything is done." />
      </section>
    </>
  )
}

// Completed work kept as the maintenance record
function HistoryTab({ meta, tree }) {
  const [filters, setFilters] = useState({ ...NO_LOCATION, type: '', assignee: '', q: '' })
  const q = useDebounced(filters.q)
  const list = useActivities({ ...filters, q }, { status: 'completed' }, { key: 'completedAt', dir: 'desc' })
  return (
    <>
      <Filters meta={meta} tree={tree} filters={filters} setFilters={setFilters} showAssignee onChange={list.resetPage} />
      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Completed O&amp;M Work</h2>
          <div className="om-head-actions">
            <Link to="/audit" className="ai-link">Full audit log <ExternalLink size={12} /></Link>
            <ExportMenu csvHref={`${API_BASE}/om/activities/export.csv?${list.filterQs}`} title="O&M history" />
          </div>
        </header>
        <ActivityTable data={list.data} columns={['completedAt', 'id', 'type', 'place', 'material', 'assignee', 'status']}
          sort={list.sort} onSort={list.toggleSort} onPage={list.setPage} pageSize={list.pageSize} onPageSize={list.setPageSize}
          empty="No completed O&M work matches these filters." />
      </section>
    </>
  )
}

// "Create O&M Activity ▾" split button
function CreateMenu({ onUploadSop }) {
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
  return (
    <div className="om-split rp-export" ref={ref}>
      <button type="button" className="u-btn u-btn-primary" onClick={() => navigate('/operations/activities/new')}><Plus size={15} />Create O&amp;M Activity</button>
      <button type="button" className="u-btn u-btn-primary om-split-more" aria-haspopup="menu" aria-expanded={open} aria-label="More create options" onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="rp-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/operations/activities/new') }}>
            <ClipboardList size={15} /><span>O&amp;M activity / work order<small>Pick the ACM, assign and schedule</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onUploadSop() }}>
            <BookOpen size={15} /><span>Procedure (SOP)<small>Upload an asbestos-safe work procedure</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/operations/plans') }}>
            <FileText size={15} /><span>Update O&amp;M plan<small>District or facility plan details</small></span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function Operations() {
  const { tab: tabParam } = useParams()
  const routerLocation = useLocation()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'overview'))
  const [meta, setMeta] = useState(null)
  const [tree, setTree] = useState(null)
  const [sopOpen, setSopOpen] = useState(false)
  const [sopVersion, setSopVersion] = useState(0)
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)

  useEffect(() => {
    request('/om/meta').then(setMeta).catch(() => {})
    request('/acm-inventory/tree').then(setTree).catch(() => {})
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (!tab) return <Navigate to="/operations" replace />

  return (
    <div className="ai-page">
      <div className="ai-head">
        <div>
          <h1><Wrench size={24} />Operations &amp; Maintenance (O&amp;M)</h1>
          <p className="om-sub">Manage routine maintenance, work practices, and disturbance control for asbestos-containing materials.</p>
        </div>
        <div className="ai-head-actions"><CreateMenu onUploadSop={() => setSopOpen(true)} /></div>
      </div>
      <nav className="u-tabs ai-tabs" aria-label="O&M views">
        {TABS.map((t) => <Link key={t.id} to={t.path} className={`u-tab${t.id === tab.id ? ' active' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>{t.label}</Link>)}
      </nav>

      {tab.id === 'overview' && <OverviewTab meta={meta} tree={tree} onToast={setToast} onUploadSop={() => setSopOpen(true)} />}
      {tab.id === 'work-orders' && <WorkOrdersTab meta={meta} tree={tree} onToast={setToast} />}
      {tab.id === 'plans' && <PlansTab onToast={setToast} />}
      {tab.id === 'procedures' && <ProceduresTab key={sopVersion} onToast={setToast} onUpload={() => setSopOpen(true)} />}
      {tab.id === 'history' && <HistoryTab meta={meta} tree={tree} />}

      {sopOpen && (
        <SopDialog categories={meta?.sopCategories ?? []} onClose={() => setSopOpen(false)}
          onSaved={(sop) => { setSopOpen(false); setSopVersion((n) => n + 1); setToast({ kind: 'success', text: `Uploaded ${sop.id} “${sop.title}”` }) }} />
      )}
      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
