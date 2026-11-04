import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import {
  ShieldCheck, Plus, Search, ClipboardList, CircleCheck, TriangleAlert, OctagonAlert, CalendarClock, ArrowDown, ArrowUp,
  Eye, MapPin, RotateCcw, Trash2, CircleAlert,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import ExportMenu from '../Reports/ExportMenu'
import Badge from '../AcmInventory/Badge'
import HistoryTab from '../AcmInventory/HistoryTab'
import LocationFilters from './LocationFilters'
import RowMenu from './RowMenu'
import Pager from './Pager'
import ScheduleTab from './ScheduleTab'
import FindingsTab from './FindingsTab'
import { TABS, CONDITION_TONE, STATUS, fmtDay, shortAcm, floorLink, toQs } from './survMeta'
import { request, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import '../Reports/reports.css'
import '../AcmInventory/acmInventory.css'
import './surveillance.css'

const pct = (v) => (v == null ? null : `${v}%`)
const NO_LOCATION = { school: '', building: '', floor: '' }

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
  { key: 'id', label: 'Surveillance ID' },
  { label: 'ACM ID' },
  { key: 'material', label: 'Material' },
  { key: 'facility', label: 'Facility' },
  { label: 'Floor / Room' },
  { key: 'date', label: 'Date' },
  { key: 'condition', label: 'Condition' },
  { key: 'nextDue', label: 'Next Due' },
  { key: 'status', label: 'Status' },
]

function ListTab({ tree, location, setLocation, onToast }) {
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const [confirm, confirmDialog] = useConfirm()
  // "View All" on a record's history arrives with the material's ID as the search
  const [filters, setFilters] = useState(() => ({ condition: '', status: '', q: routerLocation.state?.q ?? '' }))
  const [debouncedQ, setDebouncedQ] = useState(() => routerLocation.state?.q ?? '')
  const [sort, setSort] = useState({ key: '', dir: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(filters.q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [filters.q])

  const filterQs = toQs({ ...location, condition: filters.condition, status: filters.status, q: debouncedQ })
  const qs = `${filterQs}&${toQs({ sort: sort.key, dir: sort.dir, page, pageSize })}`
  useEffect(() => {
    let cancelled = false
    request(`/surveillance?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs, reload])

  const set = (key) => (v) => { setFilters((f) => ({ ...f, [key]: v })); setPage(1) }
  const toggle = (key, v) => set(key)(filters[key] === v ? '' : v)
  const active = JSON.stringify(filters) !== JSON.stringify({ condition: '', status: '', q: '' }) || JSON.stringify(location) !== JSON.stringify(NO_LOCATION)
  const s = data?.stats
  const sortKey = sort.key || data?.sort
  const sortDir = sort.dir || data?.dir
  const toggleSort = (key) => {
    setSort(sortKey === key ? { key, dir: sortDir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' ? 'desc' : 'asc' })
    setPage(1)
  }

  const deleteDraft = async (r) => {
    if (!(await confirm({ title: `Delete draft ${r.id}?`, message: `The draft surveillance of ${r.materialName} will be removed. This can't be undone.`, confirmLabel: 'Delete Draft', tone: 'danger' }))) return
    try {
      await request(`/surveillance/records/${r.id}`, { method: 'DELETE' })
      onToast({ kind: 'success', text: `Deleted draft ${r.id}` })
      setReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }

  return (
    <>
      <div className="ai-filters sv-filters">
        <LocationFilters tree={tree} value={location} onChange={(v) => { setLocation(v); setPage(1) }} />
        <div className="a-field">
          <span>Condition</span>
          <SearchSelect variant="field" label="Condition" value={filters.condition} onChange={set('condition')} searchable={false}
            options={[{ value: '', label: 'All Conditions' }, ...Object.keys(CONDITION_TONE).filter((c) => c !== 'Not Assessed').map((c) => ({ value: c, label: c }))]} />
        </div>
        <div className="a-field">
          <span>Status</span>
          <SearchSelect variant="field" label="Status" value={filters.status} onChange={set('status')} searchable={false}
            options={[{ value: '', label: 'All Statuses' }, ...Object.entries(STATUS).map(([value, x]) => ({ value, label: x.label }))]} />
        </div>
        <div className="a-field ai-search-field">
          <span>Search</span>
          <div className="ai-search-row">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Surveillance ID, ACM ID, room or material…" value={filters.q}
                onChange={(e) => set('q')(e.target.value)} aria-label="Search surveillance records" />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!active} aria-label="Reset filters" title="Reset filters"
              onClick={() => { setFilters({ condition: '', status: '', q: '' }); setDebouncedQ(''); setLocation(NO_LOCATION); setPage(1) }}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="a-kpis ai-kpis">
        <Kpi icon={ClipboardList} value={s?.total} label="Total Surveillance" tone="primary"
          sub={s && `${s.actionRequired.toLocaleString('en-US')} need action${s.drafts ? ` · ${s.drafts} draft` : ''}`}
          active={!filters.condition && !filters.status} onClick={() => setFilters((f) => ({ ...f, condition: '', status: '' }))} />
        <Kpi icon={CircleCheck} value={s?.good} label="Good" sub={pct(s?.goodPct)} tone="good"
          active={filters.condition === 'Good'} onClick={() => toggle('condition', 'Good')} />
        <Kpi icon={TriangleAlert} value={s?.damaged} label="Damaged" sub={pct(s?.damagedPct)} tone="warning"
          active={filters.condition === 'Damaged'} onClick={() => toggle('condition', 'Damaged')} />
        <Kpi icon={OctagonAlert} value={s?.significantlyDamaged} label="Significantly Damaged" sub={pct(s?.significantlyDamagedPct)} tone="critical"
          active={filters.condition === 'Significantly Damaged'} onClick={() => toggle('condition', 'Significantly Damaged')} />
        <Kpi icon={CalendarClock} value={s?.dueNext30} label="Due in Next 30 Days" tone="violet"
          sub={s && `${s.overdue.toLocaleString('en-US')} overdue`} active={false} onClick={() => navigate('/surveillance/schedule')} />
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Surveillance Records</h2>
          <ExportMenu csvHref={`${API_BASE}/surveillance/export.csv?${filterQs}`} title="Surveillance records" />
        </header>
        {error && <div className="u-banner">Couldn't load surveillance records ({error}).</div>}
        <div className="u-table-wrap">
          <table className="u-table ai-table sv-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.label} aria-sort={c.key && sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.key ? (
                      <button type="button" className="a-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}{sortKey === c.key && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    ) : c.label}
                  </th>
                ))}
                <th className="ai-col-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.records.map((r) => (
                <tr key={r.id} className="ai-clickable" tabIndex={0} onClick={() => navigate(`/surveillance/records/${r.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/surveillance/records/${r.id}`) }}>
                  <td className="u-nowrap"><Link to={`/surveillance/records/${r.id}`} className="sv-id" onClick={(e) => e.stopPropagation()}>{r.id}</Link></td>
                  <td className="ai-id" title={r.materialId}>{shortAcm(r.materialId, r.schoolId)}</td>
                  <td className="ai-material"><strong>{r.materialName}</strong><small>{r.materialType}</small></td>
                  <td className="ai-room"><strong>{r.schoolName}</strong><small>{r.buildingName}</small></td>
                  <td className="ai-room"><strong>{r.roomNumber ? `${r.roomNumber} – ${r.roomName}` : r.roomName}</strong><small>{r.floorName}</small></td>
                  <td className="u-nowrap">{fmtDay(r.date)}</td>
                  <td>{r.condition ? <Badge tone={CONDITION_TONE[r.condition]}>{r.condition}</Badge> : <span className="u-muted">—</span>}</td>
                  <td className="u-nowrap">{fmtDay(r.nextDue)}</td>
                  <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                  <td className="ai-col-actions">
                    <RowMenu label={`Actions for ${r.id}`} items={[
                      { icon: Eye, label: r.status === 'draft' ? 'Continue draft' : 'View / edit record', onClick: () => navigate(`/surveillance/records/${r.id}`) },
                      { icon: Plus, label: 'Record new surveillance', onClick: () => navigate(`/surveillance/new?material=${encodeURIComponent(r.materialId)}`) },
                      { icon: MapPin, label: 'Open room on floor plan', onClick: () => navigate(floorLink(r)) },
                      r.status === 'draft' && { icon: Trash2, label: 'Delete draft', danger: true, onClick: () => deleteDraft(r) },
                    ]} />
                  </td>
                </tr>
              ))}
              {data && !data.records.length && <tr><td colSpan={COLUMNS.length + 1} className="u-empty">No surveillance records match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="records" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
      {confirmDialog}
    </>
  )
}

