import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Search, Pencil, Upload, Download, X, Building2 } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import { fmtDay } from '../Surveillance/survMeta'
import { PLAN_STATUS } from './omMeta'
import { request, uploadFile, API_BASE } from '../../lib/api'

const Err = ({ msg }) => (msg ? <em className="uf-error">{msg}</em> : null)

function PlanDialog({ plan, onClose, onSaved, onToast }) {
  const fileRef = useRef(null)
  const [form, setForm] = useState({ version: plan.version, effectiveDate: plan.effectiveDate, nextReview: plan.nextReview, owner: plan.owner, notes: plan.notes ?? '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState(plan.attachments ?? [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  const save = async () => {
    setSaving(true)
    try {
      onSaved(await request(`/om/plans/${plan.id}`, { method: 'PUT', body: form }))
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
      setSaving(false)
    }
  }
  const upload = async (file) => {
    try {
      const f = await uploadFile(`/om/plans/${plan.id}/attachments`, file)
      setFiles((l) => [...l, f])
      onToast({ kind: 'success', text: `Uploaded ${f.name}` })
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal ai-add" role="dialog" aria-modal="true" aria-labelledby="om-plan-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="om-plan-title"><FileText size={18} />{plan.name}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <div className="ai-add-grid">
            <label className="uf-field"><span>Version *</span><input className={`u-input${errors.version ? ' invalid' : ''}`} value={form.version} onChange={set('version')} maxLength={20} /><Err msg={errors.version} /></label>
            <label className="uf-field"><span>Plan Owner *</span><input className={`u-input${errors.owner ? ' invalid' : ''}`} value={form.owner} onChange={set('owner')} maxLength={80} /><Err msg={errors.owner} /></label>
            <label className="uf-field"><span>Effective Date *</span><input type="date" className={`u-input${errors.effectiveDate ? ' invalid' : ''}`} value={form.effectiveDate} onChange={set('effectiveDate')} /><Err msg={errors.effectiveDate} /></label>
            <label className="uf-field"><span>Next Review *</span><input type="date" className={`u-input${errors.nextReview ? ' invalid' : ''}`} value={form.nextReview} min={form.effectiveDate} onChange={set('nextReview')} /><Err msg={errors.nextReview} /></label>
            <label className="uf-field uf-wide"><span>Notes</span><textarea className="u-input sv-textarea" rows={2} maxLength={500} value={form.notes} onChange={set('notes')} /></label>
          </div>
          <div className="om-plan-files">
            <div className="om-plan-files-head">
              <strong>Plan documents</strong>
              <input ref={fileRef} type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Upload PDF</button>
            </div>
            {files.length ? (
              <ul className="sv-docs">
                {files.map((f) => (
                  <li key={f.id}><FileText size={16} /><a href={`${API_BASE}/om/plans/${plan.id}/attachments/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                    <a className="u-row-btn" href={`${API_BASE}/om/plans/${plan.id}/attachments/${f.id}?download=1`} aria-label={`Download ${f.name}`}><Download size={14} /></a></li>
                ))}
              </ul>
            ) : <p className="u-muted sv-empty-line">No plan document uploaded yet.</p>}
          </div>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save Plan'}</button>
        </footer>
      </div>
    </div>
  )
}

// District O&M plan and the facility-specific plans
export default function PlansTab({ onToast }) {
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    request('/om/plans').then((d) => { if (!cancelled) setData(d) }).catch((e) => onToast({ kind: 'error', text: e.message }))
    return () => { cancelled = true }
  }, [reload, onToast])

  const term = q.trim().toLowerCase()
  const facility = (data?.facility ?? []).filter((p) => (!status || p.status === status) && (!term || p.name.toLowerCase().includes(term) || p.owner.toLowerCase().includes(term)))
  const d = data?.district
  const s = data?.stats

  return (
    <>
      {d && (
        <section className="u-card om-district">
          <span className="om-district-icon"><FileText size={22} /></span>
          <div className="om-district-text">
            <h2>{d.name} <span className="u-muted">v{d.version}</span></h2>
            <p>{d.notes}</p>
          </div>
          <dl className="om-district-facts">
            <div><dt>Effective</dt><dd>{fmtDay(d.effectiveDate)}</dd></div>
            <div><dt>Next Review</dt><dd>{fmtDay(d.nextReview)}</dd></div>
            <div><dt>Owner</dt><dd>{d.owner}</dd></div>
            <div><dt>Status</dt><dd><Badge tone={PLAN_STATUS[d.status].tone}>{PLAN_STATUS[d.status].label}</Badge></dd></div>
          </dl>
          <button type="button" className="u-btn u-btn-outline" onClick={() => setEditing(d)}><Pencil size={14} />Update Plan</button>
        </section>
      )}

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title"><Building2 size={16} /> Facility O&amp;M Plans</h2>
          <div className="om-head-actions">
            {s && (
              <div className="om-plan-pills" role="group" aria-label="Filter by review status">
                {[['', `All ${s.total}`], ['current', `Current ${s.current}`], ['reviewDue', `Review due ${s.reviewDue}`], ['reviewOverdue', `Overdue ${s.reviewOverdue}`]].map(([v, label]) => (
                  <button key={v || 'all'} type="button" className={status === v ? 'active' : undefined} onClick={() => setStatus(v)}>{label}</button>
                ))}
              </div>
            )}
            <label className="u-search om-plan-search"><Search size={15} /><input type="search" placeholder="School or owner…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search plans" /></label>
          </div>
        </header>
        <div className="u-table-wrap">
          <table className="u-table ai-table">
            <thead><tr><th>Facility Plan</th><th>Version</th><th>Effective</th><th>Next Review</th><th>Owner</th><th className="num">Open Activities</th><th>Document</th><th>Status</th><th className="om-col-actions"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {facility.map((p) => (
                <tr key={p.id}>
                  <td className="in-wrap"><strong className="in-plain">{p.name}</strong></td>
                  <td>{p.version}</td>
                  <td className="u-nowrap">{fmtDay(p.effectiveDate)}</td>
                  <td className="u-nowrap">{fmtDay(p.nextReview)}</td>
                  <td className="u-nowrap">{p.owner}</td>
                  <td className="num">{p.openActivities ? <Link to="/operations/work-orders" className="sv-id">{p.openActivities}</Link> : <span className="u-muted">0</span>}</td>
                  <td>{p.attachments.length ? <a href={`${API_BASE}/om/plans/${p.id}/attachments/${p.attachments.at(-1).id}`} target="_blank" rel="noreferrer" className="ai-link"><FileText size={13} />PDF</a> : <span className="u-muted">—</span>}</td>
                  <td><Badge tone={PLAN_STATUS[p.status].tone}>{PLAN_STATUS[p.status].label}</Badge></td>
                  <td className="om-col-actions"><button type="button" className="u-row-btn" onClick={() => setEditing(p)} aria-label={`Update ${p.name}`} title="Update"><Pencil size={14} /></button></td>
                </tr>
              ))}
              {data && !facility.length && <tr><td colSpan={9} className="u-empty">No plans match.</td></tr>}
              {!data && <tr><td colSpan={9} className="u-empty">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <PlanDialog plan={editing} onToast={onToast} onClose={() => { setEditing(null); setReload((n) => n + 1) }}
          onSaved={(p) => { setEditing(null); setReload((n) => n + 1); onToast({ kind: 'success', text: `${p.name} saved` }) }} />
      )}
    </>
  )
}
