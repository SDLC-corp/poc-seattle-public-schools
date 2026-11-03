import { useEffect, useState } from 'react'
import { X, Info, TriangleAlert } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { MAX_FLOORS, ACM_STATUSES, CONSTRUCTION, PRESUMED_ACM_BEFORE } from './buildingUtils'

// Next free code for a school: SCHOOLID-A, -B, … (skips codes already taken)
function suggestCode(school, existing) {
  const taken = new Set(existing.map((b) => b.code))
  for (let i = 0; i < 26; i += 1) {
    const code = `${school.id.toUpperCase()}-${String.fromCharCode(65 + i)}`
    if (!taken.has(code)) return code
  }
  return ''
}

// Add / edit a building. Floors are limited to 1–3.
export default function BuildingForm({ school, building, existing, onClose, onSaved }) {
  const isNew = !building
  const [form, setForm] = useState(() => ({
    name: building?.name ?? '',
    code: building?.code ?? suggestCode(school, existing),
    yearBuilt: String(building?.yearBuilt ?? ''),
    floors: building?.floors ?? 1,
    areaSqFt: String(building?.areaSqFt ?? ''),
    construction: building?.construction ?? 'Masonry',
    rooms: String(building?.rooms ?? ''),
    acmStatus: building?.acmStatus ?? 'Assumed ACM',
    roomsWithAcm: String(building?.roomsWithAcm || ''),
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const year = Number(form.yearBuilt)
  const preAhera = form.yearBuilt.length === 4 && year < PRESUMED_ACM_BEFORE
  const noAcm = form.acmStatus === 'No ACM'

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    const body = { ...form, roomsWithAcm: noAcm ? 0 : form.roomsWithAcm, schoolId: school.id }
    try {
      const saved = isNew
        ? await request('/buildings', { method: 'POST', body })
        : await request(`/buildings/${building.id}`, { method: 'PUT', body })
      onSaved(saved, isNew)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const input = (k, props = {}) => ({ className: `u-input${errors[k] ? ' invalid' : ''}`, value: form[k], onChange: (ev) => set(k)(ev.target.value), ...props })
  const err = (k) => errors[k] && <em>{errors[k]}</em>

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="u-modal" role="dialog" aria-modal="true" aria-labelledby="bf-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="bf-title">{isNew ? `Add Building – ${school.name}` : `Edit ${building.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <div className="uf-grid">
            <label className="uf-field"><span>Building Name *</span><input {...input('name')} autoFocus placeholder="e.g. North Wing" />{err('name')}</label>
            <label className="uf-field"><span>Building Code *</span><input {...input('code')} />{err('code')}</label>
            <label className="uf-field"><span>Year Built *</span><input {...input('yearBuilt', { inputMode: 'numeric', maxLength: 4, placeholder: 'YYYY' })} />{err('yearBuilt')}</label>
            {isNew ? (
              <div className="uf-field">
                <span id="bf-floors">Initial Floors * <small className="bf-max">add more later</small></span>
                <div className="bf-seg" role="radiogroup" aria-labelledby="bf-floors">
                  {Array.from({ length: MAX_FLOORS }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={form.floors === n}
                      className={form.floors === n ? 'active' : ''} onClick={() => set('floors')(n)}>{n}</button>
                  ))}
                </div>
                {err('floors')}
              </div>
            ) : (
              <label className="uf-field"><span>No. of Floors</span><input className="u-input" value={building.floors} disabled /></label>
            )}
            <label className="uf-field"><span>Gross Area (sq ft) *</span><input {...input('areaSqFt', { inputMode: 'numeric' })} />{err('areaSqFt')}</label>
            <div className="uf-field">
              <span>Construction</span>
              <SearchSelect variant="field" label="Construction" value={form.construction} onChange={set('construction')} searchable={false}
                options={CONSTRUCTION.map((c) => ({ value: c, label: c }))} />
            </div>
            <label className="uf-field"><span>No. of Rooms {isNew && '*'}</span><input {...input('rooms', { inputMode: 'numeric', disabled: !isNew })} />{err('rooms')}</label>
            <label className="uf-field"><span>Rooms with ACM {isNew && !noAcm ? '*' : ''}</span>
              <input {...input('roomsWithAcm', { inputMode: 'numeric', disabled: noAcm || !isNew, value: noAcm ? '0' : form.roomsWithAcm })} />{err('roomsWithAcm')}
            </label>
          </div>

          {isNew ? <div className="uf-field bf-acm">
            <span id="bf-acm">ACM Status *</span>
            <div className="bf-seg" role="radiogroup" aria-labelledby="bf-acm">
              {ACM_STATUSES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={form.acmStatus === s}
                  className={form.acmStatus === s ? 'active' : ''} onClick={() => set('acmStatus')(s)}>{s}</button>
              ))}
            </div>
            {err('acmStatus')}
          </div> : (
            <p className="b-note"><Info size={14} />Floors, rooms and ACM status ({building.acmStatus}) are managed per floor in the building's Floors tab.</p>
          )}

          {!isNew ? null : preAhera && noAcm
            ? <p className="b-note warn"><TriangleAlert size={14} />Built before {PRESUMED_ACM_BEFORE}: AHERA presumes ACM unless sampling shows otherwise. Only choose “No ACM” if lab results confirm it.</p>
            : <p className="b-note"><Info size={14} />Start with 1–{MAX_FLOORS} floors; add more floors (no limit) in the building's Floors tab. Pre-{PRESUMED_ACM_BEFORE} buildings are presumed to contain asbestos until sampled.</p>}
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add Building' : 'Save Changes'}</button>
        </footer>
      </form>
    </div>
  )
}
