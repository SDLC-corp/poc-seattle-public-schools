import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  School, ChevronRight, ArrowLeft, Plus, Search, Building2, Eye, Pencil, Trash2, CircleCheck, CircleAlert,
  SearchX, Info, MapPin, CalendarDays,
} from 'lucide-react'
import { request } from '../../lib/api'
import { AcmBadge } from './BuildingParts'
import BuildingForm from './BuildingForm'
import FloorPanel from './FloorPanel'
import { InspectionTable, DocumentsCard } from './FacilityTabs'
import { MAX_FLOORS, PRESUMED_ACM_BEFORE, fmtNum } from './buildingUtils'
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
const CONDITION_CLASS = { Good: 'good', Damaged: 'damaged', 'Significantly Damaged': 'severe', 'Not assessed': 'na' }

function ConditionBadge({ condition }) {
  return <span className={`fp-cond ${CONDITION_CLASS[condition] ?? 'na'}`}>{condition}</span>
}

function Stat({ label, value, tone }) {
  return <div className="bd-stat"><span>{label}</span><strong className={tone ? `tone-text-${tone}` : ''}>{value}</strong></div>
}

// Every labelled room across floors (Rooms and ACM Materials tabs)
function LabelTable({ rows, acmOnly, onOpen }) {
  return (
    <div className="u-table-wrap">
      <table className="u-table c-table b-table">
        <thead>
          <tr>
            {acmOnly ? <><th>Material</th><th>Location</th></> : <><th>Room</th><th>Floor</th></>}
            <th>ACM Status</th>{!acmOnly && <th>Material</th>}<th>Condition</th><th className="b-col-actions">Plan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ floor, label: l }) => (
            <tr key={`${floor.id}-${l.id}`} tabIndex={0} onClick={() => onOpen(floor, l.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(floor, l.id) }}>
              {acmOnly
                ? <><td><strong>{l.material || 'Unspecified material'}</strong></td><td>{floor.name} · {l.name}</td></>
                : <><td><strong>{l.name}</strong></td><td>{floor.number} · {floor.name}</td></>}
              <td><AcmBadge status={l.acmStatus} /></td>
              {!acmOnly && <td>{l.material || '—'}</td>}
              <td><ConditionBadge condition={l.condition} /></td>
              <td className="b-col-actions">
                <button type="button" className="u-row-btn" title="Show on floor plan" aria-label={`Show ${l.name} on the floor plan`}
                  onClick={(e) => { e.stopPropagation(); onOpen(floor, l.id) }}><MapPin size={14} /></button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={acmOnly ? 5 : 6} className="u-empty">{acmOnly ? 'No ACM labelled on the floor plans yet.' : 'No rooms labelled on the floor plans yet.'}</td></tr>}
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
  const [panel, setPanel] = useState(null) // { mode: 'add' | 'view' | 'edit', floorId?, labelId? }
  const [editBuilding, setEditBuilding] = useState(false)
  const [toast, setToast] = useState(null)

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

  const labelRows = useMemo(() => (floors ?? []).flatMap((floor) => floor.labels.map((label) => ({ floor, label }))), [floors])

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
  const isFull = (floors?.length ?? 0) >= MAX_FLOORS
  const buildingsUrl = `/schools/${schoolId}/buildings`
  const openFloor = (floor, labelId) => setPanel({ mode: 'view', floorId: floor.id, labelId })

  const applyBuilding = (updated) => {
    if (updated) setData((d) => ({ ...d, buildings: d.buildings.map((x) => (x.id === updated.id ? updated : x)) }))
  }

  const onFloorSaved = (floor, updatedBuilding, isNew, warning) => {
    applyBuilding(updatedBuilding)
    if (floor.buildingId === buildingId) {
      setFloorData((fd) => ({
        ...fd,
        floors: (isNew ? [...fd.floors, floor] : fd.floors.map((f) => (f.id === floor.id ? floor : f))).sort((x, y) => x.number - y.number),
      }))
      setPanel({ mode: 'view', floorId: floor.id })
    } else {
      setPanel(null)
    }
    const where = floor.buildingId === buildingId ? '' : ` to ${updatedBuilding?.name}`
    setToast(warning ? { kind: 'error', text: warning } : { kind: 'success', text: isNew ? `Added ${floor.name}${where}` : `Saved ${floor.name}` })
  }

  const deleteFloor = async (floor) => {
    if (!window.confirm(`Delete ${floor.name} (floor ${floor.number}) and its ${floor.labels.length} room label(s)? This can't be undone.`)) return
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
              <Stat label="Total Floors" value={`${b.floors} / ${MAX_FLOORS}`} />
              <Stat label="Total Rooms" value={fmtNum(b.rooms)} />
              <Stat label="ACM Rooms" value={fmtNum(b.roomsWithAcm)} tone={b.roomsWithAcm ? 'critical' : undefined} />
              <Stat label="Labelled Rooms" value={fmtNum(labelRows.length)} />
            </div>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setEditBuilding(true)}><Pencil size={13} />Edit Building</button>
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
              <header className="u-card-head"><h2>Floors ({floors.length} of {MAX_FLOORS})</h2>
                <Link className="u-btn u-btn-outline u-btn-sm" to={`${buildingsUrl}/${buildingId}/floors`}>Manage Floors</Link></header>
              <ul className="bd-floorlist">
                {[...floors].reverse().map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => { navigate(`${buildingsUrl}/${buildingId}/floors`); openFloor(f) }}>
                      <span className="bd-fnum">{f.number}</span>
                      <span><strong>{f.name}</strong><small>{fmtNum(f.rooms)} rooms · {fmtNum(f.acmRooms)} with ACM · {f.labels.length} labelled</small></span>
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
                <button type="button" className="u-btn u-btn-primary" disabled={!floors || isFull} onClick={() => setPanel({ mode: 'add' })}
                  title={isFull ? `This building already has the maximum of ${MAX_FLOORS} floors` : undefined}><Plus size={16} />Add Floor</button>
              </div>
            </header>
            {isFull && <p className="b-note bd-max"><Info size={14} />{b.name} has {MAX_FLOORS} floors, the maximum. Edit or delete a floor to change it.</p>}
            <div className="u-table-wrap">
              <table className="u-table c-table b-table">
                <thead>
                  <tr><th>Floor No.</th><th>Name</th><th className="c-num">Total Rooms</th><th className="c-num">ACM Rooms</th>
                    <th className="c-num b-col-acmrooms">Labelled</th><th>Status</th><th className="b-col-actions">Actions</th></tr>
                </thead>
                <tbody>
                  {visibleFloors.map((f) => (
                    <tr key={f.id} className={f.id === panel?.floorId ? 'selected' : ''} tabIndex={0}
                      onClick={() => openFloor(f)} onKeyDown={(e) => { if (e.key === 'Enter') openFloor(f) }}>
                      <td><span className="bd-fnum">{f.number}</span></td>
                      <td><strong>{f.name}</strong>{f.planImage && <small className="p-sub">Plan: {f.planImage.name}</small>}</td>
                      <td className="c-num">{fmtNum(f.rooms)}</td>
                      <td className="c-num">{fmtNum(f.acmRooms)}</td>
                      <td className="c-num b-col-acmrooms">{f.labels.length}</td>
                      <td><AcmBadge status={f.acmStatus} /></td>
                      <td className="b-col-actions">
                        <span className="b-actions">
                          <button type="button" className="u-row-btn" title="View" aria-label={`View ${f.name}`} onClick={(e) => { e.stopPropagation(); openFloor(f) }}><Eye size={14} /></button>
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

        {b && floors && (tabSlug === 'rooms' || tabSlug === 'acm') && (
          <section className="u-card">
            <header className="u-card-head">
              <h2>{tabSlug === 'acm' ? 'ACM Materials' : `Labelled Rooms (${labelRows.length})`}</h2>
              <span className="u-muted u-small">
                {tabSlug === 'acm'
                  ? `${labelRows.filter((r) => r.label.acmStatus !== 'No ACM').length} locations · ${labelRows.filter((r) => /Damaged/.test(r.label.condition)).length} damaged`
                  : `${fmtNum(b.rooms)} rooms in total across ${floors.length} floor${floors.length > 1 ? 's' : ''}`}
              </span>
            </header>
            <LabelTable rows={tabSlug === 'acm' ? labelRows.filter((r) => r.label.acmStatus !== 'No ACM') : labelRows} acmOnly={tabSlug === 'acm'} onOpen={openFloor} />
            <p className="ad-sample"><Info size={13} />
              {tabSlug === 'acm'
                ? 'Damaged or significantly damaged ACM needs a response action under AHERA. Label rooms on the floor plans (Floors tab) to track material and condition.'
                : 'Rooms appear here once they are labelled on a floor plan. Click a row to see it on the plan.'}
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
          <FloorPanel key={`${panel.mode}-${panel.floorId ?? 'new'}-${panel.labelId ?? ''}`} mode={panel.mode} floor={panelFloor}
            buildingId={buildingId} buildings={current.buildings} floors={floors} initialLabelId={panel.labelId}
            onClose={closePanel} onEdit={(f) => setPanel({ mode: 'edit', floorId: f.id })} onSaved={onFloorSaved} />
        </>
      )}
      {editBuilding && b && (
        <BuildingForm school={s} building={b} existing={current.buildings} onClose={closeBuildingForm}
          onSaved={(saved) => { applyBuilding(saved); setEditBuilding(false); setToast({ kind: 'success', text: `Saved ${saved.name}` }) }} />
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
