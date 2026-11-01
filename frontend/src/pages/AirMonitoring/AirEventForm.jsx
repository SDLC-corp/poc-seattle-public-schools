import { useEffect, useMemo, useState } from 'react'
import { X, Info } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
const toLocalInput = (iso) => {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Log a new monitoring event or edit an existing one (e.g. enter the lab result later)
export default function AirEventForm({ event, meta, schools, buildings, onClose, onSaved }) {
  const isNew = !event
  const [nowInput] = useState(() => toLocalInput(new Date().toISOString()))
  const [form, setForm] = useState(() => ({
    sampledAt: event ? toLocalInput(event.sampledAt) : nowInput,
    schoolId: event?.schoolId ?? '',
    buildingId: event?.buildingId ?? '',
    location: event?.location ?? '',
    type: event?.type ?? 'Clearance',
    method: event?.method ?? 'PCM',
    durationMin: event?.durationMin ?? 240,
    result: event?.result ?? '',
    contractorName: event?.contractorName ?? '',
    inspectorName: event?.inspectorName ?? '',
    project: event?.project ?? '',
    notes: event?.notes ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'schoolId' ? { buildingId: '' } : {}) }))
  const schoolBuildings = useMemo(() => buildings.filter((b) => b.schoolId === form.schoolId), [buildings, form.schoolId])
  const limit = meta.limits[`${form.type}|${form.method}`]
  const resultNum = form.result === '' ? null : Number(form.result)
  const preview = resultNum === null || Number.isNaN(resultNum) ? 'pending' : resultNum > limit.value ? 'exceedance' : 'compliant'

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const body = {
        ...form,
        sampledAt: new Date(form.sampledAt).toISOString(),
        durationMin: Number(form.durationMin),
        result: form.result === '' ? null : Number(form.result),
        buildingId: form.buildingId || null,
      }
      const saved = isNew
        ? await request('/air-monitoring', { method: 'POST', body })
        : await request(`/air-monitoring/${event.id}`, { method: 'PUT', body })
      onSaved(saved, isNew)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const input = (k, props = {}) => ({
    className: `u-input${errors[k] ? ' invalid' : ''}`,
    value: form[k],
    onChange: (ev) => set(k)(ev.target.value),
    ...props,
  })

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="u-modal" role="dialog" aria-modal="true" aria-labelledby="af-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="af-title">{isNew ? 'Log Air Monitoring' : `Edit ${event.id}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <div className="uf-grid">
            <div className="uf-field">
              <span>School *</span>
              <SearchSelect variant="field" label="School" value={form.schoolId} onChange={set('schoolId')} searchPlaceholder="Search schools…"
                options={[{ value: '', label: 'Select a school…' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
              {errors.schoolId && <em>{errors.schoolId}</em>}
            </div>
            <div className="uf-field">
              <span>Building</span>
              <SearchSelect variant="field" label="Building" value={form.buildingId} onChange={set('buildingId')} searchable={false}
                options={[{ value: '', label: form.schoolId ? 'Not specified' : 'Choose a school first' }, ...schoolBuildings.map((b) => ({ value: b.id, label: b.name }))]} />
              {errors.buildingId && <em>{errors.buildingId}</em>}
            </div>
            <label className="uf-field">
              <span>Location / Room *</span>
              <input {...input('location', { placeholder: 'e.g. Room 101, Boiler Room' })} />
              {errors.location && <em>{errors.location}</em>}
            </label>
            <label className="uf-field">
              <span>Sampled At *</span>
              <input type="datetime-local" max={nowInput} {...input('sampledAt')} />
              {errors.sampledAt && <em>{errors.sampledAt}</em>}
            </label>
            <div className="uf-field">
              <span>Sample Type *</span>
              <SearchSelect variant="field" label="Sample type" value={form.type} onChange={set('type')} searchable={false}
                options={meta.types.map((t) => ({ value: t, label: t }))} />
            </div>
            <div className="uf-field">
              <span>Method *</span>
              <SearchSelect variant="field" label="Method" value={form.method} onChange={set('method')} searchable={false}
                options={meta.methods.map((m) => ({ value: m.id, label: m.label }))} />
            </div>
            <label className="uf-field">
              <span>Duration (minutes) *</span>
              <input type="number" min={1} max={1440} {...input('durationMin')} />
              {errors.durationMin && <em>{errors.durationMin}</em>}
            </label>
            <label className="uf-field">
              <span>Result ({limit.unit}) — leave empty if pending</span>
              <input type="number" min={0} step="any" placeholder="Pending lab result" {...input('result')} />
              {errors.result && <em>{errors.result}</em>}
            </label>
          </div>

          <p className={`af-limit af-${preview}`}>
            <Info size={14} />
            Limit: <strong>{limit.value} {limit.unit}</strong> ({limit.basis}).
            {preview === 'pending' ? ' Status will be Pending until a result is entered.' : ` This result will be recorded as ${preview === 'exceedance' ? 'an Exceedance' : 'Compliant'}.`}
          </p>

          <div className="uf-grid">
            <label className="uf-field"><span>Contractor</span><input {...input('contractorName')} /></label>
            <label className="uf-field"><span>Inspector</span><input {...input('inspectorName')} /></label>
            <label className="uf-field uf-wide"><span>Project</span><input {...input('project', { placeholder: 'e.g. Abatement – Classroom Wing' })} /></label>
            <label className="uf-field uf-wide">
              <span>Notes</span>
              <textarea className="u-input af-notes" rows={3} value={form.notes} onChange={(ev) => set('notes')(ev.target.value)} />
            </label>
          </div>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Log Event' : 'Save Changes'}</button>
        </footer>
      </form>
    </div>
  )
}
