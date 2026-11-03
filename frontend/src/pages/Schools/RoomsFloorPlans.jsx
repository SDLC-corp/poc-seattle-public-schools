import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import {
  Map as MapIcon, Layers, DoorOpen, TriangleAlert, CircleDashed, ShieldAlert, Search, RotateCcw, ChevronLeft, ChevronRight, Info, ClipboardList,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { AcmBadge } from './BuildingParts'
import { fmtNum } from './buildingUtils'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'

const PAGE_SIZE = 15
const VIEWS = {
  floors: { title: 'Floors', icon: Layers, path: '/schools/floors', blurb: 'Every floor with its plan and mapped rooms. Open a floor to map rooms and record ACM.' },
  rooms: { title: 'Rooms & Floor Plans', icon: MapIcon, path: '/schools/rooms', blurb: 'Rooms mapped on floor plans across the district, with their ACM status.' },
  acm: { title: 'ACM Materials', icon: ClipboardList, path: '/schools/acm-materials', blurb: 'Asbestos-containing materials recorded per room, with condition and risk.' },
}
const STATUS_OPTIONS = {
  floors: ['ACM Present', 'Assumed ACM', 'No ACM'],
  rooms: ['ACM Present', 'Assumed ACM', 'No ACM', 'Not Assessed'],
  acm: ['ACM Present', 'Assumed ACM', 'No ACM', 'Not Yet Assessed'],
}
const CONDITION_CLASS = { Good: 'good', Damaged: 'damaged', 'Significantly Damaged': 'severe', 'Not Assessed': 'na' }

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{fmtNum(value)}</strong><span className="kpi-label">{label}</span></span>
    </button>
  )
}

