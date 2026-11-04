import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { X, Info, Upload, ImageOff, LoaderCircle, FileUp } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, API_BASE } from '../../lib/api'
import { floorName } from './buildingUtils'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_PLAN_BYTES = 5 * 1024 * 1024 // server limit for the stored plan image
const MAX_PDF_BYTES = 25 * 1024 * 1024

async function uploadPlan(floorId, file) {
  const res = await fetch(`${API_BASE}/floors/${floorId}/plan?name=${encodeURIComponent(file.name)}`, {
    method: 'POST', headers: { 'Content-Type': file.type }, body: file,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

/**
 * Right-hand panel to add or edit a floor: building, floor number (0 = ground) and name, plus the floor plan
 * (PDF or image). Rooms are detected (OpenCV) on the floor plan screen; room and ACM counts come from those rooms.
 * mode: 'add' | 'edit'
 * From the district Floors screen pass `schools` (+ all `buildings`, optional `defaultSchoolId`): the panel then
 * starts with a school picker and lists that school's buildings.
 */
export default function FloorPanel({ mode, floor, buildingId: initialBuildingId, buildings: allBuildings, floors: initialFloors, schools, defaultSchoolId, onClose, onSaved }) {
  const isNew = mode === 'add'
  const pickSchool = Boolean(schools) && isNew
  const [schoolId, setSchoolId] = useState(() => allBuildings.find((b) => b.id === initialBuildingId)?.schoolId ?? defaultSchoolId ?? '')
  const buildings = pickSchool ? allBuildings.filter((b) => b.schoolId === schoolId) : allBuildings
  const [form, setForm] = useState(() => ({
    buildingId: floor?.buildingId ?? initialBuildingId,
    number: floor ? String(floor.number) : null, // null = use the next free number
    name: floor?.name ?? '',
    nameTouched: Boolean(floor),
  }))
  const [converting, setConverting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [planFile, setPlanFile] = useState(null)
  const [planSource, setPlanSource] = useState(null) // original file name when converted from PDF
  const [removeImage, setRemoveImage] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  // Floors of the chosen building; loaded below unless the caller passed them
  const [siblings, setSiblings] = useState({ buildingId: initialFloors ? initialBuildingId : null, floors: initialFloors })
  const fileRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && e.target.tagName !== 'INPUT') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Floors already in the chosen building (used floor numbers + the next free one)
  useEffect(() => {
    if (!form.buildingId || siblings.buildingId === form.buildingId) return undefined
    let cancelled = false
    request(`/floors?buildingId=${encodeURIComponent(form.buildingId)}`)
      .then((d) => { if (!cancelled) setSiblings({ buildingId: form.buildingId, floors: d.floors }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [form.buildingId, siblings.buildingId])

  const siblingFloors = siblings.buildingId === form.buildingId ? siblings.floors : null
  const others = (siblingFloors ?? []).filter((f) => f.id !== floor?.id)
  const taken = new Set(others.map((f) => f.number))
  const nextFree = others.length ? Math.max(...others.map((f) => f.number)) + 1 : 0
  const numberText = form.number ?? String(nextFree)
  const number = /^\d+$/.test(numberText) ? Number(numberText) : NaN
  const numberError = !Number.isInteger(number) ? 'Enter a whole number (0 = ground floor)'
    : taken.has(number) ? `Floor ${number} already exists in this building` : null
  const name = form.nameTouched ? form.name : floorName(number)

  const fileUrl = useMemo(() => (planFile ? URL.createObjectURL(planFile) : null), [planFile])
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])
  const imageUrl = fileUrl ?? (!removeImage ? floor?.planUrl : null) ?? null

  // PDF (page 1 rendered to PNG) or image → thumbnail; rooms are detected on the floor plan screen after saving
  const takeFile = async (input) => {
    let file = input
    if (!file) return
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isPdf && !IMAGE_TYPES.includes(file.type)) { setErrors((er) => ({ ...er, plan: 'Choose a PDF, PNG, JPEG or WebP file' })); return }
    if (file.size > (isPdf ? MAX_PDF_BYTES : MAX_PLAN_BYTES)) { setErrors((er) => ({ ...er, plan: `The file must be ${isPdf ? 25 : 5} MB or smaller` })); return }
    setErrors((er) => ({ ...er, plan: undefined }))
    let source = null
    if (isPdf) {
      setConverting(true)
      try {
        const { pdfToPlanImage } = await import('../../lib/pdfPlan')
        const out = await pdfToPlanImage(file)
        source = out.pages > 1 ? `${file.name} — page 1 of ${out.pages}` : file.name
        file = out.file
      } catch (err) {
        setErrors((er) => ({ ...er, plan: `Couldn't read the PDF (${err.message})` }))
        setConverting(false)
        return
      }
      setConverting(false)
      if (file.size > MAX_PLAN_BYTES) { setErrors((er) => ({ ...er, plan: 'The rendered plan is larger than 5 MB; try a simpler PDF or export it as an image' })); return }
    }
    setPlanSource(source)
    setPlanFile(file)
    setRemoveImage(false)
  }

  const removePlan = () => { setPlanFile(null); setPlanSource(null); setRemoveImage(true) }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.buildingId) { setErrors({ buildingId: pickSchool && !schoolId ? 'Choose a school, then its building' : 'Choose a building' }); return }
    if (numberError) { setErrors({ number: numberError }); return }
    setSaving(true)
    setErrors({})
    // A new or removed plan makes earlier detected room outlines obsolete; otherwise keep them
    const body = { buildingId: form.buildingId, number, name, ...(planFile || removeImage ? { shapes: [] } : {}) }
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
      // detect: the floor plan screen runs room detection on the new plan
      onSaved(saved, res.building, isNew, warning, { detect: Boolean(planFile) && !warning })
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
      setSaving(false)
    }
  }

  const building = buildings.find((b) => b.id === form.buildingId)
  const shownNumberError = errors.number ?? (form.number !== null ? numberError : null)

  return (
    <aside className="u-card sch-details fp-panel" aria-label={isNew ? 'Add floor' : 'Edit floor'}>
      <form onSubmit={submit} noValidate className="fp-form">
        <header className="u-card-head">
          <h2>{isNew ? 'Add Floor' : `Edit ${floor.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>

        <h3 className="fp-h">Floor Information</h3>
        <div className="fp-grid">
          {pickSchool && (
            <div className="uf-field fp-wide">
              <span>School *</span>
              <SearchSelect variant="field" label="School" value={schoolId} searchPlaceholder="Search schools…"
                onChange={(v) => {
                  // the school's first building is picked straight away
                  setSchoolId(v)
                  setForm((f) => ({ ...f, buildingId: allBuildings.find((b) => b.schoolId === v)?.id ?? '', number: null }))
                  setErrors((x) => ({ ...x, buildingId: undefined }))
                }}
                options={[{ value: '', label: 'Select a school' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
          )}
          <div className="uf-field fp-wide">
            <span>Building *</span>
            {isNew ? (
              pickSchool && schoolId && !buildings.length
                ? <p className="u-muted u-small fp-nobld">This school has no buildings yet. <Link to="/schools/buildings">Add a building</Link> first.</p>
                : <SearchSelect variant="field" label="Building" value={form.buildingId ?? ''} searchable={buildings.length > 6}
                  onChange={(v) => { setForm((f) => ({ ...f, buildingId: v, number: null })); setErrors((x) => ({ ...x, buildingId: undefined })) }}
                  options={[...(form.buildingId ? [] : [{ value: '', label: pickSchool && !schoolId ? 'Choose a school first' : 'Select a building' }]),
                    ...buildings.map((b) => ({ value: b.id, label: `${b.name} (${b.code})`, meta: `${b.floors} floor${b.floors === 1 ? '' : 's'}` }))]} />
            ) : <input className="u-input" value={`${building?.name} (${building?.code})`} disabled />}
            {errors.buildingId && <em>{errors.buildingId}</em>}
          </div>
          <label className="uf-field">
            <span>Floor Number * <small className="bf-max">0 = ground</small></span>
            <input className={`u-input${shownNumberError ? ' invalid' : ''}`} type="number" min={0} step={1} inputMode="numeric"
              value={numberText} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} />
            {shownNumberError && <em>{shownNumberError}</em>}
          </label>
          <label className="uf-field"><span>Floor Name *</span>
            <input className={`u-input${errors.name ? ' invalid' : ''}`} value={name} maxLength={60} placeholder="e.g. Ground Floor"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, nameTouched: true }))} />
            {errors.name && <em>{errors.name}</em>}
          </label>
        </div>
        {taken.size > 0 && (
          <p className="u-muted u-small fp-taken">Existing floors: {[...taken].sort((a, b) => a - b).join(', ')}</p>
        )}

        <h3 className="fp-h">Floor Plan</h3>
        {converting && <div className="fp-converting"><LoaderCircle size={18} className="fp-spin" />Rendering PDF page…</div>}

        {!converting && !imageUrl && (
          <button type="button" className={`fp-drop${dragOver ? ' over' : ''}`} onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFile(e.dataTransfer.files?.[0]) }}>
            <FileUp size={28} />
            <strong>Upload the floor plan</strong>
            <span>Drop a <b>PDF</b> here or click to browse — PNG, JPEG and WebP also work</span>
            <small>PDF: page 1 is used. Rooms are detected on the floor plan after you save.</small>
          </button>
        )}
        <input ref={fileRef} type="file" accept=".pdf,application/pdf,image/png,image/jpeg,image/webp" hidden
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }} />

        {!converting && imageUrl && (
          <>
            <div className="fp-plan-tools">
              <span className="u-muted u-small">{planSource ?? planFile?.name ?? floor?.planImage?.name ?? 'Uploaded plan'}</span>
              <span className="fp-plan-btns">
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Replace Plan</button>
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={removePlan}><ImageOff size={13} />Remove Plan</button>
              </span>
            </div>
            <a className="fp-thumb" href={imageUrl} target="_blank" rel="noopener noreferrer" title="Open the plan in a new tab">
              <img src={imageUrl} alt="Uploaded floor plan" />
            </a>
          </>
        )}
        {errors.plan && <p className="uf-error">{errors.plan}</p>}
        <p className="b-note"><Info size={14} />After saving you'll go to the floor plan, where rooms are detected from the plan; then name rooms, adjust or draw outlines, and add ACM details. The floor's room and ACM counts come from those rooms.</p>

        {errors.form && <p className="uf-error">{errors.form}</p>}
        <footer className="fp-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving || converting || (form.buildingId && !siblingFloors)}>
            {saving ? 'Saving…' : 'Save & Map Rooms'}
          </button>
        </footer>
      </form>
    </aside>
  )
}
