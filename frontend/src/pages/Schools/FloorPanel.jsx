import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Info, Upload, Trash2, MapPin, Pencil, ImageOff, TriangleAlert, ScanSearch, LoaderCircle } from 'lucide-react'
import { detectRooms, DETECTION_PRESETS } from '../../lib/roomDetection'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import FloorPlan from './FloorPlan'
import { AcmBadge } from './BuildingParts'
import { MAX_FLOORS, ACM_STATUSES, ACM_CONDITIONS, FLOOR_NAMES, fmtNum } from './buildingUtils'

const PLAN_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_PLAN_BYTES = 5 * 1024 * 1024

async function uploadPlan(floorId, file) {
  const res = await fetch(`/api/floors/${floorId}/plan?name=${encodeURIComponent(file.name)}`, {
    method: 'POST', headers: { 'Content-Type': file.type }, body: file,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

/**
 * Right-hand panel to view, add or edit a floor and label rooms on its plan.
 * mode: 'view' | 'add' | 'edit'
 */
export default function FloorPanel({ mode, floor, buildingId: initialBuildingId, buildings, floors: initialFloors, initialLabelId, onClose, onEdit, onSaved }) {
  const readOnly = mode === 'view'
  const isNew = mode === 'add'
  const [form, setForm] = useState(() => ({
    buildingId: floor?.buildingId ?? initialBuildingId,
    number: floor?.number ?? null,
    name: floor?.name ?? '',
    nameTouched: Boolean(floor),
    rooms: String(floor?.rooms ?? ''),
    acmRooms: String(floor?.acmRooms || ''),
    acmStatus: floor?.acmStatus ?? 'No ACM',
  }))
  const [labels, setLabels] = useState(() => floor?.labels ?? [])
  const [selectedId, setSelectedId] = useState(initialLabelId ?? null)
  const [shapes, setShapes] = useState(() => floor?.shapes ?? [])
  const [preset, setPreset] = useState('standard')
  const [detecting, setDetecting] = useState(null) // null | 'running' | { ok, text }
  const [planFile, setPlanFile] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [layoutSeed] = useState(() => `${initialBuildingId}-${Math.random().toString(36).slice(2, 10)}`)
  const [siblings, setSiblings] = useState({ buildingId: initialBuildingId, floors: initialFloors })
  const [preview, setPreview] = useState(null) // { key, layout }
  const fileRef = useRef(null)
  const nameRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && e.target.tagName !== 'INPUT') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Floors already in the chosen building (to block used floor numbers)
  useEffect(() => {
    if (siblings.buildingId === form.buildingId) return undefined
    let cancelled = false
    request(`/floors?buildingId=${encodeURIComponent(form.buildingId)}`)
      .then((d) => { if (!cancelled) setSiblings({ buildingId: form.buildingId, floors: d.floors }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.buildingId, siblings.buildingId])

  const siblingFloors = siblings.buildingId === form.buildingId ? siblings.floors : null
  const taken = new Set((siblingFloors ?? []).filter((f) => f.id !== floor?.id).map((f) => f.number))
  const free = Array.from({ length: MAX_FLOORS }, (_, i) => i + 1).filter((n) => !taken.has(n))
  const number = form.number && !taken.has(form.number) ? form.number : (floor?.number ?? free[0] ?? null)
  const name = form.nameTouched ? form.name : (number ? FLOOR_NAMES[number - 1] : '')
  const full = isNew && siblingFloors && !free.length

  // Sample layout: the saved floor's, or a preview for a new one
  const previewKey = isNew && number ? `${layoutSeed}|${number}` : null
  useEffect(() => {
    if (!previewKey) return undefined
    let cancelled = false
    const [seed, n] = previewKey.split('|')
    request(`/floors/layout-preview?seed=${encodeURIComponent(seed)}&number=${n}`)
      .then((layout) => { if (!cancelled) setPreview({ key: previewKey, layout }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [previewKey])
  const layout = isNew ? (preview?.key === previewKey ? preview.layout : null) : floor.layout

  const fileUrl = useMemo(() => (planFile ? URL.createObjectURL(planFile) : null), [planFile])
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])
  const imageUrl = fileUrl ?? (!removeImage ? floor?.planUrl : null) ?? null

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const selected = labels.find((l) => l.id === selectedId) ?? null
  const updateLabel = (patch) => setLabels((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)))

  const addLabel = ({ x, y, roomId, name: roomName }) => {
    const status = form.acmStatus
    const label = {
      id: `L${Date.now().toString(36)}`,
      roomId,
      name: roomName || `Room ${labels.length + 1}`,
      x,
      y,
      acmStatus: status,
      material: '',
      condition: status === 'Assumed ACM' ? 'Not assessed' : 'Good',
    }
    setLabels((ls) => [...ls, label])
    setSelectedId(label.id)
    setTimeout(() => nameRef.current?.select(), 0)
  }

  const pickFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!PLAN_TYPES.includes(file.type)) { setErrors((er) => ({ ...er, plan: 'Choose a PNG, JPEG or WebP image' })); return }
    if (file.size > MAX_PLAN_BYTES) { setErrors((er) => ({ ...er, plan: 'The image must be 5 MB or smaller' })); return }
    setErrors((er) => ({ ...er, plan: undefined }))
    setPlanFile(file)
    setRemoveImage(false)
    setShapes([]) // detected rooms belong to the previous image
    setDetecting(null)
  }

  const runDetection = async () => {
    setDetecting('running')
    try {
      const { shapes: found, ms } = await detectRooms(planFile ?? imageUrl, preset)
      setShapes(found)
      setDetecting({
        ok: found.length > 0,
        text: found.length
          ? `Detected ${found.length} room${found.length > 1 ? 's' : ''} in ${ms} ms. Click a room to label it.`
          : 'No enclosed rooms found. Try another wall setting, or use a plan with clear dark walls.',
      })
    } catch (err) {
      setDetecting({ ok: false, text: `Detection failed: ${err.message}` })
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (readOnly) return
    setSaving(true)
    setErrors({})
    const body = {
      buildingId: form.buildingId, number, name, rooms: form.rooms, acmStatus: form.acmStatus,
      acmRooms: form.acmStatus === 'No ACM' ? 0 : form.acmRooms, labels,
      shapes: imageUrl ? shapes : [],
      ...(isNew ? { layoutSeed } : {}),
    }
    try {
      const res = isNew
        ? await request('/floors', { method: 'POST', body })
        : await request(`/floors/${floor.id}`, { method: 'PUT', body })
      let saved = res.floor
      let warning = null
      try {
        if (planFile) saved = await uploadPlan(saved.id, planFile)
        else if (removeImage && saved.planUrl) saved = await request(`/floors/${saved.id}/plan`, { method: 'DELETE' })
      } catch (err) {
        warning = `Floor saved, but the plan image wasn't (${err.message})`
      }
      onSaved(saved, res.building, isNew, warning)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
      setSaving(false)
    }
  }

  const input = (k, props = {}) => ({
    className: `u-input${errors[k] ? ' invalid' : ''}`, value: form[k], disabled: readOnly,
    onChange: (ev) => set(k)(ev.target.value), ...props,
  })
  const err = (k) => errors[k] && <em>{errors[k]}</em>
  const building = buildings.find((b) => b.id === form.buildingId)
  const noAcm = form.acmStatus === 'No ACM'

  return (
    <aside className="u-card sch-details fp-panel" aria-label={readOnly ? 'Floor details' : isNew ? 'Add floor' : 'Edit floor'}>
      <form onSubmit={submit} noValidate className="fp-form">
        <header className="u-card-head">
          <h2>{readOnly ? `${floor.name}` : isNew ? 'Add Floor' : `Edit ${floor.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>

        <h3 className="fp-h">Floor Information</h3>
        {readOnly ? (
          <dl className="cd-facts">
            <div className="cd-row"><dt>Building</dt><dd>{building?.name} ({building?.code})</dd></div>
            <div className="cd-row"><dt>Floor Number</dt><dd>{floor.number}</dd></div>
            <div className="cd-row"><dt>Total Rooms</dt><dd>{fmtNum(floor.rooms)}</dd></div>
            <div className="cd-row"><dt>ACM Rooms</dt><dd>{fmtNum(floor.acmRooms)}</dd></div>
            <div className="cd-row"><dt>Status</dt><dd><AcmBadge status={floor.acmStatus} /></dd></div>
          </dl>
        ) : (
          <>
            <div className="fp-grid">
              <div className="uf-field fp-wide">
                <span>Building *</span>
                {isNew ? (
                  <SearchSelect variant="field" label="Building" value={form.buildingId} searchable={buildings.length > 6}
                    onChange={(v) => setForm((f) => ({ ...f, buildingId: v, number: null }))}
                    options={buildings.map((b) => ({ value: b.id, label: `${b.name} (${b.code})`, meta: `${b.floors}/${MAX_FLOORS} floors` }))} />
                ) : <input className="u-input" value={`${building?.name} (${building?.code})`} disabled />}
              </div>
              <div className="uf-field">
                <span id="fp-num">Floor Number * <small className="bf-max">max {MAX_FLOORS}</small></span>
                <div className="bf-seg" role="radiogroup" aria-labelledby="fp-num">
                  {Array.from({ length: MAX_FLOORS }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={number === n} disabled={taken.has(n)}
                      title={taken.has(n) ? `Floor ${n} already exists` : undefined}
                      className={number === n ? 'active' : ''} onClick={() => set('number')(n)}>{n}</button>
                  ))}
                </div>
                {err('number')}
              </div>
              <label className="uf-field"><span>Floor Name *</span>
                <input {...input('name', { value: name, onChange: (ev) => setForm((f) => ({ ...f, name: ev.target.value, nameTouched: true })) })} />{err('name')}
              </label>
              <label className="uf-field"><span>Total Rooms *</span><input {...input('rooms', { inputMode: 'numeric' })} />{err('rooms')}</label>
              <label className="uf-field"><span>ACM Rooms {noAcm ? '' : '*'}</span>
                <input {...input('acmRooms', { inputMode: 'numeric', disabled: noAcm, value: noAcm ? '0' : form.acmRooms })} />{err('acmRooms')}
              </label>
              <div className="uf-field fp-wide">
                <span id="fp-acm">ACM Status *</span>
                <div className="bf-seg" role="radiogroup" aria-labelledby="fp-acm">
                  {ACM_STATUSES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={form.acmStatus === s}
                      className={form.acmStatus === s ? 'active' : ''} onClick={() => set('acmStatus')(s)}>{s}</button>
                  ))}
                </div>
                {err('acmStatus')}
              </div>
            </div>
            {full && <p className="b-note warn"><TriangleAlert size={14} />{building?.name} already has {MAX_FLOORS} floors, the maximum. Choose another building or edit an existing floor.</p>}
          </>
        )}

        <h3 className="fp-h">Floor Plan &amp; Labeling</h3>
        {!readOnly && (
          <p className="b-note"><Info size={14} />Click on the floor plan to add or label rooms; drag a pin to move it. You can also upload a floor plan image.</p>
        )}
        <div className="fp-plan-tools">
          <span className="u-muted u-small">
            {imageUrl ? (planFile ? planFile.name : floor?.planImage?.name ?? 'Uploaded plan') : 'Sample layout (schematic)'}
          </span>
          {!readOnly && (
            <span className="fp-plan-btns">
              <input ref={fileRef} type="file" accept={PLAN_TYPES.join(',')} hidden onChange={pickFile} />
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />{imageUrl ? 'Replace Image' : 'Upload Plan'}</button>
              {imageUrl && (
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { setPlanFile(null); setRemoveImage(true); setShapes([]); setDetecting(null) }}><ImageOff size={13} />Use Sample</button>
              )}
            </span>
          )}
        </div>
        {errors.plan && <p className="uf-error">{errors.plan}</p>}

        {imageUrl && !readOnly && (
          <div className="fp-detect">
            <div className="fp-detect-row">
              <span className="fp-detect-title"><ScanSearch size={15} />Room Detection <small>OpenCV</small></span>
              <SearchSelect variant="field" label="Wall style" value={preset} onChange={setPreset} searchable={false}
                options={Object.entries(DETECTION_PRESETS).map(([value, p]) => ({ value, label: p.label }))} />
              <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={detecting === 'running'} onClick={runDetection}>
                {detecting === 'running' ? <><LoaderCircle size={13} className="fp-spin" />Detecting…</> : <><ScanSearch size={13} />{shapes.length ? 'Detect Again' : 'Detect Rooms'}</>}
              </button>
            </div>
            {detecting === 'running' && <p className="u-muted u-small fp-detect-msg">Loading OpenCV (first time only) and tracing walls…</p>}
            {detecting && detecting !== 'running' && <p className={`fp-detect-msg ${detecting.ok ? 'ok' : 'warn'}`}>{detecting.text}</p>}
            {shapes.length > 0 && (
              <div className="fp-detect-row">
                <span className="u-muted u-small">{shapes.length} room shape{shapes.length > 1 ? 's' : ''} on this plan</span>
                {Number(form.rooms) !== shapes.length && (
                  <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => set('rooms')(String(shapes.length))}>Set Total Rooms to {shapes.length}</button>
                )}
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { setShapes([]); setDetecting(null) }}><Trash2 size={13} />Clear Shapes</button>
              </div>
            )}
          </div>
        )}

        <FloorPlan layout={layout} imageUrl={imageUrl} labels={labels} shapes={imageUrl ? shapes : []} selectedId={selectedId} editable={!readOnly && !full}
          onAdd={addLabel} onSelect={setSelectedId}
          onMove={(id, x, y) => setLabels((ls) => ls.map((l) => (l.id === id ? { ...l, x, y } : l)))} />

        <div className="fp-labels">
          <div className="fp-labels-head">
            <span><MapPin size={14} /> Labelled Rooms ({labels.length})</span>
            {!readOnly && selected && (
              <button type="button" className="u-btn u-btn-outline u-btn-sm fp-remove" onClick={() => { setLabels((ls) => ls.filter((l) => l.id !== selectedId)); setSelectedId(null) }}>
                <Trash2 size={13} />Remove Label
              </button>
            )}
          </div>
          {labels.length ? (
            <div className="fp-chips">
              {labels.map((l) => (
                <button key={l.id} type="button" className={`fp-chip ${l.acmStatus === 'ACM Present' ? 'present' : l.acmStatus === 'Assumed ACM' ? 'assumed' : 'none'}${l.id === selectedId ? ' active' : ''}`}
                  onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}>{l.name}</button>
              ))}
            </div>
          ) : <p className="u-muted u-small fp-empty">{readOnly ? 'No rooms labelled on this floor.' : 'No rooms labelled yet — click a room on the plan.'}</p>}

          {selected && (
            readOnly ? (
              <dl className="cd-facts fp-label-facts">
                <div className="cd-row"><dt>Room</dt><dd>{selected.name}</dd></div>
                <div className="cd-row"><dt>ACM Status</dt><dd><AcmBadge status={selected.acmStatus} /></dd></div>
                <div className="cd-row"><dt>Material</dt><dd>{selected.material || '—'}</dd></div>
                <div className="cd-row"><dt>Condition</dt><dd>{selected.condition}</dd></div>
              </dl>
            ) : (
              <div className="fp-label-edit">
                <label className="uf-field fp-wide"><span>Room Label</span>
                  <input ref={nameRef} className="u-input" value={selected.name} maxLength={60} onChange={(e) => updateLabel({ name: e.target.value })} />
                </label>
                <div className="uf-field">
                  <span>ACM Status</span>
                  <SearchSelect variant="field" label="Label ACM status" value={selected.acmStatus} searchable={false}
                    onChange={(v) => updateLabel({ acmStatus: v, condition: v === 'Assumed ACM' ? 'Not assessed' : selected.condition === 'Not assessed' ? 'Good' : selected.condition })}
                    options={ACM_STATUSES.map((s) => ({ value: s, label: s }))} />
                </div>
                <div className="uf-field">
                  <span>Condition</span>
                  <SearchSelect variant="field" label="Material condition" value={selected.condition} searchable={false} onChange={(v) => updateLabel({ condition: v })}
                    options={ACM_CONDITIONS.map((c) => ({ value: c, label: c }))} />
                </div>
                <label className="uf-field fp-wide"><span>Material (optional)</span>
                  <input className="u-input" value={selected.material} maxLength={80} placeholder="e.g. 9&quot;x9&quot; floor tile, pipe insulation"
                    onChange={(e) => updateLabel({ material: e.target.value })} />
                </label>
              </div>
            )
          )}
          {errors.labels && <p className="uf-error">{errors.labels}</p>}
        </div>

        {errors.form && <p className="uf-error">{errors.form}</p>}
        <footer className="fp-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {readOnly
            ? <button type="button" className="u-btn u-btn-primary" onClick={() => onEdit(floor)}><Pencil size={14} />Edit Floor</button>
            : <button type="submit" className="u-btn u-btn-primary" disabled={saving || full || !number}>{saving ? 'Saving…' : 'Save Floor'}</button>}
        </footer>
      </form>
    </aside>
  )
}
