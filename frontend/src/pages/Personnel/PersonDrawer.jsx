import { useEffect, useState } from 'react'
import { X, Pencil, Plus, Info } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { TrainingStatus, CategoryBadge } from './personnelMeta'
import { request } from '../../lib/api'

const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Right-side drawer: a person's required training, history, and a form to record a completion
export default function PersonDrawer({ personId, meta, onClose, onEdit, onChanged, notify }) {
  const [person, setPerson] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [adding, setAdding] = useState(null) // { programId, completedOn, certificateNo, provider }
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [maxDay] = useState(today)

  useEffect(() => {
    let cancelled = false
    request(`/personnel/${personId}`).then((p) => { if (!cancelled) setPerson(p) }).catch(() => {})
    return () => { cancelled = true }
  }, [personId, reloadKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const programs = meta.programs
  const prog = (id) => programs.find((p) => p.id === id)
  const startAdding = (programId) => { setErrors({}); setAdding({ programId, completedOn: maxDay, certificateNo: '', provider: '' }) }

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      const updated = await request(`/personnel/${personId}/records`, { method: 'POST', body: adding })
      notify('success', `Recorded ${prog(adding.programId).name} for ${updated.name}.`)
      setAdding(null)
      setReloadKey((k) => k + 1)
      onChanged()
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="p-drawer-backdrop" onClick={onClose} />
      <aside className="u-card p-drawer" aria-label="Person details">
        <header className="u-card-head">
          <h2>Training Profile</h2>
          <span className="ud-head-actions">
            {person && <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => onEdit(person)}><Pencil size={13} />Edit</button>}
            <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
          </span>
        </header>
        {!person ? <p className="c-details-empty">Loading…</p> : (
          <>
            <div className="p-hero">
              <span className="ud-avatar">{person.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
              <div>
                <strong>{person.name}</strong>
                <span>{person.organization}</span>
                <span className="p-hero-badges"><CategoryBadge person={person} /><TrainingStatus status={person.trainingStatus} /></span>
              </div>
            </div>
            <dl className="cd-facts">
              <div className="cd-row"><dt>Person ID</dt><dd className="a-mono">{person.id}</dd></div>
              <div className="cd-row"><dt>Email</dt><dd>{person.email ?? '—'}</dd></div>
              <div className="cd-row"><dt>Phone</dt><dd>{person.phone ?? '—'}</dd></div>
              <div className="cd-row"><dt>School</dt><dd>{person.schoolName ?? 'District-wide'}</dd></div>
            </dl>

            <h3 className="cd-h">Required Training</h3>
            <ul className="p-req">
              {person.required.map((r) => (
                <li key={r.programId}>
                  <div>
                    <strong>{r.programName}</strong>
                    <small>
                      {r.record ? `Completed ${fmt(r.record.completedOn)} · ${r.record.expiresOn ? `expires ${fmt(r.record.expiresOn)}` : 'no expiry'}` : 'No record on file'}
                      {r.record?.certificateNo && ` · Cert ${r.record.certificateNo}`}
                    </small>
                  </div>
                  <TrainingStatus status={r.status} />
                  {r.status !== 'valid' && (
                    <button type="button" className="p-link" onClick={() => startAdding(r.programId)}>Record</button>
                  )}
                </li>
              ))}
            </ul>

            {adding ? (
              <div className="p-add">
                <h3 className="cd-h">Record Training Completion</h3>
                <div className="uf-field">
                  <span>Program</span>
                  <SearchSelect variant="field" label="Program" value={adding.programId} searchable={false}
                    onChange={(v) => setAdding((a) => ({ ...a, programId: v }))}
                    options={programs.map((p) => ({ value: p.id, label: p.name }))} />
                </div>
                <label className="uf-field">
                  <span>Completed On</span>
                  <input type="date" className={`u-input${errors.completedOn ? ' invalid' : ''}`} max={maxDay} value={adding.completedOn}
                    onChange={(e) => setAdding((a) => ({ ...a, completedOn: e.target.value }))} />
                  {errors.completedOn && <em>{errors.completedOn}</em>}
                </label>
                <label className="uf-field">
                  <span>Certificate No.{prog(adding.programId)?.accredited ? ' *' : ''}</span>
                  <input className={`u-input${errors.certificateNo ? ' invalid' : ''}`} value={adding.certificateNo}
                    onChange={(e) => setAdding((a) => ({ ...a, certificateNo: e.target.value }))} />
                  {errors.certificateNo && <em>{errors.certificateNo}</em>}
                </label>
                <label className="uf-field">
                  <span>Training Provider</span>
                  <input className="u-input" value={adding.provider} onChange={(e) => setAdding((a) => ({ ...a, provider: e.target.value }))} />
                </label>
                <p className="p-hint"><Info size={13} />{prog(adding.programId)?.renewalMonths ? `Valid for ${prog(adding.programId).renewalMonths} months.` : 'Does not expire.'} {prog(adding.programId)?.basis}</p>
                {errors.form && <p className="uf-error">{errors.form}</p>}
                <div className="p-add-actions">
                  <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setAdding(null)}>Cancel</button>
                  <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Record'}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="u-btn u-btn-outline p-add-btn" onClick={() => startAdding(person.required[0]?.programId ?? programs[0].id)}>
                <Plus size={15} />Record Training
              </button>
            )}

            <h3 className="cd-h">Training History ({person.history.length})</h3>
            <ul className="p-history">
              {person.history.map((r, i) => (
                <li key={`${r.programId}${r.completedOn}${i}`}>
                  <strong>{prog(r.programId)?.name ?? r.programId}</strong>
                  <small>{fmt(r.completedOn)}{r.provider ? ` · ${r.provider}` : ''}</small>
                </li>
              ))}
              {!person.history.length && <li className="u-muted u-small">No training recorded yet.</li>}
            </ul>
            {person.sample && <p className="ad-sample"><Info size={13} />Sample person generated for this demo</p>}
          </>
        )}
      </aside>
    </>
  )
}
