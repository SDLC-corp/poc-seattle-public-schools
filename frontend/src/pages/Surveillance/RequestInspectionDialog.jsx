import { useEffect, useState } from 'react'
import { ClipboardPlus, X, Layers, ShieldCheck } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { request } from '../../lib/api'
import { useOutlookCalendar, outlookNote } from '../../lib/outlookCalendar'
import { CONDITION_TONE, fmtDay, isoToday, addDays } from './survMeta'

/**
 * Request a damage inspection (Damage Assessment) of the surveillance record's ACM: the inspector, when, and
 * notes for them. The inspection is linked to the surveillance record.
 */
export default function RequestInspectionDialog({ record, material, location, onClose, onDone }) {
  const damaged = record.condition && record.condition !== 'Good'
  const [inspectors, setInspectors] = useState([])
  const [plan, setPlan] = useState({
    inspectorId: record.inspectorId ?? '', scheduledDate: addDays(isoToday(), damaged ? 3 : 7), scheduledTime: '09:00',
    notes: `Damage inspection requested from surveillance ${record.id}: condition ${record.condition ?? 'not recorded'}${record.changed ? ', changed since the last check' : ''}.${record.comments ? ` Surveillance notes: ${record.comments}` : ''}`.slice(0, 500),
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const outlook = useOutlookCalendar()

  useEffect(() => {
    request('/inspection-records/meta').then((m) => setInspectors(m.inspectors ?? [])).catch(() => {})
  }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (k) => (v) => { setPlan((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const save = async () => {
    setSaving(true)
    try {
      const res = await request('/inspection-records/from-surveillance', { method: 'POST', body: { surveillanceId: record.id, ...plan } })
      // The new inspection goes on the Outlook calendar too
      const cal = await outlook.addInspections([res.record.id])
      onDone(res.record, outlookNote(cal))
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="u-modal sv-req-dialog" role="dialog" aria-modal="true" aria-labelledby="sv-req-title">
        <header className="u-modal-head">
          <h2 id="sv-req-title"><ClipboardPlus size={18} />Request Damage Inspection</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          {errors.form && <div className="u-banner">{errors.form}</div>}
          {/* What it's for: the ACM and the surveillance that found the need */}
          <div className="sv-req-context">
            <div>
              <span><Layers size={14} />Associated ACM</span>
              <strong>{material?.name ?? record.materialId}</strong>
              <small>{[location?.schoolName, location?.buildingName, location ? `${location.roomNumber ?? ''} ${location.roomName ?? ''}`.trim() : null].filter(Boolean).join(' · ')}</small>
            </div>
            <div>
              <span><ShieldCheck size={14} />Surveillance {record.id}</span>
              <strong>{fmtDay(record.date)}{record.condition && <> · <Badge tone={CONDITION_TONE[record.condition]}>{record.condition}</Badge></>}</strong>
              <small>{record.changed ? 'Condition changed since the last check' : 'No change since the last check'}{record.inspectorName ? ` · by ${record.inspectorName}` : ''}</small>
            </div>
          </div>
          <div className="uf-field">
            <span>Inspector *</span>
            <SearchSelect variant="field" label="Inspector" value={plan.inspectorId} onChange={set('inspectorId')} searchPlaceholder="Search inspectors…"
              options={[{ value: '', label: 'Choose the accredited inspector' }, ...inspectors.map((u) => ({ value: u.id, label: u.name, meta: u.certification?.number ?? '' }))]} />
            {errors.inspectorId && <em className="uf-error">{errors.inspectorId}</em>}
          </div>
          <div className="sv-req-when">
            <label className="uf-field">
              <span>Date *</span>
              <input type="date" className={`u-input${errors.scheduledDate ? ' invalid' : ''}`} value={plan.scheduledDate} min={isoToday()} onChange={(e) => set('scheduledDate')(e.target.value)} />
              {errors.scheduledDate && <em className="uf-error">{errors.scheduledDate}</em>}
            </label>
            <label className="uf-field">
              <span>Time *</span>
              <input type="time" step={900} className={`u-input${errors.scheduledTime ? ' invalid' : ''}`} value={plan.scheduledTime} onChange={(e) => set('scheduledTime')(e.target.value)} />
              {errors.scheduledTime && <em className="uf-error">{errors.scheduledTime}</em>}
            </label>
          </div>
          <label className="uf-field">
            <span>Notes for the inspector</span>
            <textarea className="u-input sv-textarea" rows={3} maxLength={500} value={plan.notes} onChange={(e) => set('notes')(e.target.value)} />
          </label>
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" onClick={save} disabled={saving}><ClipboardPlus size={15} />{saving ? 'Requesting…' : 'Request Inspection'}</button>
        </footer>
      </div>
    </div>
  )
}
