import { useEffect, useState } from 'react'
import { X, CalendarPlus } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { fmtDay, isoDay } from './complianceUtils'
import '../LabSamples/labSamples.css' // the right-side panel (.lr-drawer)

/**
 * Right-side panel to book an inspection that's due soon or overdue: the date and the inspector.
 * onScheduled(updatedInspection) after it's saved.
 */
export default function ScheduleDialog({ inspection: i, onClose, onScheduled }) {
  const [today] = useState(() => isoDay(new Date()))
  const [inspectors, setInspectors] = useState(null)
  const [form, setForm] = useState(() => ({ date: i.scheduledDate >= today ? i.scheduledDate : today, inspectorId: '' }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    request('/compliance/meta').then((m) => {
      setInspectors(m.inspectors)
      // Keep the inspector already named on the inspection, if they're still available
      setForm((f) => ({ ...f, inspectorId: m.inspectors.find((p) => p.id === i.inspectorId || p.name === i.inspectorName)?.id ?? '' }))
    }).catch((e) => setErrors({ form: e.message }))
  }, [i.inspectorId, i.inspectorName])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const res = await request(`/compliance/inspections/${i.id}/schedule`, { method: 'POST', body: form })
      onScheduled(res.inspection)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lr-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <form className="lr-drawer c-sched" role="dialog" aria-modal="true" aria-labelledby="c-sched-title" onSubmit={save} noValidate>
        <header className="u-modal-head lr-drawer-head">
          <h2 id="c-sched-title"><CalendarPlus size={18} />Schedule Inspection</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body lr-drawer-body">
          <dl className="cd-facts">
            <div className="cd-row"><dt>Inspection</dt><dd>{i.type}</dd></div>
            <div className="cd-row"><dt>School</dt><dd>{i.schoolName}</dd></div>
            <div className="cd-row"><dt>Building</dt><dd>{i.buildingName}</dd></div>
            <div className="cd-row"><dt>Due</dt><dd>{fmtDay(i.scheduledDate)}{i.status === 'overdue' && <span className="c-sched-late"> · overdue</span>}</dd></div>
          </dl>
          <div className="c-sched-fields">
            <label className="uf-field">
              <span>Inspection Date *</span>
              <input type="date" className={`u-input${errors.date ? ' invalid' : ''}`} min={today} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              {errors.date && <em className="uf-error">{errors.date}</em>}
            </label>
            <div className="uf-field">
              <span>Inspector *</span>
              <SearchSelect variant="field" label="Inspector" value={form.inspectorId} onChange={(v) => setForm((f) => ({ ...f, inspectorId: v }))} searchPlaceholder="Search inspectors…"
                options={[{ value: '', label: inspectors ? 'Select the accredited inspector' : 'Loading…' }, ...(inspectors ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
              {errors.inspectorId && <em className="uf-error">{errors.inspectorId}</em>}
            </div>
          </div>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot lr-drawer-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving || !inspectors}>{saving ? 'Scheduling…' : 'Schedule'}</button>
        </footer>
      </form>
    </div>
  )
}
