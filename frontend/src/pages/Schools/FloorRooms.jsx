import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import {
  ChevronRight, ChevronLeft, ArrowLeft, MousePointer2, PenTool, Pencil, Trash2, Search, ClipboardList, CircleCheck,
  CircleAlert, Eye, MoreVertical, Info, SearchX, MapPinOff, ScanSearch, LoaderCircle,
  X, Plus, Layers, DoorOpen, FileText, Download,
} from 'lucide-react'
import { detectRooms } from '../../lib/roomDetection'
import { useConfirm } from '../../components/ui/useConfirm'
import { request, fmtDate, API_BASE } from '../../lib/api'
import PlanCanvas from './PlanCanvas'
import { ROOM_COLORS } from './roomColors'
import RoomInfoCard from './RoomInfoCard'
import AcmMaterialForm from './AcmMaterialForm'
import { AcmBadge } from './BuildingParts'
import { roomNumber } from './buildingUtils'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'
import './floorRooms.css'

const TOOLS = [
  { id: 'select', label: 'Select', icon: MousePointer2, hint: 'Click a room to select it; drag to pan' },
  { id: 'draw', label: 'Draw', icon: PenTool, hint: 'Click corners to draw a new room' },
  { id: 'edit', label: 'Edit', icon: Pencil, hint: 'Drag the corners of the selected room' },
  { id: 'delete', label: 'Delete', icon: Trash2, hint: 'Click a room to delete it' },
]
const STATUS_CLASS = { 'ACM Present': 'present', 'Assumed ACM': 'assumed', 'No ACM': 'none', 'Not Assessed': 'na', 'Not Yet Assessed': 'na' }

