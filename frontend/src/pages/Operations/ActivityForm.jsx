import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  Wrench, ArrowLeft, Save, Play, CircleCheck, CircleAlert, Trash2, Upload, Download, FileText, Image as ImageIcon, MapPin,
  History as HistoryIcon, ShieldCheck, TriangleAlert, Layers, GraduationCap, BookOpen,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import Badge from '../AcmInventory/Badge'
import { fmtDay, isoToday, addDays, shortAcm, floorLink } from '../Surveillance/survMeta'
import { fmtDateTime, request, uploadFile, API_BASE } from '../../lib/api'
import { STATUS_TONE, PRIORITY_TONE } from './omMeta'
import '../Users/users.css'
import '../Audit/audit.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import '../Inspections/inspections.css'
import './operations.css'

const blank = (materialId) => ({
  type: '', materialId: materialId ?? '', description: '', priority: 'Medium', dueDate: addDays(isoToday(), 14), assignedToId: '',
  state: 'pending', work: { performedOn: isoToday(), hours: '', notes: '', controls: {} },
})
const fromActivity = (a) => ({
  type: a.type, materialId: a.materialId, description: a.description, priority: a.priority, dueDate: a.dueDate, assignedToId: a.assignedToId ?? '',
  state: a.state, work: a.work ? { ...a.work, hours: a.work.hours ?? '' } : { performedOn: isoToday(), hours: '', notes: '', controls: {} },
})
const Err = ({ msg }) => (msg ? <em className="uf-error">{msg}</em> : null)

