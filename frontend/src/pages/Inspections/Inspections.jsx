import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import {
  ClipboardCheck, Plus, Search, ClipboardList, CircleCheck, Clock3, TriangleAlert, CalendarDays, Hourglass, ArrowDown, ArrowUp,
  Eye, MapPin, Trash2, RotateCcw, CircleAlert, UserRoundPlus, ChevronDown, Users, Undo2, Play,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import ExportMenu from '../Reports/ExportMenu'
import Badge from '../AcmInventory/Badge'
import HistoryTab from '../AcmInventory/HistoryTab'
import LocationFilters from '../Surveillance/LocationFilters'
import RowMenu from '../Surveillance/RowMenu'
import Pager from '../Surveillance/Pager'
import AssignTab from './AssignTab'
import AssignmentsTab from './AssignmentsTab'
import CalendarTab from './CalendarTab'
import FindingsTab from './FindingsTab'
import ReassignDialog from './ReassignDialog'
import { fmtDay, floorLink, toQs } from '../Surveillance/survMeta'
import { STATUS_TONE } from './inspMeta'
import { request } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import '../Reports/reports.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import './inspections.css'

const TABS = [
  { id: 'list', label: 'Inspection List', path: '/inspections' },
  { id: 'assign', label: 'Assign Inspection', path: '/inspections/assign' },
  { id: 'my-assignments', label: 'My Assignments', path: '/inspections/my-assignments' },
  { id: 'calendar', label: 'Inspection Calendar', path: '/inspections/calendar' },
  { id: 'history', label: 'Inspection History', path: '/inspections/history' },
  { id: 'findings', label: 'Findings', path: '/inspections/findings' },
]
const NO_LOCATION = { school: '', building: '', floor: '' }
const NO_FILTERS = { type: '', status: '', q: '' }
const OPEN = ['scheduled', 'draft', 'returned']
const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : null)

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

const COLUMNS = [
  { key: 'id', label: 'Inspection ID' }, { key: 'type', label: 'Inspection Type' }, { key: 'facility', label: 'Facility' },
  { label: 'Building' }, { label: 'Floor' }, { label: 'Room / Location' }, { key: 'assignedTo', label: 'Assigned To' },
  { key: 'date', label: 'Inspection Date' }, { key: 'nextDue', label: 'Next Due Date' }, { key: 'status', label: 'Status' },
]