function MaterialCard({ m, roomId, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const inherited = m.roomId !== roomId
  return (
    <article className="fr-mat">
      <header>
        <strong>{m.name}</strong>
        <span className={`fr-dot ${STATUS_CLASS[m.acmStatus]}`}>{m.acmStatus}</span>
      </header>
      {m.scope !== 'room' && <span className="fr-scope">{m.scope === 'floor' ? 'Floor-level' : 'Building-level'}{inherited ? ` · from room ${m.roomNumber}` : ''}</span>}
      <dl>
        <div><dt>Type</dt><dd>{m.materialType}</dd></div>
        <div><dt>Location</dt><dd>{m.location}</dd></div>
        <div><dt>Quantity</dt><dd>{m.quantity.toLocaleString('en-US')} {m.unit}</dd></div>
        <div><dt>Added</dt><dd>{fmtDate(m.createdAt)}</dd></div>
        {open && (
          <>
            <div><dt>Condition</dt><dd>{m.condition}</dd></div>
            <div><dt>Friability</dt><dd>{m.friability}</dd></div>
            <div><dt>Classification</dt><dd>{m.classification}</dd></div>
            <div><dt>Risk</dt><dd className={`fr-risk ${m.riskRanking.toLowerCase()}`}>{m.riskRanking}</dd></div>
            <div><dt>Assessed</dt><dd>{fmtDate(`${m.assessmentDate}T12:00:00`)}</dd></div>
            {m.notes && <div className="fr-wide"><dt>Notes</dt><dd>{m.notes}</dd></div>}
            {m.relatedTracking?.length > 0 && <div className="fr-wide"><dt>Tracking</dt><dd>{m.relatedTracking.join(', ')}</dd></div>}
            {m.attachments.length > 0 && (
              <div className="fr-wide"><dt>Files</dt><dd className="fr-mat-files">
                {m.attachments.map((f) => <a key={f.id} href={`${API_BASE}/acm-materials/${m.id}/attachments/${f.id}`} target="_blank" rel="noopener noreferrer">{f.name}</a>)}
              </dd></div>
            )}
          </>
        )}
      </dl>
      <footer>
        <button type="button" onClick={() => setOpen((o) => !o)}><Eye size={13} />{open ? 'Less' : 'View'}</button>
        <button type="button" onClick={() => onEdit(m)}><Pencil size={13} />Edit</button>
        <span className="fr-menu-wrap">
          <button type="button" className="fr-more" onClick={() => setMenu((x) => !x)} aria-label={`More actions for ${m.name}`} aria-expanded={menu}><MoreVertical size={14} /></button>
          {menu && (
            <span className="fr-menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" className="danger" onClick={() => { setMenu(false); onDelete(m) }}><Trash2 size={13} />Delete material</button>
            </span>
          )}
        </span>
      </footer>
    </article>
  )
}

export default function FloorRooms() {
  const { schoolId, buildingId, floorId } = useParams()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('room')

  const [school, setSchool] = useState(null) // includes buildings
  const [floor, setFloor] = useState(null)
  const [rooms, setRooms] = useState(null)
  const [meta, setMeta] = useState(null)
  const [detail, setDetail] = useState(null) // selected room + materials
  const [error, setError] = useState(null)
  const [tool, setTool] = useState('select')
  const [query, setQuery] = useState('')
  const location = useLocation()
  // Opened from the ACM Inventory: start on the ACM form, new ({ add: true }) or editing ({ materialId })
  const [acmHandoff, setAcmHandoff] = useState(() => location.state?.acm ?? null)
  const [formMode, setFormMode] = useState({ kind: 'new', at: 0 }) // { kind: 'new' } | { kind: 'edit', material }
  const [tab, setTab] = useState(() => (acmHandoff ? 'acm' : 'details')) // room panel tab: 'details' | 'materials' | 'acm'
  const [confirm, confirmDialog] = useConfirm()
  const [focusKey, setFocusKey] = useState(0)
  // A message handed over from the Add / Edit Floor panel ("Added Second Floor — map its rooms below")
  const [toast, setToast] = useState(() => location.state?.toast ?? null)
  const [detectState, setDetectState] = useState(null) // null | 'running' | { ok, text }
  // Set when arriving from Add / Edit Floor with a new plan: detect its rooms once the floor has loaded
  const [autoDetect] = useState(() => Boolean(location.state?.detect))

  // OpenCV room detection on the floor's uploaded plan (tessera-style wall/doorway room finder);
  // detected outlines replace the current ones straight away (the server keeps rooms that have ACM records)
  const detect = async (f) => {
    setDetectState('running')
    try {
      const { shapes, tables, chairs, tablesAsRooms, ms } = await detectRooms(f.planUrl)
      if (!shapes.length) {
        setDetectState({ ok: false, text: 'No enclosed rooms found. Outline the rooms with the Draw tool.' })
        return
      }
      // Fresh ids per run, so a re-detected outline never takes over an earlier room's record by position
      const stamp = Date.now().toString(36)
      const body = {
        shapes: shapes.map((s, i) => ({ id: `D${stamp}-${i + 1}`, name: `Room ${i + 1}`, points: s.points, area: s.area })),
        tables,
      }
      const res = await request(`/floors/${f.id}`, { method: 'PUT', body })
      const list = await request(`/rooms?floorId=${encodeURIComponent(f.id)}`)
      setFloor(res.floor)
      setRooms(list.rooms)
      const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
      const furniture = tables.length
        ? ` ${plural(tables.length, 'table')} recognised by the ${plural(chairs, 'chair')} around them${tablesAsRooms ? ` (${tablesAsRooms} not counted as rooms)` : ''}.`
        : ''
      setDetectState({ ok: true, text: `Detected ${plural(shapes.length, 'room')} in ${(ms / 1000).toFixed(1)} s.${furniture} Select a room to name it and add ACM details.` })
    } catch (err) {
      setDetectState({ ok: false, text: `Detection failed: ${err.message}` })
    }
  }

  // Latest detect() for the load effect below (it should only re-run when the floor changes)
  const detectRef = useRef(detect)
  useEffect(() => { detectRef.current = detect })

  useEffect(() => {
    let cancelled = false
    Promise.all([request(`/schools/${schoolId}`), request(`/floors/${floorId}`), request(`/rooms?floorId=${encodeURIComponent(floorId)}`), request('/acm-materials/meta')])
      .then(([s, f, r, m]) => {
        if (cancelled) return
        setSchool(s); setFloor(f); setRooms(r.rooms); setMeta(m)
        // A newly uploaded plan replaces the old outlines (they belong to the previous drawing); rooms with ACM
        // records are kept by the server
        if (autoDetect && f.planUrl) detectRef.current(f)
      })
      .catch((err) => { if (!cancelled) setError(err.status === 404 ? 'notFound' : err.message) })
    return () => { cancelled = true }
  }, [schoolId, floorId, autoDetect])

  // Keep the selected room (a room just drawn, or one clicked on the plan) in view in the room list
  const listRef = useRef(null)
  useEffect(() => {
    listRef.current?.querySelector('li.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId, rooms])

  useEffect(() => {
    if (!selectedId) return undefined
    let cancelled = false
    request(`/rooms/${selectedId}`).then((d) => { if (!cancelled) setDetail(d) }).catch(() => { if (!cancelled) setDetail(null) })
    return () => { cancelled = true }
  }, [selectedId])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const select = useCallback((id) => {
    const next = new URLSearchParams(params)
    if (id) next.set('room', id); else next.delete('room')
    setParams(next, { replace: true })
    setFormMode({ kind: 'new', at: Date.now() })
  }, [params, setParams])

  const room = detail?.id === selectedId ? detail : null
  // Finish the ACM Inventory handoff once the room (and its materials) has loaded
  if (acmHandoff && room) {
    const material = acmHandoff.materialId && room.materials.find((m) => m.id === acmHandoff.materialId)
    setAcmHandoff(null)
    if (material) setFormMode({ kind: 'edit', material })
  }
  const building = school?.buildings.find((b) => b.id === buildingId)
  const term = query.trim().toLowerCase()
  // On a seeded sample plan drawing, outlines from the generated layout don't match the drawing: leave
  // them off the plan until the room is outlined on it (Draw / Detect Rooms)
  const samplePlan = Boolean(floor?.planImage?.sample)
  const planRooms = useMemo(() => (samplePlan && rooms ? rooms.map((r) => (r.layoutRoomId ? { ...r, polygon: null } : r)) : rooms), [samplePlan, rooms])
  const listed = useMemo(() => (planRooms ?? []).filter((r) => !term || [`rm-${r.number}`, r.number, r.name, r.type, r.acmStatus].some((v) => v?.toLowerCase().includes(term))), [planRooms, term])

  // Keep the list in step with a saved room (status/material count come back from the server)
  const applyRoom = (r) => setRooms((list) => list.map((x) => (x.id === r.id ? { ...x, ...r } : x)))
  const refreshRoom = async (id = selectedId) => {
    const [d, list] = await Promise.all([request(`/rooms/${id}`), request(`/rooms?floorId=${encodeURIComponent(floorId)}`)])
    setDetail(d)
    setRooms(list.rooms)
  }

  const createRoom = useCallback(async (polygon) => {
    try {
      // Next free number on this floor: G01… on the ground floor (0), 1xx on floor 1, 2xx on floor 2…
      const n = (rooms ?? []).reduce((m, r) => Math.max(m, Number(String(r.number).slice(-2)) || 0), 0) + 1
      const number = roomNumber(floor.number, n)
      const created = await request('/rooms', { method: 'POST', body: { floorId, polygon, number, name: `Room ${number}`, type: 'Other' } })
      setRooms((list) => [...list, created])
      setTool('select')
      select(created.id)
      setTab('details')
      setFocusKey(Date.now())
      setToast({ kind: 'success', text: `Room ${created.number} added — give it a name below.` })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    }
  }, [floorId, rooms, floor, select])

  const changePolygon = useCallback(async (id, polygon) => {
    setRooms((list) => list.map((r) => (r.id === id ? { ...r, polygon, layoutRoomId: null } : r)))
    try {
      await request(`/rooms/${id}`, { method: 'PUT', body: { polygon } })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    }
  }, [])

  const deleteRoom = useCallback(async (r) => {
    const ok = await confirm({
      title: `Delete room ${r.number}?`,
      message: `“${r.name}” and its outline will be removed from this floor. This can't be undone.`,
      detail: r.materialCount ? `Its ${r.materialCount} ACM material record${r.materialCount > 1 ? 's' : ''} will be deleted too.` : null,
      confirmLabel: 'Delete Room',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await request(`/rooms/${r.id}`, { method: 'DELETE' })
      setRooms((list) => list.filter((x) => x.id !== r.id))
      if (selectedId === r.id) select(null)
      setToast({ kind: 'success', text: `Deleted room ${r.number}` })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    }
  }, [selectedId, select, confirm])

  // Room panel: a fresh ACM form, and walking through the (filtered) room list
  const addAcm = () => { setFormMode({ kind: 'new', at: Date.now() }); setTab('acm') }
  const position = listed.findIndex((r) => r.id === selectedId)
  const step = (by) => { const next = listed[position + by]; if (next) select(next.id) }

  const deleteMaterial = async (m) => {
    const ok = await confirm({
      title: 'Delete ACM material?',
      message: `“${m.name}” will be removed from room ${m.roomNumber ?? room?.number ?? ''}. This can't be undone.`,
      detail: m.attachments.length ? `Its ${m.attachments.length} attachment${m.attachments.length > 1 ? 's' : ''} will be deleted too.` : null,
      confirmLabel: 'Delete Material',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await request(`/acm-materials/${m.id}`, { method: 'DELETE' })
      if (formMode.kind === 'edit' && formMode.material.id === m.id) setFormMode({ kind: 'new', at: Date.now() })
      await refreshRoom()
      setToast({ kind: 'success', text: `Deleted ${m.name}` })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    }
  }

  if (error === 'notFound') {
    return (
      <div className="coming-soon">
        <SearchX size={30} /><strong>Floor not found</strong>
        <span><Link to={`/schools/${schoolId}/buildings/${buildingId}/floors`}>Back to the building's floors</Link></span>
      </div>
    )
  }

  const floorsUrl = `/schools/${schoolId}/buildings/${buildingId}/floors`
  const activeTool = TOOLS.find((t) => t.id === tool)
  const counts = Object.fromEntries(Object.keys(ROOM_COLORS).map((s) => [s, (rooms ?? []).filter((r) => r.acmStatus === s).length]))
  const unplaced = (planRooms ?? []).filter((r) => !r.polygon).length

  return (
    <div className="fr-page">
      <nav className="sd-crumbs" aria-label="Breadcrumb">
        <Link to="/dashboard">Home</Link><ChevronRight size={13} />
        <Link to="/schools/list">Schools</Link><ChevronRight size={13} />
        <Link to={`/schools/${schoolId}`}>{school?.name ?? '…'}</Link><ChevronRight size={13} />
        <Link to={`/schools/${schoolId}/buildings`}>Buildings</Link><ChevronRight size={13} />
        <Link to={floorsUrl}>{building?.name ?? '…'}</Link><ChevronRight size={13} />
        <span>{floor?.name ?? '…'}</span><ChevronRight size={13} />
        <span aria-current="page">{room ? `Room ${room.number}` : 'Rooms & ACM'}</span>
      </nav>

      <div className="c-head">
        <div className="sd-title">
          <span className="sd-icon"><ClipboardList size={22} /></span>
          <div>
            <h1>{room ? 'Add ACM Material – Room Mapping' : 'Floor Plan & ACM Mapping'}</h1>
            <p><span>{building?.name ?? '…'} · {floor?.name ?? '…'}</span><span className="sd-sep">|</span><span>{school?.name ?? ''}</span></p>
          </div>
        </div>
        <Link className="u-btn u-btn-outline" to={floorsUrl}><ArrowLeft size={15} />Back to Floors</Link>
      </div>

      {error && error !== 'notFound' && <div className="u-banner">Couldn't load this floor ({error}).</div>}

      <div className={`fr-layout${room ? ' has-room' : ''}`}>
        {/* Left: room list + plan */}
        <div className="fr-left">
          <section className="u-card fr-card fr-plan">
            <header className="fr-card-head"><h2>Floor Plan – {building?.name ?? '…'}, {floor?.name ?? '…'}</h2></header>
            <div className="fr-tools" role="toolbar" aria-label="Floor plan tools">
              {TOOLS.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => setTool(id)}
                  disabled={id === 'edit' && !room?.polygon}><Icon size={14} />{label}</button>
              ))}
            </div>
            {floor?.planUrl && (
              <div className="fr-detect-tools">
                <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={detectState === 'running'} onClick={() => detect(floor)}>
                  {detectState === 'running' ? <><LoaderCircle size={13} className="fp-spin" />Detecting…</> : <><ScanSearch size={13} />Detect Rooms</>}
                </button>
                {/* The original PDF the plan was rendered from (stored on the server) */}
                {floor.planSourceUrl && (
                  <>
                    <a className="u-btn u-btn-outline u-btn-sm" href={`${API_BASE.replace(/\/api$/, '')}${floor.planSourceUrl}`} target="_blank" rel="noopener noreferrer"
                      title={`${floor.planSource.name}${floor.planSource.pages > 1 ? ` – page ${floor.planSource.page} of ${floor.planSource.pages} is the plan` : ''}`}><FileText size={13} />Original PDF</a>
                    <a className="u-btn u-btn-ghost u-btn-sm" href={`${API_BASE.replace(/\/api$/, '')}${floor.planSourceUrl}&download=1`} aria-label="Download the original PDF"><Download size={13} /></a>
                  </>
                )}
              </div>
            )}
            <div className="fr-plan-body">
              {/* Room list, beside the plan */}
              <aside className="fr-rooms" aria-label="Rooms on this floor">
                <header>
                  <strong>Rooms {rooms?.length ?? '…'}</strong>
                  {unplaced > 0 && <span className="fr-unplaced" title="Rooms not outlined on the plan"><MapPinOff size={12} />{unplaced}</span>}
                </header>
                <label className="u-search fr-rooms-search"><Search size={14} />
                  <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search rooms" />
                </label>
                <ul className="fr-room-list" ref={listRef}>
                  {listed.map((r) => {
                    return (
                      <li key={r.id} className={r.id === selectedId ? 'selected' : ''}>
                        <button type="button" className="fr-room-pick" aria-pressed={r.id === selectedId} onClick={() => select(r.id)}
                          aria-label={`Room ${r.number}, ${r.name}, ${r.acmStatus}${r.polygon ? '' : ', not on plan'}`}
                          title={`${r.name} · ${r.acmStatus}${r.polygon ? '' : ' · not on plan — use Draw to place it'}`}>
                          <i className={`fr-dot ${STATUS_CLASS[r.acmStatus]}`} />
                          <span className={`fr-num${r.polygon ? '' : ' unplaced'}`}>RM-{r.number}</span>
                        </button>
                        <button type="button" className="fr-room-del" onClick={() => deleteRoom(r)} aria-label={`Delete room ${r.number} ${r.name}`} title="Delete room">
                          <Trash2 size={13} />
                        </button>
                      </li>
                    )
                  })}
                  {rooms && !listed.length && <li className="fr-rooms-empty">{rooms.length ? 'No match' : 'No rooms yet'}</li>}
                </ul>
              </aside>

              {floor && rooms ? (
                <div className="fr-plan-wrap">
                <PlanCanvas layout={floor.layout} imageUrl={floor.planUrl} rooms={planRooms} tables={floor.tables} selectedId={selectedId} mode={tool} height={640}
                  onSelect={select} onDelete={deleteRoom} onCreate={createRoom} onChangePolygon={changePolygon} />
                {detectState === 'running' && <div className="fr-detecting"><LoaderCircle size={22} className="fp-spin" /><strong>Detecting rooms…</strong><span>OpenCV is tracing the walls on the plan</span></div>}
                </div>
              ) : <div className="fr-loading fr-plan-wrap">Loading floor plan…</div>}
            </div>
            {detectState && detectState !== 'running' && <p className={`fr-detect-msg ${detectState.ok ? 'ok' : 'warn'}`}>{detectState.text}</p>}
            {floor?.planUrl && planRooms && !planRooms.some((r) => r.polygon) && !detectState && <p className="fr-detect-msg">{rooms.length ? `${rooms.length} room${rooms.length === 1 ? '' : 's'} aren’t outlined on this plan yet — select one and use ` : 'No rooms on this plan yet — click '}<b>{rooms.length ? 'Draw' : 'Detect Rooms'}</b>{rooms.length ? ' to place it.' : ', or outline them with '}{!rooms.length && <b>Draw</b>}{!rooms.length && '.'}</p>}
            <p className="fr-tool-hint">{activeTool.hint}{tool === 'edit' && !room?.polygon ? ' — select a room first' : ''}</p>
            <div className="fr-legend">
              {Object.entries(ROOM_COLORS).map(([s, c]) => (
                <span key={s}><i style={{ background: c.fill, borderColor: c.stroke }} />{s} ({counts[s] ?? 0})</span>
              ))}
              {floor?.tables?.length > 0 && <span><i className="fr-legend-table" />Table ({floor.tables.length})</span>}
            </div>
          </section>
        </div>

        {/* Right: the selected room's panel — details, its ACM materials, and the add / edit ACM form */}
        <aside className="fr-panel-col">
          {!selectedId && (
            <div className="u-card fr-card fr-pick">
              <ClipboardList size={28} />
              <strong>Select a room to map ACM</strong>
              <span>Click a room on the plan or in the room list, or use <b>Draw</b> to outline a room the detector missed.</span>
              {floor?.planImage && <span className="u-muted u-small">Plan: {floor.planSource ? `${floor.planSource.name}${floor.planSource.pages > 1 ? ` (page ${floor.planSource.page} of ${floor.planSource.pages})` : ''}` : floor.planImage.name}</span>}
            </div>
          )}
          {selectedId && !room && <div className="u-card fr-card fr-loading">Loading room…</div>}
          {room && meta && (
            <section className="u-card fr-panel" aria-label={`Room ${room.number}`}>
              <header className="fr-panel-head">
                <span className="fr-panel-num">{room.number}</span>
                <div className="fr-panel-title">
                  <strong>{room.name}</strong>
                  <span>{room.type} · {floor?.name} · {building?.name}</span>
                </div>
                <AcmBadge status={room.acmStatus} />
                <div className="fr-panel-nav">
                  <button type="button" onClick={() => step(-1)} disabled={position <= 0} aria-label="Previous room" title="Previous room"><ChevronLeft size={16} /></button>
                  <button type="button" onClick={() => step(1)} disabled={position < 0 || position >= listed.length - 1} aria-label="Next room" title="Next room"><ChevronRight size={16} /></button>
                  <button type="button" onClick={() => select(null)} aria-label="Close room panel" title="Close"><X size={16} /></button>
                </div>
              </header>

              <div className="fr-tabs" role="tablist" aria-label="Room panel">
                <button type="button" role="tab" id="fr-tab-details" aria-selected={tab === 'details'} aria-controls="fr-pane-details" onClick={() => setTab('details')}>
                  <DoorOpen size={14} />Room Details
                </button>
                <button type="button" role="tab" id="fr-tab-materials" aria-selected={tab === 'materials'} aria-controls="fr-pane-materials" onClick={() => setTab('materials')}>
                  <Layers size={14} />ACM Materials<span className="fr-count-badge">{room.materials.length}</span>
                </button>
                <button type="button" role="tab" id="fr-tab-acm" aria-selected={tab === 'acm'} aria-controls="fr-pane-acm" onClick={() => setTab('acm')}>
                  {formMode.kind === 'edit' ? <><Pencil size={14} />Edit ACM</> : <><Plus size={14} />Add ACM</>}
                </button>
              </div>

              {/* All tabs stay mounted, so unsaved input survives switching between them */}
              <div className="fr-panel-body">
                <div role="tabpanel" id="fr-pane-details" aria-labelledby="fr-tab-details" hidden={tab !== 'details'}>
                  <RoomInfoCard key={room.id} room={room} meta={meta} focusKey={focusKey} onToast={setToast} embedded
                    place={{ school: school?.name ?? '', building: `${building?.name ?? ''} (${building?.code ?? ''})`, floor: floor?.name ?? '' }}
                    onSaved={(r) => { setDetail((d) => ({ ...d, ...r })); applyRoom(r) }} />
                  <div className="fr-next">
                    <span>{room.materials.length ? `${room.materials.length} ACM material${room.materials.length > 1 ? 's' : ''} recorded` : 'No ACM recorded for this room yet'}</span>
                    <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={addAcm}><Plus size={13} />Add ACM</button>
                  </div>
                </div>

                <div role="tabpanel" id="fr-pane-materials" aria-labelledby="fr-tab-materials" hidden={tab !== 'materials'} className="fr-pane fr-materials">
                  <div className="fr-materials-head">
                    <span className="fr-room-status">Room status: <AcmBadge status={room.acmStatus} /></span>
                    <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={addAcm}><Plus size={13} />Add ACM Material</button>
                  </div>
                  {!room.materials.length && (
                    <div className="fr-materials-empty">
                      <Info size={18} />
                      <strong>No ACM materials recorded</strong>
                      <span>Add what was found in this room — or record “No ACM” after an assessment.</span>
                    </div>
                  )}
                  {room.materials.map((m) => (
                    <MaterialCard key={m.id} m={m} roomId={room.id} onDelete={deleteMaterial}
                      onEdit={(x) => { setFormMode({ kind: 'edit', material: x }); setTab('acm') }} />
                  ))}
                </div>

                <div role="tabpanel" id="fr-pane-acm" aria-labelledby="fr-tab-acm" hidden={tab !== 'acm'}>
                  <AcmMaterialForm key={`${room.id}-${formMode.kind}-${formMode.material?.id ?? formMode.at}`} room={room} meta={meta} embedded
                    editing={formMode.kind === 'edit' ? formMode.material : null} onToast={setToast}
                    onCancel={() => { setFormMode({ kind: 'new', at: Date.now() }); setTab('materials') }}
                    onSaved={async (count, { editing, quiet }) => {
                      await refreshRoom(room.id)
                      if (!quiet && count) setToast({ kind: 'success', text: editing ? 'ACM material updated' : `Added ${count} ACM material${count > 1 ? 's' : ''} to room ${room.number}` })
                    }} />
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>

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
