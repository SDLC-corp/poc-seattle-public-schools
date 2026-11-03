import { useEffect, useRef, useState } from 'react'
import { DoorOpen, Upload, X, Save, RotateCcw, ImageOff } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, uploadFile } from '../../lib/api'
import { AcmBadge } from './BuildingParts'

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const fromRoom = (r) => ({
  name: r.name, number: r.number, type: r.type, status: r.status,
  maxOccupancy: r.maxOccupancy ?? '', description: r.description ?? '',
})

// Room details on the floor-plan screen; `focusKey` changes when the Label tool picks this room.
// `embedded`: shown inside the room panel, which already names the room, its place and status.
export default function RoomInfoCard({ room, place, meta, focusKey, onSaved, onToast, embedded = false }) {
  const [form, setForm] = useState(() => fromRoom(room))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const nameRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (focusKey) { nameRef.current?.focus(); nameRef.current?.select() }
  }, [focusKey])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = JSON.stringify(form) !== JSON.stringify(fromRoom(room))

  const save = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const saved = await request(`/rooms/${room.id}`, { method: 'PUT', body: { ...form, maxOccupancy: form.maxOccupancy === '' ? null : form.maxOccupancy } })
      onSaved(saved)
      onToast({ kind: 'success', text: `Saved room ${saved.number} ${saved.name}` })
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const addPhotos = async (e) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    const bad = files.find((f) => !PHOTO_TYPES.includes(f.type) || f.size > MAX_PHOTO_BYTES)
    if (bad) { onToast({ kind: 'error', text: `${bad.name}: photos must be JPG, PNG or WebP up to 10 MB` }); return }
    setUploading(true)
    try {
      const added = []
      for (const f of files) added.push(await uploadFile(`/rooms/${room.id}/photos`, f))
      onSaved({ ...room, photos: [...(room.photos ?? []), ...added] }, { keepForm: true })
    } catch (err) {
      onToast({ kind: 'error', text: err.message })
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async (p) => {
    try {
      await request(`/rooms/${room.id}/photos/${p.id}`, { method: 'DELETE' })
      onSaved({ ...room, photos: room.photos.filter((x) => x.id !== p.id) }, { keepForm: true })
    } catch (err) {
      onToast({ kind: 'error', text: err.message })
    }
  }

  const input = (k, props = {}) => ({ className: `u-input${errors[k] ? ' invalid' : ''}`, value: form[k], onChange: (ev) => set(k)(ev.target.value), ...props })
  const err = (k) => errors[k] && <em>{errors[k]}</em>

  return (
    <form className={`${embedded ? 'fr-pane' : 'u-card'} fr-card`} onSubmit={save} noValidate>
      {!embedded && (
        <>
          <header className="fr-card-head">
            <h2><DoorOpen size={16} />Room Information <small>(mapped from floor plan)</small></h2>
            <AcmBadge status={room.acmStatus} />
          </header>
          <div className="fr-grid fr-grid-3">
            <label className="uf-field"><span>School</span><input className="u-input" value={place.school} disabled /></label>
            <label className="uf-field"><span>Building</span><input className="u-input" value={place.building} disabled /></label>
            <label className="uf-field"><span>Floor</span><input className="u-input" value={place.floor} disabled /></label>
          </div>
        </>
      )}
      <div className="fr-grid fr-grid-name">
        <label className="uf-field"><span>Room Name *</span><input ref={nameRef} {...input('name', { maxLength: 80 })} />{err('name')}</label>
        <label className="uf-field"><span>Room Number *</span><input {...input('number', { maxLength: 12 })} />{err('number')}</label>
      </div>
      <div className="fr-grid fr-grid-3">
        <div className="uf-field"><span>Room Type *</span>
          <SearchSelect variant="field" label="Room type" value={form.type} onChange={set('type')} options={meta.roomTypes.map((t) => ({ value: t, label: t }))} />{err('type')}
        </div>
        <div className="uf-field"><span>Room Status *</span>
          <SearchSelect variant="field" label="Room status" value={form.status} onChange={set('status')} searchable={false} options={meta.roomStatuses.map((t) => ({ value: t, label: t }))} />{err('status')}
        </div>
        <label className="uf-field"><span>Maximum Occupancy</span><input {...input('maxOccupancy', { inputMode: 'numeric', placeholder: '—' })} />{err('maxOccupancy')}</label>
      </div>
      <label className="uf-field"><span>Room Usage / Description</span>
        <textarea {...input('description', { rows: 2, maxLength: 500 })} className="u-input fr-textarea" />
        <small className="fr-count">{form.description.length}/500</small>
      </label>

      <div className="uf-field">
        <span>Room Photos</span>
        <div className="fr-photos">
          {(room.photos ?? []).map((p) => (
            <figure key={p.id} className="fr-photo">
              <a href={`/api/rooms/${room.id}/photos/${p.id}`} target="_blank" rel="noopener noreferrer" title={p.name}>
                <img src={`/api/rooms/${room.id}/photos/${p.id}`} alt={p.name} />
              </a>
              <button type="button" onClick={() => removePhoto(p)} aria-label={`Remove ${p.name}`}><X size={12} /></button>
            </figure>
          ))}
          <button type="button" className="fr-photo-add" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : <><Upload size={16} />Upload Photo<small>JPG, PNG, WebP</small></>}
          </button>
          <input ref={fileRef} type="file" accept={PHOTO_TYPES.join(',')} multiple hidden onChange={addPhotos} />
          {!(room.photos ?? []).length && <span className="fr-photo-none"><ImageOff size={14} />No photos yet</span>}
        </div>
      </div>

      {errors.form && <p className="uf-error">{errors.form}</p>}
      {dirty && (
        <footer className="fr-card-foot">
          <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { setForm(fromRoom(room)); setErrors({}) }}><RotateCcw size={13} />Discard</button>
          <button type="submit" className="u-btn u-btn-primary u-btn-sm" disabled={saving}><Save size={13} />{saving ? 'Saving…' : 'Save Room'}</button>
        </footer>
      )}
    </form>
  )
}