function ListTab({ meta, selected, setSelected, reload, onToast, onReassign }) {
  const navigate = useNavigate()
  const [confirm, confirmDialog] = useConfirm()
  const [tree, setTree] = useState(null)
  const [location, setLocation] = useState(NO_LOCATION)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sort, setSort] = useState({ key: '', dir: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [localReload, setLocalReload] = useState(0)

  useEffect(() => { request('/acm-inventory/tree').then(setTree).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(filters.q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [filters.q])

  const filterQs = toQs({ ...location, type: filters.type, status: filters.status, q: debouncedQ })
  const qs = `${filterQs}&${toQs({ sort: sort.key, dir: sort.dir, page, pageSize })}`
  useEffect(() => {
    let cancelled = false
    request(`/inspection-records?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs, reload, localReload])

  const set = (key) => (v) => { setFilters((f) => ({ ...f, [key]: v })); setPage(1) }
  const toggleStatus = (v) => set('status')(filters.status === v ? '' : v)
  const active = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) || JSON.stringify(location) !== JSON.stringify(NO_LOCATION)
  const s = data?.stats
  const sortKey = sort.key || data?.sort
  const sortDir = sort.dir || data?.dir
  const toggleSort = (key) => {
    setSort(sortKey === key ? { key, dir: sortDir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'nextDue' ? 'desc' : 'asc' })
    setPage(1)
  }
  const open = (id) => navigate(`/inspections/records/${id}`)

  // Only open inspections (not yet submitted) can be reassigned, so only those are selectable
  const selectable = data?.records.filter((r) => OPEN.includes(r.state)) ?? []
  const allOnPage = selectable.length > 0 && selectable.every((r) => selected.has(r.id))
  const toggleRow = (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const togglePage = () => setSelected((cur) => {
    const n = new Set(cur)
    selectable.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)))
    return n
  })

  const remove = async (r) => {
    const scheduled = r.state === 'scheduled'
    const ok = await confirm({
      title: scheduled ? `Cancel assignment ${r.id}?` : `Delete draft ${r.id}?`,
      message: scheduled ? `${r.assignedTo ?? 'The inspector'} will no longer be assigned this ${r.type.toLowerCase()} of ${r.materialName}.` : `The draft inspection of ${r.materialName} will be removed. This can't be undone.`,
      confirmLabel: scheduled ? 'Cancel Assignment' : 'Delete Draft', tone: 'danger',
    })
    if (!ok) return
    try {
      await request(`/inspection-records/records/${r.id}`, { method: 'DELETE' })
      onToast({ kind: 'success', text: scheduled ? `Cancelled ${r.id}` : `Deleted draft ${r.id}` })
      setSelected((cur) => { const n = new Set(cur); n.delete(r.id); return n })
      setLocalReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }

  return (
    <>
      <div className="ai-filters in-filters">
        <LocationFilters tree={tree} value={location} onChange={(v) => { setLocation(v); setPage(1) }} />
        <div className="a-field">
          <span>Inspection Type</span>
          <SearchSelect variant="field" label="Inspection type" value={filters.type} onChange={set('type')} searchable={false}
            options={[{ value: '', label: 'All Types' }, ...(meta?.types ?? []).map((t) => ({ value: t, label: t }))]} />
        </div>
        <div className="a-field">
          <span>Status</span>
          <SearchSelect variant="field" label="Status" value={filters.status} onChange={set('status')} searchable={false}
            options={[{ value: '', label: 'All Statuses' }, ...Object.entries(meta?.statuses ?? {}).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div className="a-field ai-search-field">
          <span>Search</span>
          <div className="ai-search-row">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Inspection ID, ACM ID, room or inspector…" value={filters.q}
                onChange={(e) => set('q')(e.target.value)} aria-label="Search inspections" />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!active} aria-label="Reset filters" title="Reset filters"
              onClick={() => { setFilters(NO_FILTERS); setDebouncedQ(''); setLocation(NO_LOCATION); setPage(1) }}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="a-kpis in-kpis">
        <Kpi icon={ClipboardList} value={s?.total} label="Total Inspections" tone="primary" active={!filters.status} onClick={() => set('status')('')} />
        <Kpi icon={CircleCheck} value={s?.completed} label="Completed" sub={pct(s?.completed, s?.total)} tone="good" active={filters.status === 'completed'} onClick={() => toggleStatus('completed')} />
        <Kpi icon={Clock3} value={s?.inProgress} label="In Progress" sub={s && `${pct(s.inProgress, s.total)} · ${s.returned} returned`} tone="warning" active={filters.status === 'inProgress'} onClick={() => toggleStatus('inProgress')} />
        <Kpi icon={Hourglass} value={s?.pendingReview} label="Pending Review" sub={pct(s?.pendingReview, s?.total)} tone="violet" active={filters.status === 'pendingReview'} onClick={() => toggleStatus('pendingReview')} />
        <Kpi icon={TriangleAlert} value={s?.actionRequired} label="Action Required" sub={pct(s?.actionRequired, s?.total)} tone="critical" active={filters.status === 'actionRequired'} onClick={() => toggleStatus('actionRequired')} />
        <Kpi icon={CalendarDays} value={s?.scheduled} label="Scheduled" sub={s && `${pct(s.scheduled, s.total)} · ${s.overdue} overdue`} tone="teal" active={filters.status === 'scheduled'} onClick={() => toggleStatus('scheduled')} />
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Inspections</h2>
          <div className="in-list-actions">
            {selected.size > 0 && (
              <>
                <span className="u-muted">{selected.size} selected</span>
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={onReassign}><Users size={13} />Reassign / Reschedule</button>
                <button type="button" className="sv-link-btn" onClick={() => setSelected(new Set())}>Clear</button>
              </>
            )}
            <ExportMenu csvHref={`/api/inspection-records/export.csv?${filterQs}`} title="Inspections" />
          </div>
        </header>
        {error && <div className="u-banner">Couldn't load inspections ({error}).</div>}
        <div className="u-table-wrap">
          <table className="u-table ai-table in-table">
            <thead>
              <tr>
                <th className="in-col-check">
                  <input type="checkbox" checked={allOnPage} disabled={!selectable.length} onChange={togglePage}
                    aria-label="Select all open inspections on this page" title="Only inspections that aren't submitted yet can be reassigned" />
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.label} aria-sort={c.key && sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.key ? (
                      <button type="button" className="a-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}{sortKey === c.key && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    ) : c.label}
                  </th>
                ))}
                <th className="in-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.records.map((r) => {
                const canPick = OPEN.includes(r.state)
                return (
                  <tr key={r.id} className={selected.has(r.id) ? 'selected' : undefined}>
                    <td className="in-col-check">
                      <input type="checkbox" checked={selected.has(r.id)} disabled={!canPick} onChange={() => toggleRow(r.id)}
                        aria-label={`Select ${r.id}`} title={canPick ? undefined : 'Submitted and completed inspections can’t be reassigned'} />
                    </td>
                    <td className="u-nowrap"><Link to={`/inspections/records/${r.id}`} className="sv-id">{r.id}</Link></td>
                    <td className="in-type">{r.type}</td>
                    <td className="in-wrap">{r.schoolName}</td>
                    <td className="in-wrap">{r.buildingName}</td>
                    <td className="u-nowrap">{r.floorName}</td>
                    <td className="ai-room"><strong>{r.roomNumber ? `${r.roomNumber} – ${r.roomName}` : r.roomName}</strong><small>{r.materialName}</small></td>
                    <td className="u-nowrap">{r.assignedTo ?? <span className="u-muted">Unassigned</span>}</td>
                    <td className="ai-room">
                      {r.date ? <strong className="in-plain">{fmtDay(r.date)}</strong> : <><strong className="in-plain">{fmtDay(r.scheduledDate)}</strong><small className={r.overdue ? 'sv-late' : undefined}>{r.overdue ? 'Not started — overdue' : 'Scheduled'}</small></>}
                    </td>
                    <td className="u-nowrap">{fmtDay(r.nextDue)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[r.status]}>{r.status === 'completed' && <CircleCheck size={12} />}{r.status === 'actionRequired' && <TriangleAlert size={12} />}{r.statusText}</Badge>
                      {r.state === 'returned' && <small className="in-sub-badge"><Undo2 size={11} />Returned</small>}
                    </td>
                    <td className="in-col-actions">
                      <Link to={`/inspections/records/${r.id}`} className="u-row-btn" aria-label={`View ${r.id}`} title="View"><Eye size={15} /></Link>
                      <RowMenu label={`More actions for ${r.id}`} items={[
                        r.state === 'scheduled' && { icon: Play, label: 'Start inspection', onClick: () => open(r.id) },
                        (r.state === 'draft' || r.state === 'returned') && { icon: ClipboardCheck, label: 'Continue inspection', onClick: () => open(r.id) },
                        r.state === 'submitted' && { icon: ClipboardCheck, label: 'Review inspection', onClick: () => open(r.id) },
                        canPick && { icon: Users, label: 'Reassign / reschedule', onClick: () => { setSelected(new Set([r.id])); onReassign() } },
                        { icon: Plus, label: 'New inspection of this ACM', onClick: () => navigate(`/inspections/new?material=${encodeURIComponent(r.materialId)}`) },
                        { icon: MapPin, label: 'Open room on floor plan', onClick: () => navigate(floorLink(r)) },
                        r.state === 'scheduled' && { icon: Trash2, label: 'Cancel assignment', danger: true, onClick: () => remove(r) },
                        r.state === 'draft' && { icon: Trash2, label: 'Delete draft', danger: true, onClick: () => remove(r) },
                      ]} />
                    </td>
                  </tr>
                )
              })}
              {data && !data.records.length && <tr><td colSpan={COLUMNS.length + 2} className="u-empty">No inspections match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="records" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
      {confirmDialog}
    </>
  )
}

// "Assign Inspection ▾": bulk assign by location, or reassign the selected rows
function AssignMenu({ selectedCount, onAssign, onReassign }) {
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
    <div className="rp-export" ref={ref}>
      <button type="button" className="u-btn u-btn-outline" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <UserRoundPlus size={15} />Assign Inspection<ChevronDown size={14} />
      </button>
      {open && (
        <div className="rp-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onAssign() }}>
            <UserRoundPlus size={15} /><span>Assign new inspections<small>Pick ACM by facility, building or floor</small></span>
          </button>
          <button type="button" role="menuitem" disabled={!selectedCount} onClick={() => { setOpen(false); onReassign() }}>
            <Users size={15} /><span>Reassign selected{selectedCount ? ` (${selectedCount})` : ''}<small>{selectedCount ? 'Change the inspector or date' : 'Select open inspections in the list first'}</small></span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function Inspections() {
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'list'))
  const [meta, setMeta] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [reassigning, setReassigning] = useState(false)
  const [reload, setReload] = useState(0)
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)

  useEffect(() => { request('/inspection-records/meta').then(setMeta).catch(() => {}) }, [])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (!tab) return <Navigate to="/inspections" replace />

  return (
    <div className="ai-page">
      <div className="ai-head">
        <h1><ClipboardCheck size={24} />Inspections</h1>
        <div className="ai-head-actions">
          <button type="button" className="u-btn u-btn-primary" onClick={() => navigate('/inspections/new')}><Plus size={15} />Add Inspection</button>
          <AssignMenu selectedCount={selected.size} onAssign={() => navigate('/inspections/assign')} onReassign={() => setReassigning(true)} />
        </div>
      </div>
      <nav className="u-tabs ai-tabs" aria-label="Inspection views">
        {TABS.map((t) => <Link key={t.id} to={t.path} className={`u-tab${t.id === tab.id ? ' active' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>{t.label}</Link>)}
      </nav>

      {tab.id === 'list' && <ListTab meta={meta} selected={selected} setSelected={setSelected} reload={reload} onToast={setToast} onReassign={() => setReassigning(true)} />}
      {tab.id === 'assign' && <AssignTab meta={meta} onToast={setToast} onDone={(text) => { setToast({ kind: 'success', text }); navigate('/inspections') }} />}
      {tab.id === 'my-assignments' && <AssignmentsTab meta={meta} />}
      {tab.id === 'calendar' && <CalendarTab />}
      {tab.id === 'history' && <HistoryTab module="Inspections" title="Inspection History" />}
      {tab.id === 'findings' && <FindingsTab onToast={setToast} />}

      {reassigning && (
        <ReassignDialog ids={[...selected]} meta={meta} onClose={() => setReassigning(false)}
          onDone={(res) => {
            setReassigning(false)
            setSelected(new Set())
            setReload((n) => n + 1)
            setToast({ kind: 'success', text: `Updated ${res.changed.length} inspection${res.changed.length === 1 ? '' : 's'}${res.locked.length ? ` (${res.locked.length} already submitted, left as is)` : ''}.` })
          }} />
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
