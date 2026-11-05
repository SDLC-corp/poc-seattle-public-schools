import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  School, ChevronRight, ArrowLeft, Plus, Search, Building2, Eye, Pencil, Trash2, CircleCheck, CircleAlert,
  SearchX, Info, MapPin, CalendarDays,
} from 'lucide-react'
import { request } from '../../lib/api'
import { useConfirm } from '../../components/ui/useConfirm'
import { AcmBadge, confirmDeleteBuilding } from './BuildingParts'
import BuildingForm from './BuildingForm'
import FloorPanel from './FloorPanel'
import { InspectionTable, DocumentsCard } from './FacilityTabs'
import { PRESUMED_ACM_BEFORE, fmtNum } from './buildingUtils'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'floors', label: 'Floors' },
  { slug: 'rooms', label: 'Rooms' },
  { slug: 'acm', label: 'ACM Materials' },
  { slug: 'inspections', label: 'Inspections' },
  { slug: 'documents', label: 'Documents' },
]
const CONDITION_CLASS = { Good: 'good', Damaged: 'damaged', 'Significantly Damaged': 'severe', 'Not Assessed': 'na' }

function ConditionBadge({ condition }) {
  return <span className={`fp-cond ${CONDITION_CLASS[condition] ?? 'na'}`}>{condition}</span>
}
function Stat({ label, value, tone }) {
  return <div className="bd-stat"><span>{label}</span><strong className={tone ? `tone-text-${tone}` : ''}>{value}</strong></div>
}