// District-wide Floors / Rooms / ACM Materials lists; every row opens the floor's plan screen
export default function RoomsFloorPlans({ view = 'rooms' }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const school = params.get('school') ?? ''
  const [floors, setFloors] = useState(null)
  const [rooms, setRooms] = useState(null)
  const [materials, setMaterials] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [condition, setCondition] = useState('')
  const [risk, setRisk] = useState('')
  const [page, setPage] = useState(1)

  // Changing view resets the view-specific filters, or applies ones handed over by a KPI card (render-time, no effect needed)
  const location = useLocation()
  const [viewFor, setViewFor] = useState(view)
  if (viewFor !== view) {
    const f = location.state?.filters ?? {}
    setViewFor(view)
    setStatus(f.status ?? '')
    setCondition(f.condition ?? '')
    setRisk(f.risk ?? '')
    setPage(1)
  }

  useEffect(() => {
    Promise.all([request('/floors'), request('/rooms'), request('/acm-materials')])
      .then(([f, r, m]) => { setFloors(f.floors); setRooms(r.rooms); setMaterials(m.materials) })
      .catch((err) => setError(err.message))
  }, [])

  const setSchool = (v) => {
    const next = new URLSearchParams(params)
    if (v) next.set('school', v); else next.delete('school')
    setParams(next, { replace: true })
    setPage(1)
  }
  const go = (v, filters = {}) => {
    if (v === view) {
      setStatus(filters.status ?? '')
      setRisk(filters.risk ?? '')
      setCondition(filters.condition ?? '')
      setPage(1)
    } else {
      navigate(`${VIEWS[v].path}${school ? `?school=${school}` : ''}`, { state: { filters } })
    }
  }

  const schoolOptions = useMemo(() => {
    const names = new Map((floors ?? []).map((f) => [f.schoolId, f.schoolName]))
    return [...names].sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? '')).map(([value, label]) => ({ value, label }))
  }, [floors])

  const inSchool = (x) => !school || x.schoolId === school
  const sFloors = (floors ?? []).filter(inSchool)
  const sRooms = (rooms ?? []).filter(inSchool)
  const sMaterials = (materials ?? []).filter(inSchool)
  const loaded = floors && rooms && materials
  const acmMaterials = sMaterials.filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM')

  const term = query.trim().toLowerCase()
  const has = (...vals) => !term || vals.some((v) => v?.toString().toLowerCase().includes(term))
  const rows = view === 'floors'
    ? sFloors.filter((f) => (!status || f.acmStatus === status) && has(f.name, f.buildingName, f.buildingCode, f.schoolName))
    : view === 'rooms'
      ? sRooms.filter((r) => (!status || r.acmStatus === status) && has(r.number, r.name, r.type, r.buildingName, r.schoolName, r.floorName))
      : sMaterials.filter((m) => (!status || m.acmStatus === status)
        && (!condition || (condition === 'damaged' ? /Damaged/.test(m.condition) : m.condition === condition))
        && (!risk || m.riskRanking === risk)
        && has(m.name, m.materialType, m.location, m.roomName, m.roomNumber, m.buildingName, m.schoolName))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const filtersActive = query || status || condition || risk || school
  const floorUrl = (x, roomId) => `/schools/${x.schoolId}/buildings/${x.buildingId}/floors/${x.floorId ?? x.id}${roomId ? `?room=${roomId}` : ''}`
  const open = (url) => navigate(url)
  const V = VIEWS[view]
  const noun = { floors: 'floors', rooms: 'rooms', acm: 'materials' }[view]

  return (
    <div className="schools-page">
      <div className="sch-main">
        <div className="c-head">
          <div>
            <h1><V.icon size={22} />{V.title}</h1>
            <p>{V.blurb}</p>
          </div>
        </div>

        {error && <div className="u-banner">Couldn't load data ({error}).</div>}

        <div className="b-kpis rf-kpis">
          <Kpi icon={Layers} value={loaded && sFloors.length} label="Floors" tone="primary" active={view === 'floors' && !status} onClick={() => go('floors')} />
          <Kpi icon={DoorOpen} value={loaded && sRooms.length} label="Mapped Rooms" tone="teal" active={view === 'rooms' && !status} onClick={() => go('rooms')} />
          <Kpi icon={TriangleAlert} value={loaded && sRooms.filter((r) => r.acmStatus === 'ACM Present').length} label="Rooms with ACM" tone="critical"
            active={view === 'rooms' && status === 'ACM Present'} onClick={() => go('rooms', { status: 'ACM Present' })} />
          <Kpi icon={CircleDashed} value={loaded && sRooms.filter((r) => r.acmStatus === 'Not Assessed').length} label="Rooms Not Assessed" tone="violet"
            active={view === 'rooms' && status === 'Not Assessed'} onClick={() => go('rooms', { status: 'Not Assessed' })} />
          <Kpi icon={ClipboardList} value={loaded && acmMaterials.length} label="ACM Materials" tone="warning"
            active={view === 'acm' && !status && !risk} onClick={() => go('acm')} />
          <Kpi icon={ShieldAlert} value={loaded && acmMaterials.filter((m) => m.riskRanking === 'High').length} label="High-Risk ACM" tone="critical"
            active={view === 'acm' && risk === 'High'} onClick={() => go('acm', { risk: 'High' })} />
        </div>

        <nav className="u-tabs" role="tablist" aria-label="Views">
          {Object.entries(VIEWS).map(([id, v]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={`u-tab${view === id ? ' active' : ''}`} onClick={() => go(id)}>{v.title}</button>
          ))}
        </nav>

        <section className="u-card">
          <div className={`b-filters${view === 'acm' ? ' rf-filters-acm' : ''}`}>
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder={`Search ${noun}, buildings or schools…`} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Search" />
            </label>
            <SearchSelect variant="field" label="School" value={school} onChange={setSchool} searchPlaceholder="Search schools…"
              options={[{ value: '', label: 'All Schools' }, ...schoolOptions]} />
            <SearchSelect variant="field" label="ACM status" value={status} onChange={(v) => { setStatus(v); setPage(1) }} searchable={false}
              options={[{ value: '', label: 'All ACM Statuses' }, ...STATUS_OPTIONS[view].map((s) => ({ value: s, label: s }))]} />
            {view === 'acm' && (
              <>
                <SearchSelect variant="field" label="Condition" value={condition} onChange={(v) => { setCondition(v); setPage(1) }} searchable={false}
                  options={[{ value: '', label: 'All Conditions' }, { value: 'damaged', label: 'Damaged (any)' }, ...['Good', 'Damaged', 'Significantly Damaged', 'Not Assessed'].map((c) => ({ value: c, label: c }))]} />
                <SearchSelect variant="field" label="Risk" value={risk} onChange={(v) => { setRisk(v); setPage(1) }} searchable={false}
                  options={[{ value: '', label: 'All Risk Levels' }, ...['High', 'Medium', 'Low'].map((r) => ({ value: r, label: `${r} risk` }))]} />
              </>
            )}
            <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive}
              onClick={() => { setQuery(''); setStatus(''); setCondition(''); setRisk(''); setSchool('') }}><RotateCcw size={14} />Reset</button>
          </div>

          <div className="u-table-wrap">
            <table className="u-table c-table b-table">
              {view === 'floors' && (
                <>
                  <thead><tr><th>School / Building</th><th>Floor</th><th className="c-num">Total Rooms</th><th className="c-num">Mapped</th><th className="c-num b-col-acmrooms">Rooms with ACM</th><th className="b-col-floor">Plan</th><th>Status</th></tr></thead>
                  <tbody>
                    {visible.map((f) => (
                      <tr key={f.id} tabIndex={0} onClick={() => open(floorUrl(f))} onKeyDown={(e) => { if (e.key === 'Enter') open(floorUrl(f)) }}>
                        <td><Link className="b-link" to={floorUrl(f)} onClick={(e) => e.stopPropagation()}>{f.buildingName}</Link><small className="p-sub">{f.schoolName} · {f.buildingCode}</small></td>
                        <td className="u-nowrap"><span className="bd-fnum">{f.number}</span> {f.name}</td>
                        <td className="c-num">{fmtNum(f.rooms)}</td>
                        <td className="c-num">{fmtNum(f.roomStats?.mapped ?? 0)}</td>
                        <td className="c-num b-col-acmrooms">{fmtNum((f.roomStats?.acmPresent ?? 0) + (f.roomStats?.assumed ?? 0))}</td>
                        <td className="b-col-floor">{f.planImage ? <span className="rf-plan up">Uploaded</span> : <span className="rf-plan">Sample</span>}</td>
                        <td><AcmBadge status={f.acmStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {view === 'rooms' && (
                <>
                  <thead><tr><th>Room</th><th>Location</th><th className="b-col-floor">Type</th><th className="c-num">Materials</th><th>ACM Status</th></tr></thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id} tabIndex={0} onClick={() => open(floorUrl(r, r.id))} onKeyDown={(e) => { if (e.key === 'Enter') open(floorUrl(r, r.id)) }}>
                        <td><strong>{r.number}</strong> {r.name}{!r.polygon && <small className="p-sub">Not on plan</small>}</td>
                        <td>{r.buildingName} · {r.floorName}<small className="p-sub">{r.schoolName}</small></td>
                        <td className="b-col-floor">{r.type}</td>
                        <td className="c-num">{r.materialCount}</td>
                        <td><AcmBadge status={r.acmStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {view === 'acm' && (
                <>
                  <thead><tr><th>Material</th><th>Location</th><th className="b-col-floor">Type</th><th className="c-num">Quantity</th><th>ACM Status</th><th>Condition</th><th className="b-col-acmrooms">Risk</th></tr></thead>
                  <tbody>
                    {visible.map((m) => (
                      <tr key={m.id} tabIndex={0} onClick={() => open(floorUrl(m, m.roomId))} onKeyDown={(e) => { if (e.key === 'Enter') open(floorUrl(m, m.roomId)) }}>
                        <td><strong>{m.name}</strong><small className="p-sub">{m.location}</small></td>
                        <td>Room {m.roomNumber} {m.roomName}<small className="p-sub">{m.schoolName} · {m.buildingName} · {m.floorName}</small></td>
                        <td className="b-col-floor">{m.materialType}</td>
                        <td className="c-num u-nowrap">{fmtNum(m.quantity)} {m.unit}</td>
                        <td><AcmBadge status={m.acmStatus} /></td>
                        <td><span className={`fp-cond ${CONDITION_CLASS[m.condition] ?? 'na'}`}>{m.condition}</span></td>
                        <td className={`b-col-acmrooms fr-risk ${m.riskRanking.toLowerCase()}`}>{m.riskRanking}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {loaded && !visible.length && <tbody><tr><td colSpan={7} className="u-empty">No {noun} match these filters.</td></tr></tbody>}
              {!loaded && !error && <tbody><tr><td colSpan={7} className="u-empty">Loading…</td></tr></tbody>}
            </table>
          </div>
          <footer className="u-pager">
            <span className="u-muted">{rows.length ? `Showing ${(current - 1) * PAGE_SIZE + 1} to ${Math.min(rows.length, current * PAGE_SIZE)} of ${fmtNum(rows.length)} ${noun}` : `No ${noun}`}</span>
            <nav className="u-pages" aria-label="Pagination">
              <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span className="u-gap">Page {current} of {pages}</span>
              <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          </footer>
          <p className="ad-sample"><Info size={13} />Click a row to open the floor plan, where rooms are detected or drawn and ACM details are added. Room and material records here are sample data unless added in the app.</p>
        </section>
      </div>
    </div>
  )
}
