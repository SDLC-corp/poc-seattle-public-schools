import { useState } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { isoToday, addDays } from '../Surveillance/survMeta'

/** Schedule a follow-up inspection of every ACM on the inspection: inspector, date, time and notes. */
export default function FollowUpDialog({ record, meta, onClose, onDone }) {
  const [plan, setPlan] = useState({ inspectorId: record.inspectorId ?? '', scheduledDate: addDays(isoToday(), 30), scheduledTime: '09:00', notes: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (v) => { setPlan((p) => ({ ...p, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[`followUp.${k}`]; return n }) }
  const err = (k) => errors[`followUp.${k}`]
  const acms = 1 + (record.extra?.length ?? 0)

  const save = async () => {
    setSaving(true)
    try {
      const res = await request(`/inspection-records/records/${record.id}/follow-ups`, { method: 'POST', body: plan })
      onDone(res.record)
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="u-modal in-fu-dialog" role="dialog" aria-modal="true" aria-labelledby="in-fu-title">
        <header className="u-modal-head">
          <h2 id="in-fu-title"><CalendarPlus size={18} />Schedule Follow-up Inspection</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <p className="in-hint">A follow-up of {record.id} covering {acms === 1 ? 'its ACM' : `all ${acms} ACMs`}. It&apos;s assigned to the inspector and listed under this inspection&apos;s Follow-up Inspections.</p>
          {errors.form && <div className="u-banner">{errors.form}</div>}
          <div className="uf-field">
            <span>Inspector *</span>
            <SearchSelect variant="field" label="Inspector" value={plan.inspectorId} onChange={set('inspectorId')} searchPlaceholder="Search inspectors…"
              options={[{ value: '', label: 'Choose the inspector' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name, meta: u.certification?.number ?? '' }))]} />
            {err('inspectorId') && <small className="uf-error">{err('inspectorId')}</small>}
          </div>
          <div className="in-fu-when">
            <label className="uf-field">
              <span>Date *</span>
              <input type="date" className={`u-input${err('scheduledDate') ? ' invalid' : ''}`} value={plan.scheduledDate} min={isoToday()} onChange={(e) => set('scheduledDate')(e.target.value)} />
              {err('scheduledDate') && <small className="uf-error">{err('scheduledDate')}</small>}
            </label>
            <label className="uf-field">
              <span>Time *</span>
              <input type="time" className={`u-input${err('scheduledTime') ? ' invalid' : ''}`} value={plan.scheduledTime} onChange={(e) => set('scheduledTime')(e.target.value)} />
              {err('scheduledTime') && <small className="uf-error">{err('scheduledTime')}</small>}
            </label>
          </div>
          <label className="uf-field">
            <span>Notes for the inspector</span>
            <textarea className="u-input sv-textarea" rows={3} maxLength={500} value={plan.notes} placeholder="What to check on the follow-up (optional)" onChange={(e) => set('notes')(e.target.value)} />
          </label>
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" onClick={save} disabled={saving}><CalendarPlus size={15} />{saving ? 'Scheduling…' : 'Schedule Follow-up'}</button>
        </footer>
      </div>
    </div>
  )
}