// Rooms mapped on this building's floor plans (Rooms tab)
function RoomsTable({ rooms, onOpen }) {
  return (
    <div className="u-table-wrap">
      <table className="u-table c-table b-table">
        <thead><tr><th>Room No.</th><th>Room Name</th><th>Floor</th><th className="b-col-floor">Type</th><th className="c-num">Materials</th><th>ACM Status</th><th className="b-col-actions">Plan</th></tr></thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} tabIndex={0} onClick={() => onOpen(r.floorId, r.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.floorId, r.id) }}>
              <td><strong>{r.number}</strong></td>
              <td>{r.name}{!r.polygon && <small className="p-sub">Not on plan</small>}</td>
              <td className="u-nowrap">{r.floorName}</td>
              <td className="b-col-floor">{r.type}</td>
              <td className="c-num">{r.materialCount}</td>
              <td><AcmBadge status={r.acmStatus} /></td>
              <td className="b-col-actions">
                <button type="button" className="u-row-btn" title="Open on floor plan" aria-label={`Open room ${r.number} on the floor plan`}
                  onClick={(e) => { e.stopPropagation(); onOpen(r.floorId, r.id) }}><MapPin size={14} /></button>
              </td>
            </tr>
          ))}
          {!rooms.length && <tr><td colSpan={7} className="u-empty">No rooms mapped yet. Open a floor's plan to detect or draw rooms.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ACM materials recorded in this building (ACM Materials tab)
function MaterialsTable({ materials, onOpen }) {
  return (
    <div className="u-table-wrap">
      <table className="u-table c-table b-table">
        <thead><tr><th>Material</th><th>Location</th><th className="b-col-floor">Type</th><th className="c-num">Quantity</th><th>ACM Status</th><th>Condition</th><th className="b-col-acmrooms">Risk</th></tr></thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id} tabIndex={0} onClick={() => onOpen(m.floorId, m.roomId)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m.floorId, m.roomId) }}>
              <td><strong>{m.name}</strong>{m.scope !== 'room' && <small className="p-sub">{m.scope === 'floor' ? 'Floor-level' : 'Building-level'}</small>}</td>
              <td>{m.floorName} · {m.roomNumber} {m.roomName}<small className="p-sub">{m.location}</small></td>
              <td className="b-col-floor">{m.materialType}</td>
              <td className="c-num u-nowrap">{fmtNum(m.quantity)} {m.unit}</td>
              <td><AcmBadge status={m.acmStatus} /></td>
              <td><ConditionBadge condition={m.condition} /></td>
              <td className={`b-col-acmrooms fr-risk ${m.riskRanking.toLowerCase()}`}>{m.riskRanking}</td>
            </tr>
          ))}
          {!materials.length && <tr><td colSpan={7} className="u-empty">No ACM materials recorded yet. Open a floor's plan, pick a room and add its materials.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
export default function BuildingDetail() {
  const { schoolId, buildingId, tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)

  const [data, setData] = useState(null) // { key, school, buildings }
  const [floorData, setFloorData] = useState(null) // { buildingId, floors }
  const [inspections, setInspections] = useState(null) // { schoolId, list }
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState(null) // { mode: 'add' | 'edit', floorId? }
  const [roomData, setRoomData] = useState(null) // { buildingId, rooms, materials }
  const [editBuilding, setEditBuilding] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirm, confirmDialog] = useConfirm()

  useEffect(() => {
    let cancelled = false
    request(`/schools/${schoolId}`)
      .then((s) => { if (!cancelled) { const { buildings, ...school } = s; setData({ key: schoolId, school, buildings }); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.status === 404 ? 'notFound' : err.message) })
    return () => { cancelled = true }
  }, [schoolId])

  useEffect(() => {
    let cancelled = false
    request(`/floors?buildingId=${encodeURIComponent(buildingId)}`)
      .then((d) => { if (!cancelled) setFloorData({ buildingId, floors: d.floors }) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [buildingId])

  useEffect(() => {
    if (tabSlug !== 'inspections' || inspections?.schoolId === schoolId) return undefined
    let cancelled = false
    request(`/compliance/inspections?schoolId=${encodeURIComponent(schoolId)}`)
      .then((d) => { if (!cancelled) setInspections({ schoolId, list: d.inspections }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [tabSlug, schoolId, inspections?.schoolId])

  // Rooms + materials for the Rooms and ACM Materials tabs (loaded when one of them opens)
  useEffect(() => {
    if ((tabSlug !== 'rooms' && tabSlug !== 'acm') || roomData?.buildingId === buildingId) return undefined
    let cancelled = false
    const q = `buildingId=${encodeURIComponent(buildingId)}`
    Promise.all([request(`/rooms?${q}`), request(`/acm-materials?${q}`)])
      .then(([r, m]) => { if (!cancelled) setRoomData({ buildingId, rooms: r.rooms, materials: m.materials }) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [tabSlug, buildingId, roomData?.buildingId])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const current = data?.key === schoolId ? data : null
  const floors = useMemo(() => (floorData?.buildingId === buildingId ? floorData.floors : null), [floorData, buildingId])
  const b = current?.buildings.find((x) => x.id === buildingId)
  const closePanel = useCallback(() => setPanel(null), [])
  const closeBuildingForm = useCallback(() => setEditBuilding(false), [])

  const mappedRooms = (floors ?? []).reduce((n, f) => n + (f.roomStats?.mapped ?? 0), 0)
  const tabRooms = roomData?.buildingId === buildingId ? roomData : null

  if (!tab) return <Navigate to={`/schools/${schoolId}/buildings/${buildingId}`} replace />
  if (error === 'notFound' || (current && !b)) {
    return (
      <div className="coming-soon">
        <SearchX size={30} />
        <strong>Building not found</strong>
        <span>There's no building <code>{buildingId}</code> at this school. <Link to={`/schools/${schoolId}/buildings`}>Back to Buildings</Link></span>
      </div>
    )
  }

  const s = current?.school
  const term = query.trim().toLowerCase()
  const visibleFloors = (floors ?? []).filter((f) => !term || [f.name, String(f.number), f.acmStatus].some((v) => v.toLowerCase().includes(term)))
  const panelFloor = panel?.floorId ? floors?.find((f) => f.id === panel.floorId) : null
  const buildingsUrl = `/schools/${schoolId}/buildings`
  // The floor's plan screen, optionally with a room selected
  const openFloor = (floorId, roomId) => navigate(`/schools/${schoolId}/buildings/${buildingId}/floors/${floorId}${roomId ? `?room=${roomId}` : ''}`)

  const applyBuilding = (updated) => {
    if (updated) setData((d) => ({ ...d, buildings: d.buildings.map((x) => (x.id === updated.id ? updated : x)) }))
  }

  // After saving a floor, go straight to its plan to map rooms and ACM
  // `detect`: a new plan was uploaded, so the floor plan screen detects its rooms on arrival
  const onFloorSaved = (floor, updatedBuilding, isNew, warning, { detect = false } = {}) => {
    applyBuilding(updatedBuilding)
    setPanel(null)
    navigate(`/schools/${floor.schoolId}/buildings/${floor.buildingId}/floors/${floor.id}`, {
      state: {
        detect,
        floor, // the floor as just saved (with its new plan), so the plan screen never shows an older copy
        toast: warning ? { kind: 'error', text: warning } : { kind: 'success', text: isNew ? `Added ${floor.name}` : `Saved ${floor.name}` },
      },
    })
  }
  // Back to the school's buildings once it's gone (the server refuses if inspections etc. refer to it)
  const deleteBuilding = async () => {
    try {
      if (!(await confirmDeleteBuilding({ ...b, schoolName: s?.name ?? b.schoolName }, confirm))) return
      navigate(buildingsUrl, { replace: true, state: { toast: { kind: 'success', text: `Deleted ${b.name}` } } })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    }
  }
  const deleteFloor = async (floor) => {
    const n = floor.roomStats?.mapped ?? 0
    const ok = await confirm({
      title: `Delete ${floor.name}?`,
      message: `Floor ${floor.number} and its floor plan will be removed from this building. This can't be undone.`,
      detail: n ? `Its ${n} mapped room${n > 1 ? 's' : ''} and their ACM records will be deleted too.` : null,
      confirmLabel: 'Delete Floor',
      tone: 'danger',
    })
    if (!ok) return
    try {
      const res = await request(`/floors/${floor.id}`, { method: 'DELETE' })
      applyBuilding(res.building)
      setFloorData((fd) => ({ ...fd, floors: fd.floors.filter((f) => f.id !== floor.id) }))
      if (panel?.floorId === floor.id) setPanel(null)
      setToast({ kind: 'success', text: `Deleted ${floor.name}` })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    }
  }

  return (
    <div className={`schools-page building-detail${panel && (panel.mode === 'add' || panelFloor) ? ' details-open fp-open' : ''}`}>
      <div className="sch-main">
        <nav className="sd-crumbs" aria-label="Breadcrumb">
          <Link to="/dashboard">Home</Link><ChevronRight size={13} />
          <Link to="/schools/list">Schools</Link><ChevronRight size={13} />
          <Link to={`/schools/${schoolId}`}>{s?.name ?? '…'}</Link><ChevronRight size={13} />
          <Link to={buildingsUrl}>Buildings</Link><ChevronRight size={13} />
          {tabSlug ? <Link to={`${buildingsUrl}/${buildingId}`}>{b?.name ?? '…'}</Link> : <span aria-current="page">{b?.name ?? '…'}</span>}
          {tabSlug && <><ChevronRight size={13} /><span aria-current="page">{tab.label}</span></>}
        </nav>

        <div className="c-head">
          <div className="sd-title">
            <span className="sd-icon"><School size={22} /></span>
            <div>
              <h1>{s?.name ?? 'Loading…'}</h1>
              {s && <p><span>School ID: <b>{s.id.toUpperCase()}</b></span><span className="sd-sep">|</span><span>Address: {s.address.full}</span></p>}
            </div>
          </div>
          <Link className="u-btn u-btn-outline" to={buildingsUrl}><ArrowLeft size={15} />Back to Buildings</Link>
        </div>

        {error && error !== 'notFound' && <div className="u-banner">Couldn't load this building ({error}).</div>}

        {b && (
          <section className="u-card bd-card">
            <div className="bd-id">
              <span className={`bd-thumb f${b.floors}`} aria-hidden="true">
                {Array.from({ length: b.floors }, (_, i) => <i key={i} />)}
              </span>
              <div>
                <h2>{b.name} <AcmBadge status={b.acmStatus} /></h2>
                <p><span>Building Code: <b>{b.code}</b></span><span className="sd-sep">|</span><span>Year Built: <b>{b.yearBuilt}</b></span><span className="sd-sep">|</span><span>{b.construction}</span></p>
              </div>
            </div>
            <div className="bd-stats">
              <Stat label="Total Floors" value={fmtNum(b.floors)} />
              <Stat label="Total Rooms" value={fmtNum(b.rooms)} />
              <Stat label="ACM Rooms" value={fmtNum(b.roomsWithAcm)} tone={b.roomsWithAcm ? 'critical' : undefined} />
              <Stat label="Mapped Rooms" value={fmtNum(mappedRooms)} />
            </div>
            <div className="bd-card-actions">
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setEditBuilding(true)}><Pencil size={13} />Edit Building</button>
              <button type="button" className="u-btn u-btn-outline u-btn-sm bd-delete" onClick={deleteBuilding}><Trash2 size={13} />Delete Building</button>
            </div>
          </section>
        )}

        <nav className="u-tabs" role="tablist" aria-label="Building sections">
          {TABS.map((t) => (
            <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
              className={`u-tab${t.slug === tabSlug ? ' active' : ''}`}
              onClick={() => navigate(t.slug ? `${buildingsUrl}/${buildingId}/${t.slug}` : `${buildingsUrl}/${buildingId}`)}>{t.label}</button>
          ))}
        </nav>

        {b && floors && tabSlug === '' && (
          <div className="sd-grid">
            <section className="u-card">
              <header className="u-card-head"><h2><Building2 size={16} /> Building Information</h2></header>
              <dl className="cd-facts sd-facts">
                <div className="cd-row"><dt>School</dt><dd>{s.name}</dd></div>
                <div className="cd-row"><dt>Gross Area</dt><dd>{fmtNum(b.areaSqFt)} sq ft</dd></div>
                <div className="cd-row"><dt>Construction</dt><dd>{b.construction}</dd></div>
                <div className="cd-row"><dt>Year Built</dt><dd>{b.yearBuilt}{b.presumedAcm ? ` · pre-${PRESUMED_ACM_BEFORE}, presumed ACM until sampled` : ''}</dd></div>
                <div className="cd-row"><dt>Rooms with ACM</dt><dd>{fmtNum(b.roomsWithAcm)} of {fmtNum(b.rooms)}</dd></div>
              </dl>
              {b.source !== 'app' && <p className="ad-sample"><Info size={13} />Building, floor and room figures are sample data.</p>}
            </section>
            <section className="u-card">
              <header className="u-card-head"><h2>Floors ({floors.length})</h2>
                <Link className="u-btn u-btn-outline u-btn-sm" to={`${buildingsUrl}/${buildingId}/floors`}>Manage Floors</Link></header>
              <ul className="bd-floorlist">
                {[...floors].reverse().map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => openFloor(f.id)}>
                      <span className="bd-fnum">{f.number}</span>
                      <span><strong>{f.name}</strong><small>{fmtNum(f.rooms)} rooms · {fmtNum(f.acmRooms)} with ACM · {f.roomStats?.mapped ?? 0} mapped on plan</small></span>
                      <AcmBadge status={f.acmStatus} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {b && tabSlug === 'floors' && (
          <section className="u-card">
            <header className="u-card-head b-head">
              <h2 className="bd-floors-title"><span className="bd-floors-icon"><Building2 size={18} /></span>Floors ({floors?.length ?? '…'})</h2>
              <div className="b-tools">
                <label className="u-search"><Search size={15} />
                  <input type="search" placeholder="Search floors…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search floors" />
                </label>
                <button type="button" className="u-btn u-btn-primary" disabled={!floors} onClick={() => setPanel({ mode: 'add' })}
                  ><Plus size={16} />Add Floor</button>
              </div>
            </header>
            <div className="u-table-wrap">
              <table className="u-table c-table b-table">
                <thead>
                  <tr><th>Floor No.</th><th>Name</th><th className="c-num">Total Rooms</th><th className="c-num">ACM Rooms</th>
                    <th className="c-num b-col-acmrooms">Mapped Rooms</th><th>Status</th><th className="b-col-actions">Actions</th></tr>
                </thead>
                <tbody>
                  {visibleFloors.map((f) => (
                    <tr key={f.id} className={f.id === panel?.floorId ? 'selected' : ''} tabIndex={0}
                      onClick={() => openFloor(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') openFloor(f.id) }}>
                      <td><span className="bd-fnum">{f.number}</span></td>
                      <td><strong>{f.name}</strong></td>
                      <td className="c-num">{fmtNum(f.rooms)}</td>
                      <td className="c-num">{fmtNum(f.acmRooms)}</td>
                      <td className="c-num b-col-acmrooms">{f.roomStats?.mapped ?? 0}{f.roomStats?.acmPresent ? <small className="p-sub">{f.roomStats.acmPresent} with ACM</small> : null}</td>
                      <td><AcmBadge status={f.acmStatus} /></td>
                      <td className="b-col-actions">
                        <span className="b-actions">
                          <button type="button" className="u-row-btn" title="Open floor plan & rooms" aria-label={`Open ${f.name} floor plan`} onClick={(e) => { e.stopPropagation(); openFloor(f.id) }}><Eye size={14} /></button>
                          <button type="button" className="u-row-btn" title="Edit" aria-label={`Edit ${f.name}`} onClick={(e) => { e.stopPropagation(); setPanel({ mode: 'edit', floorId: f.id }) }}><Pencil size={14} /></button>
                          <button type="button" className="u-row-btn danger" title={floors.length <= 1 ? 'A building needs at least one floor' : 'Delete'} disabled={floors.length <= 1}
                            aria-label={`Delete ${f.name}`} onClick={(e) => { e.stopPropagation(); deleteFloor(f) }}><Trash2 size={14} /></button>
                        </span>
                      </td>
                    </tr>
                  ))}
                  {floors && !visibleFloors.length && <tr><td colSpan={7} className="u-empty">No floors match this search.</td></tr>}
                  {!floors && <tr><td colSpan={7} className="u-empty">Loading…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {b && (tabSlug === 'rooms' || tabSlug === 'acm') && (
          <section className="u-card">
            <header className="u-card-head">
              <h2>{tabSlug === 'acm' ? `ACM Materials (${tabRooms?.materials.length ?? '…'})` : `Rooms (${tabRooms?.rooms.length ?? '…'})`}</h2>
              <span className="u-muted u-small">
                {tabRooms && (tabSlug === 'acm'
                  ? `${tabRooms.materials.filter((m) => m.acmStatus === 'ACM Present').length} confirmed · ${tabRooms.materials.filter((m) => m.acmStatus === 'Assumed ACM').length} assumed · ${tabRooms.materials.filter((m) => m.acmStatus !== 'No ACM' && m.riskRanking === 'High').length} high risk`
                  : `${fmtNum(tabRooms.rooms.length)} mapped of ${fmtNum(b.rooms)} rooms in the building`)}
              </span>
            </header>
            {!tabRooms ? <p className="u-muted u-small">Loading…</p> : tabSlug === 'acm'
              ? <MaterialsTable materials={tabRooms.materials} onOpen={openFloor} />
              : <RoomsTable rooms={tabRooms.rooms} onOpen={openFloor} />}
            <p className="ad-sample"><Info size={13} />
              {tabSlug === 'acm'
                ? 'Damaged or friable ACM with a high risk ranking needs a response action under AHERA. Click a row to open the room on its floor plan.'
                : 'Rooms come from each floor plan (detected, drawn or sample layout). Click a row to open it on the plan and add ACM details.'}
            </p>
          </section>
        )}
        {b && tabSlug === 'inspections' && (
          <section className="u-card">
            <header className="u-card-head">
              <h2>Inspections – {b.name}</h2>
              <Link className="u-btn u-btn-outline u-btn-sm" to="/compliance"><CalendarDays size={13} />Compliance Calendar</Link>
            </header>
            {inspections?.schoolId !== schoolId ? <p className="u-muted u-small">Loading…</p> : (
              <InspectionTable showBuilding={false} inspections={inspections.list.filter((i) => i.buildingId === buildingId).sort((x, y) => y.scheduledDate.localeCompare(x.scheduledDate))}
                empty="No inspections recorded for this building." />
            )}
          </section>
        )}

        {b && tabSlug === 'documents' && (
          <DocumentsCard filter={{ school: schoolId, building: buildingId }} showBuilding={false} emptyText="No documents for this building yet." />
        )}
      </div>

      {panel && b && floors && (panel.mode === 'add' || panelFloor) && (
        <>
          <div className="u-drawer-backdrop" onClick={closePanel} />
          <FloorPanel key={`${panel.mode}-${panel.floorId ?? 'new'}`} mode={panel.mode} floor={panelFloor}
            buildingId={buildingId} buildings={current.buildings} floors={floors}
            onClose={closePanel} onSaved={onFloorSaved} />
        </>
      )}
      {editBuilding && b && (
        <BuildingForm school={s} building={b} existing={current.buildings} onClose={closeBuildingForm}
          onSaved={(saved) => { applyBuilding(saved); setEditBuilding(false); setToast({ kind: 'success', text: `Saved ${saved.name}` }) }} />
      )}
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
