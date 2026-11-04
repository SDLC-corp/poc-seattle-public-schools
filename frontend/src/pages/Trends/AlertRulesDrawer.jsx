import { useEffect, useState } from 'react'
import { X, BellRing } from 'lucide-react'
import Toggle from '../../components/ui/Toggle'
import { request } from '../../lib/api'
import '../LabSamples/labSamples.css' // the right-side panel (.lr-drawer)

/** Right-side panel: switch the deterioration alert rules on or off and tune their numbers. */
export default function AlertRulesDrawer({ onClose, onSaved }) {
  const [rules, setRules] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { request('/trends/alerts').then((d) => setRules(d.rules)).catch((e) => setErrors({ form: e.message })) }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (id, patch) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      await request('/trends/alerts', { method: 'PUT', body: { rules } })
      onSaved()
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="lr-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <form className="lr-drawer tr-rules" role="dialog" aria-modal="true" aria-labelledby="tr-rules-title" onSubmit={save} noValidate>
        <header className="u-modal-head lr-drawer-head">
          <h2 id="tr-rules-title"><BellRing size={18} />Deterioration Alerts</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body lr-drawer-body">
          <p className="u-muted tr-rules-intro">Alerts are raised from recorded condition assessments when a rule matches. They flag physical deterioration for follow-up; they are not a measure of airborne asbestos.</p>
          {!rules && !errors.form && <p className="u-muted">Loading…</p>}
          <ul className="tr-rules-list">
            {(rules ?? []).map((r) => (
              <li key={r.id}>
                <div className="tr-rules-head">
                  <strong>{r.name}</strong>
                  <Toggle checked={r.enabled} onChange={(v) => set(r.id, { enabled: v })} label={`${r.name} ${r.enabled ? 'on' : 'off'}`} />
                </div>
                {r.kind === 'recentDeterioration' && (
                  <label className="uf-field"><span>Look back (days)</span>
                    <input type="number" min={7} max={730} className={`u-input${errors[`${r.id}.days`] ? ' invalid' : ''}`} value={r.days} disabled={!r.enabled} onChange={(e) => set(r.id, { days: e.target.value })} />
                    {errors[`${r.id}.days`] && <em className="uf-error">{errors[`${r.id}.days`]}</em>}
                  </label>
                )}
                {r.kind === 'schoolCount' && (
                  <label className="uf-field"><span>Deteriorating ACMs per school</span>
                    <input type="number" min={1} max={100} className={`u-input${errors[`${r.id}.threshold`] ? ' invalid' : ''}`} value={r.threshold} disabled={!r.enabled} onChange={(e) => set(r.id, { threshold: e.target.value })} />
                    {errors[`${r.id}.threshold`] && <em className="uf-error">{errors[`${r.id}.threshold`]}</em>}
                  </label>
                )}
              </li>
            ))}
          </ul>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot lr-drawer-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving || !rules}>{saving ? 'Saving…' : 'Save Alerts'}</button>
        </footer>
      </form>
    </div>
  )
}
