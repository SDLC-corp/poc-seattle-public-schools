import { useEffect, useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { Wrench, Search, RotateCcw, CircleCheck, CircleAlert } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import ExportMenu from '../Reports/ExportMenu'
import LocationFilters from '../Surveillance/LocationFilters'
import ActivityTable from './ActivityTable'
import { useActivities } from './useActivities'
import { request, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import '../Reports/reports.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import '../Inspections/inspections.css'
import './operations.css'

const NO_LOCATION = { school: '', building: '', floor: '' }

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

/**
 * Operations & Maintenance: every O&M activity in one list, with one row of filters. Activities are created from
 * an inspection (its O&M Tasks tab) and opened here to start, record and complete the work.
 */
export default function Operations() {
  const { tab: tabParam } = useParams()
  const routerLocation = useLocation()
  const [confirm, confirmDialog] = useConfirm()
  const [meta, setMeta] = useState(null)
  const [tree, setTree] = useState(null)
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)
  const [filters, setFilters] = useState({ ...NO_LOCATION, type: '', status: '', assignee: '', q: '' })
  const q = useDebounced(filters.q)
  const list = useActivities({ ...filters, q })

  useEffect(() => {
    request('/om/meta').then(setMeta).catch(() => {})
    request('/acm-inventory/tree').then(setTree).catch(() => {})
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  const start = async (r) => {
    try {
      await request(`/om/activities/${r.id}`, { method: 'PUT', body: { state: 'inProgress' } })
      setToast({ kind: 'success', text: `${r.id} started` })
      list.reload()
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }
  const del = async (r) => {
    if (!(await confirm({ title: `Delete ${r.id}?`, message: `The ${r.type.toLowerCase()} at ${r.schoolName} hasn't started yet and will be removed.`, confirmLabel: 'Delete Activity', tone: 'danger' }))) return
    try {
      await request(`/om/activities/${r.id}`, { method: 'DELETE' })
      setToast({ kind: 'success', text: `Deleted ${r.id}` })
      list.reload()
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  // The former tabs (work orders, plans, procedures, history) all land on the single list
  if (tabParam) return <Navigate to="/operations" replace />

  return (
    <div className="ai-page">
      <div className="ai-head">
        <div>
          <h1><Wrench size={24} />Operations &amp; Maintenance (O&amp;M)</h1>
          <p className="om-sub">O&amp;M activities for asbestos-containing materials. New activities are added from an inspection’s O&amp;M Tasks.</p>
        </div>
      </div>

      <Filters meta={meta} tree={tree} filters={filters} setFilters={setFilters} showAssignee onChange={list.resetPage}
        statusOptions={[{ value: '', label: 'All Statuses' }, ...Object.entries(meta?.statusLabels ?? {}).map(([value, label]) => ({ value, label }))]} />

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">O&amp;M Activities{list.data ? ` (${list.data.total})` : ''}</h2>
          <ExportMenu csvHref={`${API_BASE}/om/activities/export.csv?${list.filterQs}`} title="O&M activities" />
        </header>
        {list.error && <div className="u-banner">Couldn't load O&amp;M activities ({list.error}).</div>}
        <ActivityTable data={list.data} columns={['id', 'type', 'place', 'material', 'dueDate', 'assignee', 'status']}
          sort={list.sort} onSort={list.toggleSort} onPage={list.setPage} pageSize={list.pageSize} onPageSize={list.setPageSize}
          onStart={start} onDelete={del} />
      </section>

      {confirmDialog}
      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}