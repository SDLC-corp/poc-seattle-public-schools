import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Search, RotateCcw, CalendarClock, CalendarX2, CalendarDays, Clock3, Undo2, RefreshCcw, Eye, Play, ClipboardCheck, Plus, MapPin,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import LocationFilters from '../Surveillance/LocationFilters'
import RowMenu from '../Surveillance/RowMenu'
import Pager from '../Surveillance/Pager'
import { fmtDay, floorLink, toQs } from '../Surveillance/survMeta'
import { fmtTime } from './inspMeta'
import { request } from '../../lib/api'
import DueDate from '../../lib/DueDate'

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

const WINDOWS = [
  { value: '30', label: 'Next 30 days' }, { value: '90', label: 'Next 90 days' }, { value: '180', label: 'Next 6 months' },
  { value: '365', label: 'Next 12 months' }, { value: '1095', label: 'Next 3 years' },
]
const REASON_TONE = { notStarted: 'teal', inProgress: 'warning', returned: 'warning', reinspection: 'violet' }
const NO_LOCATION = { school: '', building: '', floor: '' }

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const whenText = (days) => {
  if (days < 0) return `${plural(-days, 'day')} overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `In ${plural(days, 'day')}`
}

// Upcoming / Overdue: open inspections by scheduled date, plus ACM whose 3-year reinspection is due with nothing open
export default function DueTab({ view, meta, reload, onSchedule }) {
  const navigate = useNavigate()
  const overdue = view === 'overdue'
  const [tree, setTree] = useState(null)
  const [location, setLocation] = useState(NO_LOCATION)
  const [type, setType] = useState('')
  const [within, setWithin] = useState('90')
  const [reason, setReason] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { request('/acm-inventory/tree').then(setTree).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const qs = toQs({ view, ...location, type, reason, q: debouncedQ, within: overdue ? '' : within, page, pageSize })
  useEffect(() => {
    let cancelled = false
    request(`/inspection-records/due?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs, reload])

  const pick = (v) => { setReason(reason === v ? '' : v); setPage(1) }
  const active = Boolean(type || reason || q) || JSON.stringify(location) !== JSON.stringify(NO_LOCATION) || (!overdue && within !== '90')
  const reset = () => { setLocation(NO_LOCATION); setType(''); setReason(''); setQ(''); setDebouncedQ(''); setWithin('90'); setPage(1) }
  const s = data?.stats
  const open = (id) => navigate(`/inspections/records/${id}`)

  return (
    <>
      <div className={`ai-filters in-filters${overdue ? ' in-filters-4' : ''}`}>
        <LocationFilters tree={tree} value={location} onChange={(v) => { setLocation(v); setPage(1) }} />
        <div className="a-field">
          <span>Inspection Type</span>
          <SearchSelect variant="field" label="Inspection type" value={type} onChange={(v) => { setType(v); setPage(1) }} searchable={false}
            options={[{ value: '', label: 'All Types' }, ...(meta?.types ?? []).map((t) => ({ value: t, label: t }))]} />
        </div>
        {!overdue && (
          <div className="a-field">
            <span>Due Within</span>
            <SearchSelect variant="field" label="Due within" value={within} onChange={(v) => { setWithin(v); setPage(1) }} searchable={false} options={WINDOWS} />
          </div>
        )}
        <div className="a-field ai-search-field">
          <span>Search</span>
          <div className="ai-search-row">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Inspection ID, ACM ID, room or inspector…" value={q}
                onChange={(e) => setQ(e.target.value)} aria-label={`Search ${view} inspections`} />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!active} aria-label="Reset filters" title="Reset filters" onClick={reset}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="a-kpis in-kpis in-kpis-5">
        {overdue
          ? <Kpi icon={CalendarX2} value={s?.total} label="Total Overdue" sub={s && `${s.soon} more than 30 days late`} tone="critical" active={!reason} onClick={() => pick('')} />
          : <Kpi icon={CalendarClock} value={s?.total} label="Total Upcoming" sub={s && `${s.soon} due in the next 7 days`} tone="primary" active={!reason} onClick={() => pick('')} />}
        <Kpi icon={CalendarDays} value={s?.notStarted} label="Scheduled, Not Started" tone="teal" active={reason === 'notStarted'} onClick={() => pick('notStarted')} />
        <Kpi icon={Clock3} value={s?.inProgress} label="In Progress" tone="warning" active={reason === 'inProgress'} onClick={() => pick('inProgress')} />
        <Kpi icon={Undo2} value={s?.returned} label="Returned for Changes" tone="warning" active={reason === 'returned'} onClick={() => pick('returned')} />
        <Kpi icon={RefreshCcw} value={s?.reinspection} label="3-Year Reinspection Due" sub="No inspection assigned yet" tone="violet" active={reason === 'reinspection'} onClick={() => pick('reinspection')} />
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">{overdue ? 'Overdue Inspections' : `Upcoming Inspections – ${WINDOWS.find((w) => w.value === within)?.label}`}</h2>
        </header>
        {error && <div className="u-banner">Couldn't load inspections ({error}).</div>}
        <div className="u-table-wrap">
          <table className="u-table ai-table in-table">
            <thead>
              <tr>
                <th>Due Date</th><th>Inspection</th><th>Facility</th><th>Room / Location</th><th>Assigned To</th>
                <th>Last Inspected</th><th>Status</th><th className="in-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((x) => (
                <tr key={x.key}>
                  <td className="ai-room"><strong className="in-plain"><DueDate date={x.dueDate}>{fmtDay(x.dueDate)}{x.dueTime && ` · ${fmtTime(x.dueTime)}`}</DueDate></strong><small className={x.days < 0 ? 'sv-late' : undefined}>{whenText(x.days)}</small></td>
                  <td className="ai-room">
                    {x.inspectionId ? <Link to={`/inspections/records/${x.inspectionId}`} className="sv-id">{x.inspectionId}</Link> : <span className="u-muted">Not created</span>}
                    <small>{x.type}</small>
                  </td>
                  <td className="ai-room"><strong className="in-plain">{x.schoolName}</strong><small>{x.buildingName} · {x.floorName}</small></td>
                  <td className="ai-room"><strong>{x.roomNumber ? `${x.roomNumber} – ${x.roomName}` : x.roomName}</strong><small>{x.materialName}</small></td>
                  <td className="u-nowrap">{x.assignedTo ?? <span className="u-muted">Unassigned</span>}</td>
                  <td className="u-nowrap">{x.lastInspected ? fmtDay(x.lastInspected) : <span className="u-muted">—</span>}</td>
                  <td><Badge tone={REASON_TONE[x.reason]}>{x.reasonText}</Badge></td>
                  <td className="in-col-actions">
                    {x.inspectionId
                      ? <Link to={`/inspections/records/${x.inspectionId}`} className="u-row-btn" aria-label={`View ${x.inspectionId}`} title="View"><Eye size={15} /></Link>
                      : <button type="button" className="u-row-btn" aria-label={`Create inspection of ${x.materialName}`} title="Create inspection"
                          onClick={() => navigate(`/inspections/new?material=${encodeURIComponent(x.materialId)}`)}><Plus size={15} /></button>}
                    <RowMenu label={`More actions for ${x.inspectionId ?? x.materialName}`} items={[
                      x.reason === 'notStarted' && { icon: Play, label: 'Start inspection', onClick: () => open(x.inspectionId) },
                      (x.reason === 'inProgress' || x.reason === 'returned') && { icon: ClipboardCheck, label: 'Continue inspection', onClick: () => open(x.inspectionId) },
                      x.inspectionId && { icon: CalendarClock, label: 'Schedule', onClick: () => onSchedule([x.inspectionId]) },
                      !x.inspectionId && { icon: Plus, label: 'Create reinspection', onClick: () => navigate(`/inspections/new?material=${encodeURIComponent(x.materialId)}`) },
                      { icon: MapPin, label: 'Open room on floor plan', onClick: () => navigate(floorLink(x)) },
                    ]} />
                  </td>
                </tr>
              ))}
              {data && !data.items.length && (
                <tr><td colSpan={8} className="u-empty">{overdue ? 'Nothing is overdue for these filters.' : 'Nothing is due in this period for these filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="inspections" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
    </>
  )
}
