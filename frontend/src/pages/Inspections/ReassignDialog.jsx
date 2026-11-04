import { useEffect, useState } from 'react'
import { X, Users, CalendarClock } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { isoToday } from '../Surveillance/survMeta'
import { request } from '../../lib/api'

// Change the inspector and/or scheduled date of open inspections.
// mode "schedule" (Upcoming / Overdue) words it as scheduling rather than reassigning.
export default function ReassignDialog({ ids, meta, mode, onClose, onDone }) {
  const scheduling = mode === 'schedule'
  const [inspectorId, setInspectorId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      onDone(await request('/inspection-records/reassign', { method: 'POST', body: { ids, inspectorId: inspectorId || undefined, scheduledDate: scheduledDate || undefined, scheduledTime: scheduledTime || undefined } }))
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal ai-add" role="dialog" aria-modal="true" aria-labelledby="in-reassign-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="in-reassign-title">
            {scheduling ? <CalendarClock size={18} /> : <Users size={18} />}{scheduling ? 'Schedule' : 'Reassign'} {ids.length} Inspection{ids.length === 1 ? '' : 's'}
          </h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <p className="u-muted ai-add-intro">
            {scheduling ? 'Pick the date the inspection is scheduled for, and the inspector if it changes.' : 'Change who does the inspection, when, or both.'} Leave a field empty to keep it as it is.
          </p>
          <div className="ai-add-grid">
            <div className="a-field">
              <span>{scheduling ? 'Inspector' : 'New Inspector'}</span>
              <SearchSelect variant="field" label="New inspector" value={inspectorId} onChange={setInspectorId} searchable={false}
                options={[{ value: '', label: 'Keep current inspector' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
              {errors.inspectorId && <em className="uf-error">{errors.inspectorId}</em>}
            </div>
            <label className="a-field">
              <span>{scheduling ? 'Scheduled Date' : 'New Scheduled Date'}</span>
              <input type="date" className="u-input" value={scheduledDate} min={isoToday()} onChange={(e) => setScheduledDate(e.target.value)} />
              {errors.scheduledDate && <em className="uf-error">{errors.scheduledDate}</em>}
            </label>
            <label className="a-field">
              <span>{scheduling ? 'Inspection Time' : 'New Inspection Time'}</span>
              <input type="time" step={900} className="u-input" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              {errors.scheduledTime && <em className="uf-error">{errors.scheduledTime}</em>}
            </label>
          </div>
          {(errors.ids || errors.form) && <p className="uf-error">{errors.ids ?? errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={saving || (!inspectorId && !scheduledDate && !scheduledTime)} onClick={save}>{saving ? 'Saving…' : scheduling ? 'Schedule' : 'Save Changes'}</button>
        </footer>
      </div>
    </div>
  )
}