export default function ActivityForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef(null)

  const [meta, setMeta] = useState(null)
  const [materials, setMaterials] = useState([])
  const [detail, setDetail] = useState(null) // { activity, material, location, assigneeTraining, plan }
  const [form, setForm] = useState(() => blank(params.get('material')))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)

  useEffect(() => {
    request('/om/meta').then(setMeta).catch((e) => setLoadError(e.message))
    if (!id) request('/om/materials').then(setMaterials).catch(() => {})
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    request(`/om/activities/${id}`)
      .then((d) => { if (!cancelled) { setDetail(d); setForm(fromActivity(d.activity)) } })
      .catch((e) => { if (!cancelled) setLoadError(e.status === 404 ? 'notFound' : e.message) })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const a = detail?.activity
  const locked = a?.state === 'completed'
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })) }
  const setWork = (k) => (v) => { setForm((f) => ({ ...f, work: { ...f.work, [k]: v } })); setErrors((e) => ({ ...e, [`work.${k}`]: undefined })) }
  const setControl = (k) => (v) => setForm((f) => ({ ...f, work: { ...f.work, controls: { ...f.work.controls, [k]: v } } }))

  // Training needed for the chosen work, and whether the chosen person has it
  const type = meta?.types.find((t) => t.value === form.type)
  const person = meta?.assignees.find((p) => p.id === form.assignedToId)
  const personTraining = type && person ? person.training[type.training] : null

  const save = async (state) => {
    setSaving(state)
    setErrors({})
    const body = { ...form, state, work: state === 'pending' && !a ? null : form.work }
    try {
      const res = a
        ? await request(`/om/activities/${a.id}`, { method: 'PUT', body })
        : await request('/om/activities', { method: 'POST', body })
      const text = !a ? `${res.activity.id} created and assigned to ${res.activity.assignedToName}.`
        : state === 'completed' ? `${a.id} completed — kept in O&M History.` : state === 'inProgress' && a.state === 'pending' ? `${a.id} started.` : `${a.id} saved.`
      if (!a) navigate(`/operations/activities/${res.activity.id}`, { replace: true, state: { toast: { kind: 'success', text } } })
      else { setDetail(res); setForm(fromActivity(res.activity)); setToast({ kind: 'success', text }) }
    } catch (e) {
      setErrors(e.fields ?? {})
      setToast({ kind: 'error', text: e.message })
    } finally {
      setSaving(null)
    }
  }

  const complete = async () => {
    if (!(await confirm({ title: `Complete ${a.id}?`, message: 'The work record is locked once completed and kept in O&M History.', confirmLabel: 'Mark Complete' }))) return
    save('completed')
  }
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${a.id}?`, message: 'This activity hasn’t started and will be removed.', confirmLabel: 'Delete Activity', tone: 'danger' }))) return
    try {
      await request(`/om/activities/${a.id}`, { method: 'DELETE' })
      navigate('/operations', { state: { toast: { kind: 'success', text: `Deleted ${a.id}` } } })
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }
  const upload = async (file) => {
    try {
      const f = await uploadFile(`/om/activities/${a.id}/attachments`, file)
      setDetail((d) => ({ ...d, activity: { ...d.activity, attachments: [...d.activity.attachments, f], history: [...d.activity.history, { at: new Date().toISOString(), by: 'You', action: `Attached ${f.name}` }] } }))
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }
  const removeFile = async (f) => {
    if (!(await confirm({ title: `Remove ${f.name}?`, message: 'The file will be deleted from this activity.', confirmLabel: 'Remove', tone: 'danger' }))) return
    try {
      await request(`/om/activities/${a.id}/attachments/${f.id}`, { method: 'DELETE' })
      setDetail((d) => ({ ...d, activity: { ...d.activity, attachments: d.activity.attachments.filter((x) => x.id !== f.id) } }))
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  if (loadError === 'notFound') return <div className="coming-soon"><strong>O&amp;M activity not found</strong><span><Link to="/operations">Back to O&amp;M</Link></span></div>

  const mat = detail?.material
  const loc = detail?.location
  const pickedMaterial = materials.find((m) => m.id === form.materialId)
  const showWork = a && a.state !== 'pending'

  return (
    <div className="ai-page om-form">
      <div className="ai-head">
        <div>
          <h1><Wrench size={24} />{a ? <>{a.id}<Badge tone={STATUS_TONE[a.status]}>{a.statusLabel}</Badge></> : 'New O&M Activity'}</h1>
          <p className="om-sub">{a ? `${a.type} · created ${fmtDateTime(a.createdAt)} by ${a.createdBy?.name}` : 'Select the ACM, describe the work and assign a trained person.'}</p>
        </div>
        <div className="ai-head-actions">
          <button type="button" className="u-btn u-btn-outline" onClick={() => navigate(-1)}><ArrowLeft size={15} />Back</button>
          {a?.state === 'pending' && <button type="button" className="u-btn u-btn-ghost" onClick={remove}><Trash2 size={15} />Delete</button>}
          {!locked && (
            <button type="button" className="u-btn u-btn-outline" disabled={!!saving} onClick={() => save(a ? a.state : 'pending')}>
              <Save size={15} />{saving === (a?.state ?? 'pending') ? 'Saving…' : a ? 'Save' : 'Create Activity'}
            </button>
          )}
          {a?.state === 'pending' && <button type="button" className="u-btn u-btn-primary" disabled={!!saving} onClick={() => save('inProgress')}><Play size={15} />Start Work</button>}
          {a?.state === 'inProgress' && <button type="button" className="u-btn u-btn-primary" disabled={!!saving} onClick={complete}><CircleCheck size={15} />Mark Complete</button>}
        </div>
      </div>

      {loadError && <div className="u-banner">Couldn't load ({loadError}).</div>}
      {locked && <div className="in-banner ok"><CircleCheck size={16} /><div><strong>Completed {fmtDateTime(a.completedAt)} by {a.completedBy}</strong><span>This record is kept as O&amp;M history and can no longer be changed.</span></div></div>}

      <div className="sv-form-layout">
        <fieldset className="in-fieldset in-stack" disabled={locked}>
          <section className="u-card sv-section">
            <header className="sv-section-head"><h2>Work Order</h2></header>
            <div className="sv-grid sv-grid-2">
              <div className="uf-field">
                <span>Activity Type *</span>
                <SearchSelect variant="field" label="Activity type" value={form.type} onChange={set('type')} searchable={false}
                  options={[{ value: '', label: 'Select the type of work' }, ...(meta?.types ?? []).map((t) => ({ value: t.value, label: t.value }))]} />
                {type && <small className="sv-hint">Requires {type.trainingName}</small>}
                <Err msg={errors.type} />
              </div>
              <div className="uf-field">
                <span>ACM Material *</span>
                {a ? <input className="u-input" readOnly value={mat ? `${shortAcm(mat.id, loc?.schoolId)} – ${mat.name}` : ''} />
                  : (
                    <SearchSelect variant="field" label="ACM material" value={form.materialId} onChange={set('materialId')} searchPlaceholder="Search by material, school or room…"
                      options={[{ value: '', label: 'Select the ACM this work affects' }, ...materials.map((m) => ({ value: m.id, label: `${m.name} — ${m.place}` }))]} />
                  )}
                {!a && pickedMaterial && <small className="sv-hint">{pickedMaterial.acmStatus} · {pickedMaterial.place}</small>}
                <Err msg={errors.materialId} />
              </div>
              <label className="uf-field sv-span-2">
                <span>Description of Work *</span>
                <textarea className={`u-input sv-textarea${errors.description ? ' invalid' : ''}`} rows={2} maxLength={500} value={form.description}
                  onChange={(e) => set('description')(e.target.value)} placeholder="What needs doing, and how the ACM will be protected" />
                <Err msg={errors.description} />
              </label>
              <div className="uf-field">
                <span>Priority</span>
                <div className="in-choice" role="radiogroup" aria-label="Priority">
                  {(meta?.priorities ?? []).map((p) => (
                    <label key={p} className={form.priority === p ? 'on' : undefined}><input type="radio" name="priority" checked={form.priority === p} onChange={() => set('priority')(p)} />{p}</label>
                  ))}
                </div>
              </div>
              <label className="uf-field">
                <span>Due Date *</span>
                <input type="date" className={`u-input${errors.dueDate ? ' invalid' : ''}`} value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
                <Err msg={errors.dueDate} />
              </label>
              <div className="uf-field sv-span-2">
                <span>Assigned To *</span>
                <SearchSelect variant="field" label="Assigned to" value={form.assignedToId} onChange={set('assignedToId')} searchPlaceholder="Search maintenance, custodial or contractor staff…"
                  options={[{ value: '', label: 'Select the responsible person' }, ...(meta?.assignees ?? []).map((p) => ({ value: p.id, label: `${p.name} — ${p.category}${type && !p.training[type.training].ok ? ' (not trained for this work)' : ''}` }))]} />
                {personTraining && (personTraining.ok
                  ? <small className="sv-hint om-ok"><ShieldCheck size={12} />{person.name} holds current {personTraining.program}{personTraining.expiresOn ? ` (to ${fmtDay(personTraining.expiresOn)})` : ''}</small>
                  : <small className="sv-hint sv-late"><TriangleAlert size={12} />{person.name}’s {personTraining.program} is {personTraining.status === 'missing' ? 'not on record' : 'expired'} — AHERA requires it for this work.</small>)}
                <Err msg={errors.assignedToId} />
              </div>
            </div>
          </section>

          {showWork && (
            <section className="u-card sv-section">
              <header className="sv-section-head"><h2>Work Performed</h2>{a.state === 'inProgress' && <span className="u-muted om-head-note">Required to complete</span>}</header>
              <div className="sv-grid sv-grid-2">
                <label className="uf-field">
                  <span>Date Performed {a.state === 'inProgress' && '*'}</span>
                  <input type="date" className={`u-input${errors['work.performedOn'] ? ' invalid' : ''}`} value={form.work.performedOn} max={isoToday()} onChange={(e) => setWork('performedOn')(e.target.value)} />
                  <Err msg={errors['work.performedOn']} />
                </label>
                <label className="uf-field">
                  <span>Hours Worked</span>
                  <input type="number" min="0" max="200" step="0.5" className={`u-input${errors['work.hours'] ? ' invalid' : ''}`} value={form.work.hours} onChange={(e) => setWork('hours')(e.target.value)} />
                  <Err msg={errors['work.hours']} />
                </label>
                <div className="uf-field sv-span-2">
                  <span>Work-Practice Controls Used</span>
                  <div className="om-controls">
                    {(meta?.controls ?? []).map((c) => (
                      <label key={c.key}><input type="checkbox" checked={Boolean(form.work.controls?.[c.key])} onChange={(e) => setControl(c.key)(e.target.checked)} />{c.label}</label>
                    ))}
                  </div>
                </div>
                <label className="uf-field sv-span-2">
                  <span>Work Notes {a.state === 'inProgress' && '*'}</span>
                  <textarea className={`u-input sv-textarea${errors['work.notes'] ? ' invalid' : ''}`} rows={3} maxLength={1000} value={form.work.notes}
                    onChange={(e) => setWork('notes')(e.target.value)} placeholder="What was done, any change in the ACM’s condition, waste handling" />
                  <Err msg={errors['work.notes']} />
                </label>
              </div>
            </section>
          )}
        </fieldset>

        <aside className="sv-form-side">
          {a && (
            <section className="u-card sv-side-card">
              <div className="sv-side-head">
                <h3><FileText size={16} />Photos &amp; Documents</h3>
                {!locked && (
                  <>
                    <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
                    <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Upload</button>
                  </>
                )}
              </div>
              {a.attachments.length ? (
                <ul className="sv-docs">
                  {a.attachments.map((f) => (
                    <li key={f.id}>
                      {f.mime === 'application/pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                      <a href={`${API_BASE}/om/activities/${a.id}/attachments/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                      <a className="u-row-btn" href={`${API_BASE}/om/activities/${a.id}/attachments/${f.id}?download=1`} aria-label={`Download ${f.name}`}><Download size={14} /></a>
                      {!locked && <button type="button" className="u-row-btn" onClick={() => removeFile(f)} aria-label={`Remove ${f.name}`}><Trash2 size={14} /></button>}
                    </li>
                  ))}
                </ul>
              ) : <p className="u-muted sv-empty-line">Before/after photos, waste manifests, air results (PDF or images, up to 10 MB).</p>}
            </section>
          )}

          {mat && (
            <section className="u-card sv-side-card">
              <h3><Layers size={16} />ACM Material</h3>
              <dl className="sv-dl">
                <div><dt>ACM ID</dt><dd className="ai-id" title={mat.id}>{shortAcm(mat.id, loc?.schoolId)}</dd></div>
                <div><dt>Material</dt><dd>{mat.name}</dd></div>
                <div><dt>Status</dt><dd>{mat.acmStatus} · {mat.friability}</dd></div>
                <div><dt>Condition</dt><dd>{mat.condition}</dd></div>
                <div><dt>Quantity</dt><dd>{mat.quantity?.toLocaleString('en-US')} {mat.unit}</dd></div>
                <div><dt>Location</dt><dd>{loc.schoolName} · {loc.buildingName} · {loc.floorName} · {loc.roomNumber} {loc.roomName}</dd></div>
              </dl>
              <Link to={floorLink(loc)} className="ai-link sv-side-link"><MapPin size={13} />Open room on floor plan</Link>
            </section>
          )}

          {detail?.assigneeTraining && (
            <section className="u-card sv-side-card">
              <h3><GraduationCap size={16} />Assignee Training</h3>
              <p className={`om-train ${detail.assigneeTraining.ok ? 'ok' : 'bad'}`}>
                {detail.assigneeTraining.ok ? <ShieldCheck size={15} /> : <TriangleAlert size={15} />}
                <span><strong>{detail.assigneeTraining.name}</strong> · {detail.assigneeTraining.category}<br />{detail.assigneeTraining.program}: {detail.assigneeTraining.ok ? 'current' : detail.assigneeTraining.status === 'missing' ? 'not on record' : 'expired'}</span>
              </p>
              <Link to="/personnel" className="ai-link sv-side-link">Personnel &amp; training records</Link>
            </section>
          )}

          {detail?.plan && (
            <section className="u-card sv-side-card">
              <h3><BookOpen size={16} />Facility O&amp;M Plan</h3>
              <p className="sv-empty-line">{detail.plan.name} · v{detail.plan.version}<br /><span className="u-muted">Next review {fmtDay(detail.plan.nextReview)}</span></p>
              <Link to="/operations/plans" className="ai-link sv-side-link">View plans</Link> · <Link to="/operations/procedures" className="ai-link">Procedures &amp; SOPs</Link>
            </section>
          )}

          {a && (
            <section className="u-card sv-side-card">
              <h3><HistoryIcon size={16} />History</h3>
              <ol className="om-timeline">
                {[...a.history].reverse().map((h, i) => (
                  <li key={`${h.at}-${i}`}><strong>{h.action}</strong><small>{fmtDateTime(h.at)} · {h.by}</small></li>
                ))}
              </ol>
            </section>
          )}
          {a && <p className="om-meta-line"><Badge tone={PRIORITY_TONE[a.priority]}>{a.priority} priority</Badge> Due {fmtDay(a.dueDate)}</p>}
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
