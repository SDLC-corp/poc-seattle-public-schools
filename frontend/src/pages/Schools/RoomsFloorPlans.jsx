import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  Map as MapIcon, Layers, DoorOpen, MapPin, TriangleAlert, Image as ImageIcon, Search, RotateCcw,
  ChevronLeft, ChevronRight, Info,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { AcmBadge } from './BuildingParts'
import FloorPanel from './FloorPanel'
import { ACM_STATUSES, ACM_CONDITIONS, fmtNum } from './buildingUtils'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'

const PAGE_SIZE = 15
const CONDITION_CLASS = { Good: 'good', Damaged: 'damaged', 'Significantly Damaged': 'severe', 'Not assessed': 'na' }
const isDamaged = (l) => l.condition === 'Damaged' || l.condition === 'Significantly Damaged'

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{fmtNum(value)}</strong><span className="kpi-label">{label}</span></span>
    </button>
  )
}

// District-wide floors and labelled rooms; a row opens that floor's plan on the right
export default function RoomsFloorPlans() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const school = params.get('school') ?? ''
  const view = params.get('view') === 'rooms' ? 'rooms' : 'floors'

  const [floors, setFloors] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [acm, setAcm] = useState('')
  const [condition, setCondition] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null) // { floorId, labelId }
  const [detail, setDetail] = useState(null) // full floor (with layout) for the panel

  useEffect(() => {
    request('/floors').then((d) => setFloors(d.floors)).catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!selected) return undefined
    let cancelled = false
    request(`/floors/${selected.floorId}`).then((f) => { if (!cancelled) setDetail(f) }).catch(() => {})
    return () => { cancelled = true }
  }, [selected])

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
    setPage(1)
  }
  const showRooms = (filters = {}) => {
    const next = new URLSearchParams(params)
    next.set('view', 'rooms')
    setParams(next, { replace: true })
    setAcm(filters.acm ?? '')
    setCondition(filters.condition ?? '')
    setPage(1)
  }
  const closePanel = useCallback(() => setSelected(null), [])

  const schoolOptions = useMemo(() => {
    const names = new Map((floors ?? []).map((f) => [f.schoolId, f.schoolName]))
    return [...names].sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? '')).map(([value, label]) => ({ value, label }))
  }, [floors])

  const scoped = useMemo(() => (floors ?? []).filter((f) => !school || f.schoolId === school), [floors, school])
  const labels = useMemo(() => scoped.flatMap((floor) => floor.labels.map((label) => ({ floor, label }))), [scoped])

  const term = query.trim().toLowerCase()
  const floorRows = scoped.filter((f) => (!acm || f.acmStatus === acm)
    && (!term || [f.name, f.buildingName, f.buildingCode, f.schoolName].some((v) => v?.toLowerCase().includes(term))))
  const roomRows = labels.filter(({ floor, label: l }) => (!acm || l.acmStatus === acm)
    && (!condition || (condition === 'damaged' ? isDamaged(l) : l.condition === condition))
    && (!term || [l.name, l.material, floor.name, floor.buildingName, floor.schoolName].some((v) => v?.toLowerCase().includes(term))))
  const rows = view === 'rooms' ? roomRows : floorRows
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const filtersActive = query || acm || condition || school

  const panelFloor = detail && selected && detail.id === selected.floorId ? detail : null
  const open = (floorId, labelId) => setSelected({ floorId, labelId })

  return (
    <div className={`schools-page${panelFloor ? ' details-open fp-open' : ''}`}>
      <div className="sch-main">
        <div className="c-head">
          <div>
            <h1><MapIcon size={22} />Rooms &amp; Floor Plans</h1>
            <p>Every floor and labelled room across the district. Open a row to see it on the floor plan.</p>
          </div>
        </div>

        {error && <div className="u-banner">Couldn't load floors ({error}).</div>}

        <div className="b-kpis rf-kpis">
          <Kpi icon={Layers} value={floors && scoped.length} label="Floors" tone="primary" active={view === 'floors'} onClick={() => setParam('view', '')} />
          <Kpi icon={DoorOpen} value={floors && scoped.reduce((n, f) => n + f.rooms, 0)} label="Total Rooms" tone="teal" active={false} onClick={() => setParam('view', '')} />
          <Kpi icon={MapPin} value={floors && labels.length} label="Labelled Rooms" tone="violet" active={view === 'rooms' && !acm && !condition} onClick={() => showRooms()} />
          <Kpi icon={TriangleAlert} value={floors && labels.filter((r) => r.label.acmStatus !== 'No ACM').length} label="ACM Locations" tone="warning"
            active={view === 'rooms' && acm === 'ACM Present'} onClick={() => showRooms({ acm: 'ACM Present' })} />
          <Kpi icon={TriangleAlert} value={floors && labels.filter((r) => isDamaged(r.label)).length} label="Damaged ACM" tone="critical"
            active={view === 'rooms' && condition === 'damaged'} onClick={() => showRooms({ condition: 'damaged' })} />
          <Kpi icon={ImageIcon} value={floors && scoped.filter((f) => f.planImage).length} label="Uploaded Plans" tone="good" active={false} onClick={() => setParam('view', '')} />
        </div>

        <nav className="u-tabs" role="tablist" aria-label="Views">
          <button type="button" role="tab" aria-selected={view === 'floors'} className={`u-tab${view === 'floors' ? ' active' : ''}`}
            onClick={() => { setParam('view', ''); setCondition('') }}>Floors</button>
          <button type="button" role="tab" aria-selected={view === 'rooms'} className={`u-tab${view === 'rooms' ? ' active' : ''}`}
            onClick={() => setParam('view', 'rooms')}>Labelled Rooms</button>
        </nav>

        <section className="u-card">
          <div className={`b-filters${view === 'rooms' ? ' rf-filters-rooms' : ''}`}>
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder={view === 'rooms' ? 'Search room, material, building or school…' : 'Search floor, building or school…'}
                value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Search" />
            </label>
            <SearchSelect variant="field" label="School" value={school} onChange={(v) => setParam('school', v)} searchPlaceholder="Search schools…"
              options={[{ value: '', label: 'All Schools' }, ...schoolOptions]} />
            <SearchSelect variant="field" label="ACM status" value={acm} onChange={(v) => { setAcm(v); setPage(1) }} searchable={false}
              options={[{ value: '', label: 'All ACM Statuses' }, ...ACM_STATUSES.map((s) => ({ value: s, label: s }))]} />
            {view === 'rooms' && (
              <SearchSelect variant="field" label="Condition" value={condition} onChange={(v) => { setCondition(v); setPage(1) }} searchable={false}
                options={[{ value: '', label: 'All Conditions' }, { value: 'damaged', label: 'Damaged (any)' }, ...ACM_CONDITIONS.map((c) => ({ value: c, label: c }))]} />
            )}
            <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive}
              onClick={() => { setQuery(''); setAcm(''); setCondition(''); setParam('school', '') }}><RotateCcw size={14} />Reset</button>
          </div>

          <div className="u-table-wrap">
            {view === 'floors' ? (
              <table className="u-table c-table b-table">
                <thead>
                  <tr><th>School / Building</th><th>Floor</th><th className="c-num">Rooms</th><th className="c-num">ACM Rooms</th>
                    <th className="c-num b-col-acmrooms">Labelled</th><th className="b-col-floor">Plan</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {visible.map((f) => (
                    <tr key={f.id} className={f.id === selected?.floorId ? 'selected' : ''} tabIndex={0}
                      onClick={() => open(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(f.id) }}>
                      <td>
                        <Link className="b-link" to={`/schools/${f.schoolId}/buildings/${f.buildingId}/floors`} onClick={(e) => e.stopPropagation()}>{f.buildingName}</Link>
                        <small className="p-sub">{f.schoolName} · {f.buildingCode}</small>
                      </td>
                      <td className="u-nowrap"><span className="bd-fnum">{f.number}</span> {f.name}</td>
                      <td className="c-num">{fmtNum(f.rooms)}</td>
                      <td className="c-num">{fmtNum(f.acmRooms)}</td>
                      <td className="c-num b-col-acmrooms">{f.labels.length}</td>
                      <td className="b-col-floor">{f.planImage ? <span className="rf-plan up">Uploaded</span> : <span className="rf-plan">Sample</span>}</td>
                      <td><AcmBadge status={f.acmStatus} /></td>
                    </tr>
                  ))}
                  {floors && !visible.length && <tr><td colSpan={7} className="u-empty">No floors match these filters.</td></tr>}
                  {!floors && !error && <tr><td colSpan={7} className="u-empty">Loading…</td></tr>}
                </tbody>
              </table>
            ) : (
              <table className="u-table c-table b-table">
                <thead>
                  <tr><th>Room</th><th>Location</th><th>ACM Status</th><th className="b-col-floor">Material</th><th>Condition</th></tr>
                </thead>
                <tbody>
                  {visible.map(({ floor: f, label: l }) => (
                    <tr key={`${f.id}-${l.id}`} className={f.id === selected?.floorId && l.id === selected?.labelId ? 'selected' : ''} tabIndex={0}
                      onClick={() => open(f.id, l.id)} onKeyDown={(e) => { if (e.key === 'Enter') open(f.id, l.id) }}>
                      <td><strong>{l.name}</strong></td>
                      <td>{f.buildingName} · {f.name}<small className="p-sub">{f.schoolName}</small></td>
                      <td><AcmBadge status={l.acmStatus} /></td>
                      <td className="b-col-floor">{l.material || '—'}</td>
                      <td><span className={`fp-cond ${CONDITION_CLASS[l.condition] ?? 'na'}`}>{l.condition}</span></td>
                    </tr>
                  ))}
                  {floors && !visible.length && <tr><td colSpan={5} className="u-empty">No labelled rooms match these filters.</td></tr>}
                  {!floors && !error && <tr><td colSpan={5} className="u-empty">Loading…</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          <footer className="u-pager">
            <span className="u-muted">{rows.length ? `Showing ${(current - 1) * PAGE_SIZE + 1} to ${Math.min(rows.length, current * PAGE_SIZE)} of ${fmtNum(rows.length)} ${view === 'rooms' ? 'rooms' : 'floors'}` : `No ${view === 'rooms' ? 'rooms' : 'floors'}`}</span>
            <nav className="u-pages" aria-label="Pagination">
              <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span className="u-gap">Page {current} of {pages}</span>
              <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          </footer>
          <p className="ad-sample"><Info size={13} />Rooms are listed once they're labelled on a floor plan. To add floors or labels, open a building and use its Floors tab.</p>
        </section>
      </div>

      {panelFloor && (
        <>
          <div className="u-drawer-backdrop" onClick={closePanel} />
          <FloorPanel key={`${panelFloor.id}-${selected.labelId ?? ''}`} mode="view" floor={panelFloor} buildingId={panelFloor.buildingId}
            buildings={[{ id: panelFloor.buildingId, name: floors.find((f) => f.id === panelFloor.id)?.buildingName, code: floors.find((f) => f.id === panelFloor.id)?.buildingCode }]}
            floors={[]} initialLabelId={selected.labelId} onClose={closePanel}
            onEdit={(f) => navigate(`/schools/${f.schoolId}/buildings/${f.buildingId}/floors`)} onSaved={closePanel} />
        </>
      )}
    </div>
  )
}
