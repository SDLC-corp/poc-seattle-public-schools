import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  ShieldCheck, ArrowLeft, Save, ClipboardCheck, Plus, Trash2, Upload, Download, FileText, MapPin, History, Info,
  CircleCheck, CircleAlert, Eraser, Building2, ExternalLink,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import Badge from '../AcmInventory/Badge'
import SignaturePad from './SignaturePad'
import { TABS, CONDITION_TONE, STATUS, ACTION_TONE, fmtDay, isoToday, addDays, shortAcm, floorLink } from './survMeta'
import { request, uploadFile, API_BASE } from '../../lib/api'
import { useGoBack } from '../../lib/useGoBack'
import '../Users/users.css'
import '../Audit/audit.css'
import '../AcmInventory/acmInventory.css'
import './surveillance.css'

const EMPTY = {
  materialId: '', date: '', inspectorId: '', condition: '', changed: null, correctiveAction: null, nextDue: '',
  comments: '', signature: { image: null, date: '' }, actionItems: [],
}

function YesNo({ name, value, onChange, error }) {
  return (
    <div className={`sv-radios${error ? ' invalid' : ''}`} role="radiogroup" aria-label={name}>
      {[[true, 'Yes'], [false, 'No']].map(([v, label]) => (
        <label key={label}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{label}
        </label>
      ))}
    </div>
  )
}

const Err = ({ msg }) => (msg ? <em className="uf-error">{msg}</em> : null)