export default function Surveillance() {
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'list'))
  const [tree, setTree] = useState(null)
  // A link can open the list on one school / building (state.place, e.g. from the map)
  const [location, setLocation] = useState(() => ({ ...NO_LOCATION, school: routerLocation.state?.place?.school ?? '', building: routerLocation.state?.place?.building ?? '' }))
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)

  useEffect(() => { request('/acm-inventory/tree?status=').then(setTree).catch(() => {}) }, [])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (!tab) return <Navigate to="/surveillance" replace />

  return (
    <div className="ai-page sv-page">
      <div className="ai-head">
        <h1><ShieldCheck size={24} />Surveillance</h1>
        <div className="ai-head-actions">
          <button type="button" className="u-btn u-btn-primary" onClick={() => navigate('/surveillance/new')}><Plus size={15} />Record Surveillance</button>
        </div>
      </div>

      <nav className="u-tabs ai-tabs" aria-label="Surveillance views">
        {TABS.map((t) => (
          <Link key={t.id} to={t.path} className={`u-tab${t.id === tab.id ? ' active' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>

      {tab.id === 'list' && <ListTab tree={tree} location={location} setLocation={setLocation} onToast={setToast} />}
      {tab.id === 'schedule' && <ScheduleTab tree={tree} location={location} setLocation={setLocation} />}
      {tab.id === 'findings' && <FindingsTab tree={tree} location={location} setLocation={setLocation} onToast={setToast} />}
      {tab.id === 'history' && <HistoryTab module="Surveillance" title="Surveillance History" />}

      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
