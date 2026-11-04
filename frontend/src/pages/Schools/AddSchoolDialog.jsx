import { useEffect, useState } from 'react'
import { X, School } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'

const BLANK = {
  name: '', type: '', category: '', street: '', city: 'Seattle', state: 'WA', zip: '',
  phone: '', website: '', principal: '', principalEmail: '', boardDistrict: '', lat: '', lng: '',
}

// Add a school (POST /api/schools). Buildings are added on the school's page afterwards.
export default function AddSchoolDialog({ onClose, onCreated }) {
  const [f, setF] = useState(BLANK)
  const [meta, setMeta] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { request('/schools/meta').then(setMeta).catch(() => setMeta({ types: ['Elementary', 'Middle', 'High', 'K-8', 'Other'], categories: [] })) }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const set = (key) => (v) => setF((x) => ({ ...x, [key]: typeof v === 'string' ? v : v.target.value }))
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const school = await request('/schools', { method: 'POST', body: f })
      onCreated(school)
    } catch (err) {
      setErrors({ ...(err.fields ?? {}), form: err.fields ? 'Check the highlighted fields' : err.message })
      setBusy(false)
    }
  }
  const field = (key, label, props = {}, errKey = key) => (
    <label className={`a-field${errors[errKey] ? ' invalid' : ''}`}><span>{label}</span>
      <input value={f[key]} onChange={set(key)} {...props} />
      {errors[errKey] && <em>{errors[errKey]}</em>}
    </label>
  )

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <form className="u-modal sch-add" role="dialog" aria-modal="true" aria-labelledby="sch-add-title" onSubmit={save} noValidate>
        <header className="u-modal-head">
          <h2 id="sch-add-title"><School size={18} />Add School</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={16} /></button>
        </header>
        <div className="u-modal-body sch-add-body">
          <fieldset>
            <legend>School</legend>
            {field('name', 'School name *', { maxLength: 100, autoFocus: true, placeholder: 'e.g. Lakeview Elementary' })}
            <div className="sch-add-grid">
              <div className={`a-field${errors.type ? ' invalid' : ''}`}><span>Type *</span>
                <SearchSelect variant="field" label="School type" value={f.type} onChange={set('type')} searchable={false}
                  options={[{ value: '', label: 'Select a type' }, ...(meta?.types ?? []).map((t) => ({ value: t, label: t }))]} />
                {errors.type && <em>{errors.type}</em>}
              </div>
              <div className={`a-field${errors.category ? ' invalid' : ''}`}><span>Category</span>
                <SearchSelect variant="field" label="Category" value={f.category} onChange={set('category')} searchable={false}
                  options={[{ value: '', label: 'Not specified' }, ...(meta?.categories ?? []).map((c) => ({ value: c, label: c }))]} />
                {errors.category && <em>{errors.category}</em>}
              </div>
              <div className={`a-field${errors.boardDistrict ? ' invalid' : ''}`}><span>Board district</span>
                <SearchSelect variant="field" label="Board district" value={f.boardDistrict} onChange={set('boardDistrict')} searchable={false}
                  options={[{ value: '', label: 'Not specified' }, ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: `Board District ${n}` }))]} />
                {errors.boardDistrict && <em>{errors.boardDistrict}</em>}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Address</legend>
            {field('street', 'Street address *', { maxLength: 120, placeholder: 'e.g. 1234 NE 65th St' })}
            <div className="sch-add-grid">
              {field('city', 'City', { maxLength: 60 })}
              {field('state', 'State', { maxLength: 2 })}
              {field('zip', 'ZIP code *', { maxLength: 10, inputMode: 'numeric' })}
            </div>
            <div className="sch-add-grid two">
              {field('lat', 'Latitude', { inputMode: 'decimal', placeholder: 'e.g. 47.6762' })}
              {field('lng', 'Longitude', { inputMode: 'decimal', placeholder: 'e.g. -122.3182' }, 'lng')}
            </div>
            <small className="sch-add-hint">Optional: with a location the school shows on the dashboard map. Leave both empty to add it without a map pin.</small>
          </fieldset>

          <fieldset>
            <legend>Contact</legend>
            <div className="sch-add-grid two">
              {field('phone', 'Phone', { maxLength: 30, type: 'tel', placeholder: '206-252-0000' })}
              {field('website', 'Website', { maxLength: 200, type: 'url', placeholder: 'https://…' })}
              {field('principal', 'Principal', { maxLength: 80 })}
              {field('principalEmail', 'Principal email', { maxLength: 120, type: 'email' })}
            </div>
          </fieldset>
          {errors.form && <p className="u-banner">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add School'}</button>
        </footer>
      </form>
    </div>
  )
}