export default function SurveillanceForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const goBack = useGoBack('/surveillance')
  const routerLocation = useLocation()
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef(null)

  const [meta, setMeta] = useState(null)
  const [materials, setMaterials] = useState([])
  const [record, setRecord] = useState(null)
  const [ctx, setCtx] = useState(null) // { material, location, history }
  const [form, setForm] = useState(() => ({ ...EMPTY, materialId: params.get('material') ?? '', date: isoToday(), nextDue: '', signature: { image: null, date: isoToday() } }))
  const [touched, setTouched] = useState({ changed: false, nextDue: false })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(null) // 'draft' | 'record' | null
  const [loadError, setLoadError] = useState(null)
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)

  useEffect(() => {
    request('/surveillance/meta').then(setMeta).catch((e) => setLoadError(e.message))
    request('/surveillance/materials').then(setMaterials).catch(() => {})
  }, [])

  // Editing: load the record and its material context
  useEffect(() => {
    if (!id) return
    let cancelled = false
    request(`/surveillance/records/${id}`)
      .then((d) => {
        if (cancelled) return
        setRecord(d.record)
        setCtx({ material: d.material, location: d.location, history: d.history })
        const r = d.record
        setForm({
          materialId: r.materialId, date: r.date, inspectorId: r.inspectorId ?? '', condition: r.condition ?? '', changed: r.changed,
          correctiveAction: r.correctiveAction, nextDue: r.nextDue ?? '', comments: r.comments ?? '',
          signature: { image: r.signature?.image ?? null, date: r.signature?.date ?? '' }, actionItems: r.actionItems ?? [],
        })
        setTouched({ changed: true, nextDue: true })
      })
      .catch((e) => { if (!cancelled) setLoadError(e.status === 404 ? 'notFound' : e.message) })
    return () => { cancelled = true }
  }, [id])

  // New record: the side panel follows the chosen material
  useEffect(() => {
    if (id || !form.materialId) return
    let cancelled = false
    request(`/surveillance/material/${encodeURIComponent(form.materialId)}`)
      .then((d) => { if (!cancelled) setCtx(d) })
      .catch(() => { if (!cancelled) setCtx(null) })
    return () => { cancelled = true }
  }, [id, form.materialId])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const interval = meta?.intervalDays ?? 182
  const last = ctx?.history?.[0] ?? null
  const isDraft = !record || record.status === 'draft'
  const shownCtx = ctx && ctx.material?.id === form.materialId ? ctx : null

  const set = (key) => (value) => {
    setForm((f) => {
      const next = { ...f, [key]: value }
      // Until the user sets them: "changed?" follows the last surveillance, next due follows the date (+6 months)
      if (key === 'condition' && !touched.changed) next.changed = last ? last.condition !== value : false
      if (key === 'date' && !touched.nextDue && value) next.nextDue = addDays(value, interval)
      if (key === 'correctiveAction' && value && !f.actionItems.length) {
        next.actionItems = [{ id: 'AI-1', text: '', dueDate: addDays(f.date || isoToday(), 30), assignedTo: meta?.teams[1] ?? '', status: 'Open' }]
      }
      return next
    })
    if (key === 'changed' || key === 'nextDue') setTouched((t) => ({ ...t, [key]: true }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  // Fill the default next-due date once the interval is known
  if (!form.nextDue && !touched.nextDue && form.date && meta) setForm((f) => ({ ...f, nextDue: addDays(f.date, interval) }))

  const setItem = (i, key) => (value) => {
    setForm((f) => ({ ...f, actionItems: f.actionItems.map((a, k) => (k === i ? { ...a, [key]: value } : a)) }))
    setErrors((e) => ({ ...e, [`actionItems.${i}.${key}`]: undefined, actionItems: undefined }))
  }
  const addItem = () => setForm((f) => {
    const n = f.actionItems.reduce((m, a) => Math.max(m, Number(String(a.id).split('-')[1]) || 0), 0) + 1
    return { ...f, actionItems: [...f.actionItems, { id: `AI-${n}`, text: '', dueDate: addDays(f.date || isoToday(), 30), assignedTo: meta?.teams[0] ?? '', status: 'Open' }] }
  })
  const removeItem = (i) => setForm((f) => ({ ...f, actionItems: f.actionItems.filter((_, k) => k !== i) }))

  const save = async (state) => {
    setSaving(state === 'draft' ? 'draft' : 'record')
    setErrors({})
    try {
      const body = { ...form, state }
      const res = record
        ? await request(`/surveillance/records/${record.id}`, { method: 'PUT', body })
        : await request('/surveillance', { method: 'POST', body })
      const change = res.conditionChange ? ` ACM condition updated: ${res.conditionChange.from} → ${res.conditionChange.to}.` : ''
      const text = state === 'draft' ? `Draft ${res.record.id} saved.` : `Surveillance ${res.record.id} recorded.${change}`
      if (!record) {
        navigate(`/surveillance/records/${res.record.id}`, { replace: true, state: { toast: { kind: 'success', text } } })
      } else {
        setRecord(res.record)
        setToast({ kind: 'success', text: record.status === 'draft' || state === 'draft' ? text : `Changes to ${res.record.id} saved.${change}` })
      }
    } catch (e) {
      setErrors(e.fields ?? {})
      setToast({ kind: 'error', text: e.message })
    } finally {
      setSaving(null)
    }
  }

  const upload = async (file) => {
    try {
      const f = await uploadFile(`/surveillance/records/${record.id}/attachments`, file)
      setRecord((r) => ({ ...r, attachments: [...r.attachments, f] }))
      setToast({ kind: 'success', text: `Uploaded ${f.name}` })
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }
  const removeDoc = async (f) => {
    if (!(await confirm({ title: `Remove ${f.name}?`, message: 'The document will be deleted from this surveillance record.', confirmLabel: 'Remove', tone: 'danger' }))) return
    try {
      await request(`/surveillance/records/${record.id}/attachments/${f.id}`, { method: 'DELETE' })
      setRecord((r) => ({ ...r, attachments: r.attachments.filter((x) => x.id !== f.id) }))
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  if (loadError === 'notFound') {
    return (
      <div className="coming-soon">
        <strong>Surveillance record not found</strong>
        <span><Link to="/surveillance">Back to the surveillance list</Link></span>
      </div>
    )
  }

  const inspector = meta?.inspectors.find((u) => u.id === form.inspectorId)
  const loc = shownCtx?.location
  const mat = shownCtx?.material
  const materialOptions = materials.length || !mat ? materials : [{ id: mat.id, name: mat.name, place: '' }]

  return (
    <div className="ai-page sv-page">
      <div className="ai-head">
        <h1><ShieldCheck size={24} />Surveillance</h1>
        <div className="ai-head-actions">
          <button type="button" className="u-btn u-btn-outline" onClick={goBack}><ArrowLeft size={15} />Back</button>
          {isDraft && (
            <button type="button" className="u-btn u-btn-outline" disabled={!!saving} onClick={() => save('draft')}>
              <Save size={15} />{saving === 'draft' ? 'Saving…' : 'Save Draft'}
            </button>
          )}
          <button type="button" className="u-btn u-btn-primary" disabled={!!saving} onClick={() => save('recorded')}>
            <ClipboardCheck size={15} />{saving === 'record' ? 'Saving…' : isDraft ? 'Record Surveillance' : 'Save Changes'}
          </button>
        </div>
      </div>

      <nav className="u-tabs ai-tabs" aria-label="Surveillance views">
        <span className="u-tab active" aria-current="page">Surveillance Form</span>
        {TABS.filter((t) => t.id !== 'list').map((t) => <Link key={t.id} to={t.path} className="u-tab">{t.label}</Link>)}
      </nav>

      {loadError && <div className="u-banner">Couldn't load the form ({loadError}).</div>}

      <div className="sv-form-layout">
        <div className="sv-form-main">
          <section className="u-card sv-section">
            <header className="sv-section-head">
              <h2>Surveillance Details</h2>
              {record && <Badge tone={STATUS[record.status].tone}>{STATUS[record.status].label}</Badge>}
            </header>
            <div className="sv-grid sv-grid-3">
              <label className="uf-field">
                <span>Surveillance ID</span>
                <input className="u-input" value={record?.id ?? `${meta?.nextId ?? '…'} (assigned on save)`} readOnly />
              </label>
              <label className="uf-field">
                <span>Surveillance Date *</span>
                <input type="date" className={`u-input${errors.date ? ' invalid' : ''}`} value={form.date} max={isoToday()} onChange={(e) => set('date')(e.target.value)} />
                <Err msg={errors.date} />
              </label>
              <div className="uf-field">
                <span>Inspector / Personnel *</span>
                <SearchSelect variant="field" label="Inspector" value={form.inspectorId} onChange={set('inspectorId')} searchPlaceholder="Search people…"
                  options={[{ value: '', label: 'Select a person' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: `${u.name}${u.title ? ` – ${u.title}` : ''}` }))]} />
                <Err msg={errors.inspectorId} />
              </div>
              <div className="uf-field sv-span-2">
                <span>Associated ACM *</span>
                {isDraft ? (
                  <SearchSelect variant="field" label="Associated ACM" value={form.materialId} onChange={set('materialId')} searchPlaceholder="Search by material, school or room…"
                    options={[{ value: '', label: 'Select the ACM being surveyed' }, ...materialOptions.map((m) => ({ value: m.id, label: `${m.name} — ${m.place}` }))]} />
                ) : (
                  <input className="u-input" value={mat ? `${shortAcm(mat.id, loc?.schoolId)} – ${mat.name}` : ''} readOnly title="The ACM of a recorded surveillance can't be changed" />
                )}
                <Err msg={errors.materialId} />
              </div>
              <label className="uf-field">
                <span>Location</span>
                <input className="u-input" readOnly value={loc ? `${loc.buildingName} / ${loc.floorName} / ${loc.roomNumber} ${loc.roomName}` : ''} placeholder="Follows the ACM" />
              </label>
            </div>
          </section>

          <section className="u-card sv-section">
            <header className="sv-section-head"><h2>Condition &amp; Assessment</h2></header>
            <div className="sv-grid sv-grid-2">
              <div className="uf-field">
                <span>Current Condition of Material *</span>
                <div className={`sv-radios${errors.condition ? ' invalid' : ''}`} role="radiogroup" aria-label="Current condition">
                  {(meta?.conditions ?? []).map((c) => (
                    <label key={c}><input type="radio" name="condition" checked={form.condition === c} onChange={() => set('condition')(c)} />{c}</label>
                  ))}
                </div>
                <Err msg={errors.condition} />
              </div>
              <div className="uf-field">
                <span>Has the condition changed since the last surveillance? *</span>
                <YesNo name="changed" value={form.changed} onChange={set('changed')} error={errors.changed} />
                {last && <small className="sv-hint">Last: {last.condition} on {fmtDay(last.date)}</small>}
                <Err msg={errors.changed} />
              </div>
              <div className="uf-field">
                <span>Is corrective action required? *</span>
                <YesNo name="corrective" value={form.correctiveAction} onChange={set('correctiveAction')} error={errors.correctiveAction} />
                <Err msg={errors.correctiveAction} />
              </div>
              <label className="uf-field">
                <span>Next Surveillance Due Date *</span>
                <input type="date" className={`u-input sv-date${errors.nextDue ? ' invalid' : ''}`} value={form.nextDue} min={form.date || undefined}
                  max={form.date ? addDays(form.date, interval) : undefined} onChange={(e) => set('nextDue')(e.target.value)} />
                <small className="sv-hint">At most 6 months after the surveillance date (AHERA).</small>
                <Err msg={errors.nextDue} />
              </label>
            </div>
            {mat && form.condition && mat.condition !== form.condition && (
              <p className="sv-callout"><Info size={14} /><span>Recording this will update the material's condition in the ACM inventory from <strong>{mat.condition}</strong> to <strong>{form.condition}</strong>.</span></p>
            )}
          </section>

          <section className="u-card sv-section">
            <header className="sv-section-head"><h2>Comments / Observations</h2></header>
            <textarea className="u-input sv-textarea" rows={3} maxLength={1000} value={form.comments} onChange={(e) => set('comments')(e.target.value)}
              placeholder="Describe what you saw: extent of any damage, signs of disturbance or water damage…" aria-label="Comments" />
            <small className="sv-hint sv-count">{form.comments.length}/1000</small>
          </section>

          <section className="u-card sv-section">
            <header className="sv-section-head">
              <h2>Signature</h2>
              {form.signature.image && (
                <button type="button" className="sv-link-btn" onClick={() => set('signature')({ ...form.signature, image: null })}><Eraser size={13} />Clear</button>
              )}
            </header>
            <div className="sv-sign-row">
              <div className="uf-field sv-sign-field">
                <span>Surveillance Personnel * {inspector && <b className="sv-signer">{inspector.name}</b>}</span>
                <SignaturePad value={form.signature.image} invalid={!!errors.signature} label={inspector?.name}
                  onChange={(image) => { set('signature')({ ...form.signature, image }); setErrors((e) => ({ ...e, signature: undefined })) }} />
                {record?.status !== 'draft' && record && !record.signature?.image && !form.signature.image && (
                  <small className="sv-hint">Signed on paper by {record.signature?.name ?? record.inspectorName} (imported record, no signature image).</small>
                )}
                <Err msg={errors.signature} />
              </div>
              <label className="uf-field sv-sign-date">
                <span>Date *</span>
                <input type="date" className={`u-input${errors['signature.date'] ? ' invalid' : ''}`} value={form.signature.date} max={isoToday()}
                  onChange={(e) => set('signature')({ ...form.signature, date: e.target.value })} />
                <Err msg={errors['signature.date']} />
              </label>
            </div>
          </section>

          <section className="u-card sv-section">
            <header className="sv-section-head">
              <h2>Action Items</h2>
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={addItem} disabled={form.actionItems.length >= 20}><Plus size={13} />Add Action Item</button>
            </header>
            <Err msg={errors.actionItems} />
            {form.actionItems.length ? (
              <div className="u-table-wrap">
                <table className="u-table sv-items">
                  <thead><tr><th>Action Item</th><th>Due Date</th><th>Assigned To</th><th>Status</th><th><span className="sr-only">Remove</span></th></tr></thead>
                  <tbody>
                    {form.actionItems.map((a, i) => (
                      <tr key={a.id}>
                        <td>
                          <input className={`u-input${errors[`actionItems.${i}.text`] ? ' invalid' : ''}`} value={a.text} maxLength={200}
                            placeholder="e.g. Repair damaged insulation" onChange={(e) => setItem(i, 'text')(e.target.value)} aria-label={`Action item ${i + 1}`} />
                          <Err msg={errors[`actionItems.${i}.text`]} />
                        </td>
                        <td>
                          <input type="date" className={`u-input${errors[`actionItems.${i}.dueDate`] ? ' invalid' : ''}`} value={a.dueDate}
                            onChange={(e) => setItem(i, 'dueDate')(e.target.value)} aria-label={`Due date of action item ${i + 1}`} />
                          <Err msg={errors[`actionItems.${i}.dueDate`]} />
                        </td>
                        <td className="sv-item-select">
                          <SearchSelect variant="field" label={`Assigned to (item ${i + 1})`} value={a.assignedTo} onChange={setItem(i, 'assignedTo')} searchable={false}
                            options={[{ value: '', label: 'Select a team' }, ...(meta?.teams ?? []).map((t) => ({ value: t, label: t }))]} />
                          <Err msg={errors[`actionItems.${i}.assignedTo`]} />
                        </td>
                        <td className="sv-item-status">
                          <SearchSelect variant="field" label={`Status (item ${i + 1})`} value={a.status} onChange={setItem(i, 'status')} searchable={false}
                            options={(meta?.actionStatuses ?? []).map((s) => ({ value: s, label: s }))} />
                        </td>
                        <td className="ai-col-actions">
                          <button type="button" className="u-row-btn" onClick={() => removeItem(i)} aria-label={`Remove action item ${i + 1}`}><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="u-muted sv-empty-line">No action items. Add one if follow-up work is needed.</p>}
          </section>

          <section className="u-card sv-section">
            <header className="sv-section-head">
              <h2>Documents</h2>
              {record && (
                <>
                  <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
                  <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Upload Document</button>
                </>
              )}
            </header>
            {!record && <p className="u-muted sv-empty-line">Save the draft first, then attach photos or reports (PDF, JPG, PNG, WebP — up to 10 MB).</p>}
            {record && !record.attachments.length && <p className="u-muted sv-empty-line">No documents attached.</p>}
            {record?.attachments.length > 0 && (
              <ul className="sv-docs">
                {record.attachments.map((f) => (
                  <li key={f.id}>
                    <FileText size={16} />
                    <a href={`${API_BASE}/surveillance/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                    <small className="u-muted">{(f.size / 1024).toFixed(0)} KB</small>
                    <a className="u-row-btn" href={`${API_BASE}/surveillance/records/${record.id}/attachments/${f.id}?download=1`} aria-label={`Download ${f.name}`}><Download size={14} /></a>
                    <button type="button" className="u-row-btn" onClick={() => removeDoc(f)} aria-label={`Remove ${f.name}`}><Trash2 size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="sv-form-side">
          <section className="u-card sv-side-card">
            <h3><ShieldCheck size={16} />ACM Information</h3>
            {mat ? (
              <dl className="sv-dl">
                <div><dt>ACM ID</dt><dd className="ai-id" title={mat.id}>{shortAcm(mat.id, loc?.schoolId)}</dd></div>
                <div><dt>Material</dt><dd>{mat.name}</dd></div>
                <div><dt>Type</dt><dd>{mat.materialType}</dd></div>
                <div><dt>Category</dt><dd>{mat.friability} · {mat.classification}</dd></div>
                <div><dt>ACM Status</dt><dd>{mat.acmStatus}</dd></div>
                <div><dt>Condition</dt><dd><Badge tone={CONDITION_TONE[mat.condition]}>{mat.condition}</Badge></dd></div>
                <div><dt>Quantity</dt><dd>{mat.quantity.toLocaleString('en-US')} {mat.unit}</dd></div>
                <div><dt>Location</dt><dd>{mat.location}</dd></div>
              </dl>
            ) : <p className="u-muted sv-empty-line">Choose the associated ACM to see its details.</p>}
          </section>

          {loc && (
            <section className="u-card sv-side-card">
              <h3><Building2 size={16} />Location Information</h3>
              <dl className="sv-dl">
                <div><dt>Facility</dt><dd>{loc.schoolName}</dd></div>
                <div><dt>Building</dt><dd>{loc.buildingName}</dd></div>
                <div><dt>Floor</dt><dd>{loc.floorName}</dd></div>
                <div><dt>Room</dt><dd>{loc.roomNumber} – {loc.roomName}</dd></div>
              </dl>
              <Link to={floorLink(loc)} className="ai-link sv-side-link"><MapPin size={13} />Open room on floor plan</Link>
            </section>
          )}

          {shownCtx && (
            <section className="u-card sv-side-card">
              <div className="sv-side-head">
                <h3><History size={16} />Surveillance History</h3>
                {shownCtx.history.length > 0 && (
                  <Link to="/surveillance" state={{ q: mat.id }} className="ai-link">View All <ExternalLink size={12} /></Link>
                )}
              </div>
              {shownCtx.history.length ? (
                <table className="u-table sv-history">
                  <thead><tr><th>Date</th><th>Condition</th><th>Inspector</th></tr></thead>
                  <tbody>
                    {shownCtx.history.slice(0, 5).map((h) => (
                      <tr key={h.id}>
                        <td className="u-nowrap"><Link to={`/surveillance/records/${h.id}`} className="sv-id">{fmtDay(h.date)}</Link></td>
                        <td><Badge tone={CONDITION_TONE[h.condition]}>{h.condition}</Badge></td>
                        <td>{h.inspectorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="u-muted sv-empty-line">No earlier surveillance of this material.</p>}
            </section>
          )}

          {record && record.actionItems.some((a) => a.status !== 'Closed') && record.correctiveAction && (
            <section className="u-card sv-side-card">
              <h3><CircleAlert size={16} />Open Actions</h3>
              <ul className="sv-open-actions">
                {record.actionItems.filter((a) => a.status !== 'Closed').map((a) => (
                  <li key={a.id}><Badge tone={ACTION_TONE[a.status]}>{a.status}</Badge><span>{a.text}</span><small>Due {fmtDay(a.dueDate)}</small></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {confirmDialog}
      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
