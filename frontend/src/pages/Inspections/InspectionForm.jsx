import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  ClipboardCheck, ArrowLeft, Save, Send, Plus, Trash2, Upload, Download, FileText, Image as ImageIcon, MapPin, History, Info,
  CircleCheck, CircleAlert, Eraser, BadgeCheck, Undo2, Circle, TriangleAlert, ListChecks,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import Badge from '../AcmInventory/Badge'
import SignaturePad from '../Surveillance/SignaturePad'
import { fmtDay, isoToday, addDays, shortAcm, floorLink } from '../Surveillance/survMeta'
import { STATE_TONE, CONDITION_TONE, CHANGE_TONE, SECTIONS, conditionChange, fmtTime } from './inspMeta'
import { request, uploadFile, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import './inspections.css'

const blankForm = (materialId) => ({
  type: '', date: isoToday(), inspectorId: '', materialId: materialId ?? '', locationDescription: '', homogeneousAreaId: '',
  assessment: { currentCondition: '', previousCondition: null, damageType: '', damageExtent: '', waterDamage: '', potentialDisturbance: '', labelled: '', managementPlanUpdated: '' },
  checklist: {},
  sampling: { required: '', sampleId: '', collectionDate: '', sampleLocation: '', laboratory: '', result: 'Pending' },
  risk: { priority: '', damageSeverity: '', recommendedAction: '', immediateAttention: '', followUpRequired: '', targetDate: '' },
  comments: '',
  actionItems: [],
  verification: { inspectorSignature: null, completionDate: isoToday() },
})

// A scheduled (not yet started) inspection starts with today as the inspection date
const fromRecord = (r) => ({
  type: r.type ?? '', date: r.date ?? isoToday(), inspectorId: r.inspectorId ?? '', materialId: r.materialId, locationDescription: r.locationDescription ?? '',
  homogeneousAreaId: r.homogeneousAreaId ?? '', assessment: { ...blankForm().assessment, ...r.assessment }, checklist: { ...r.checklist },
  sampling: { ...blankForm().sampling, ...r.sampling }, risk: { ...blankForm().risk, ...r.risk }, comments: r.comments ?? '',
  actionItems: r.actionItems ?? [],
  verification: { inspectorSignature: r.verification?.inspectorSignature ?? null, completionDate: r.verification?.completionDate || (r.state === 'scheduled' ? isoToday() : '') },
})

const Err = ({ msg }) => (msg ? <em className="uf-error">{msg}</em> : null)

// Pill-style radio group for short option lists
function Choice({ name, options, value, onChange, error }) {
  return (
    <div className={`in-choice${error ? ' invalid' : ''}`} role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o} className={value === o ? 'on' : undefined}>
          <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />{o}
        </label>
      ))}
    </div>
  )
}

function Section({ id, n, title, hint, aside, children }) {
  return (
    <section className="u-card sv-section in-section" id={`sec-${id}`}>
      <header className="sv-section-head">
        <h2><span className="in-num">{n}</span>{title}</h2>
        {aside}
      </header>
      {hint && <p className="in-hint">{hint}</p>}
      {children}
    </section>
  )
}

const ReadRow = ({ label, children }) => (
  <div className="in-read"><span>{label}</span><strong>{children || <span className="u-muted">—</span>}</strong></div>
)

export default function InspectionForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef(null)

  const [meta, setMeta] = useState(null)
  const [materials, setMaterials] = useState([])
  const [record, setRecord] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [form, setForm] = useState(() => blankForm(params.get('material')))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [docCategory, setDocCategory] = useState('Material Condition Photo')
  const [review, setReview] = useState({ reviewerId: '', signature: null, comments: '' })
  const [toast, setToast] = useState(() => routerLocation.state?.toast ?? null)

  useEffect(() => {
    request('/inspection-records/meta').then(setMeta).catch((e) => setLoadError(e.message))
    request('/inspection-records/materials').then(setMaterials).catch(() => {})
  }, [])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    request(`/inspection-records/records/${id}`)
      .then((d) => {
        if (cancelled) return
        setRecord(d.record)
        setCtx({ material: d.material, location: d.location, history: d.history, previousCondition: d.previousCondition })
        const f = fromRecord(d.record)
        // Starting an assigned inspection: same defaults as a new one
        if (d.record.state === 'scheduled') {
          f.assessment.previousCondition ??= d.previousCondition
          f.locationDescription ||= [d.material.location, d.location.roomName].filter(Boolean).join(', ')
        }
        setForm(f)
      })
      .catch((e) => { if (!cancelled) setLoadError(e.status === 404 ? 'notFound' : e.message) })
    return () => { cancelled = true }
  }, [id])

  // New inspection: the ACM details follow the chosen material, and its previous condition is filled in
  useEffect(() => {
    if (id || !form.materialId) return
    let cancelled = false
    request(`/inspection-records/material/${encodeURIComponent(form.materialId)}`)
      .then((d) => {
        if (cancelled) return
        setCtx(d)
        setForm((f) => ({
          ...f,
          assessment: { ...f.assessment, previousCondition: d.previousCondition },
          locationDescription: f.locationDescription || [d.material.location, d.location.roomName].filter(Boolean).join(', '),
        }))
      })
      .catch(() => { if (!cancelled) setCtx(null) })
    return () => { cancelled = true }
  }, [id, form.materialId])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const editable = !record || record.state === 'scheduled' || record.state === 'draft' || record.state === 'returned'
  const shownCtx = ctx && ctx.material?.id === form.materialId ? ctx : null
  const mat = shownCtx?.material
  const loc = shownCtx?.location
  const inspector = meta?.inspectors.find((u) => u.id === form.inspectorId)
  const cert = inspector?.certification ?? record?.certification
  const certExpired = cert?.expiresOn && form.date && cert.expiresOn < form.date
  const change = conditionChange(form.assessment.previousCondition, form.assessment.currentCondition)
  const clearErr = (...keys) => setErrors((e) => { const n = { ...e }; keys.forEach((k) => delete n[k]); return n })

  const set = (key) => (value) => { setForm((f) => ({ ...f, [key]: value })); clearErr(key) }
  // Nested fields, with the answers that follow from each other pre-filled (only while still blank)
  const setIn = (group, key) => (value) => {
    setForm((f) => {
      const next = { ...f, [group]: { ...f[group], [key]: value } }
      if (group === 'assessment' && key === 'currentCondition') {
        const good = value === 'Good'
        next.checklist = { ...f.checklist }
        if (!f.checklist.goodCondition) next.checklist.goodCondition = good ? 'Yes' : 'No'
        if (!f.checklist.damaged) next.checklist.damaged = good ? 'No' : 'Yes'
        if (good && !f.assessment.damageType) next.assessment.damageType = 'None'
        if (good && !f.assessment.damageExtent) next.assessment.damageExtent = 'None'
        if (!f.risk.damageSeverity) next.risk = { ...f.risk, damageSeverity: good ? 'None' : value === 'Damaged' ? 'Moderate' : 'Severe' }
      }
      if (group === 'assessment' && key === 'waterDamage' && !f.checklist.waterDamage) next.checklist = { ...next.checklist, waterDamage: value }
      if (group === 'checklist' && key === 'immediateAction' && value === 'Yes') next.risk = { ...f.risk, immediateAttention: 'Yes' }
      if (group === 'sampling' && key === 'required' && value === 'Yes') {
        next.sampling = { ...next.sampling, collectionDate: f.sampling.collectionDate || f.date, sampleLocation: f.sampling.sampleLocation || f.locationDescription }
      }
      return next
    })
    clearErr(`${group}.${key}`)
  }
  const setItem = (i, key) => (value) => {
    setForm((f) => ({ ...f, actionItems: f.actionItems.map((a, k) => (k === i ? { ...a, [key]: value } : a)) }))
    clearErr(`actionItems.${i}.${key}`, 'actionItems')
  }
  const addItem = () => setForm((f) => {
    const n = f.actionItems.reduce((m, a) => Math.max(m, Number(String(a.id).split('-')[1]) || 0), 0) + 1
    return { ...f, actionItems: [...f.actionItems, { id: `AI-${n}`, action: '', assignedTo: 'Facilities Manager', priority: f.risk.priority || 'Medium', dueDate: f.risk.targetDate || addDays(f.date || isoToday(), 14), status: 'Pending' }] }
  })

  const save = async (state) => {
    setSaving(state)
    setErrors({})
    try {
      const body = { ...form, state }
      const res = record
        ? await request(`/inspection-records/records/${record.id}`, { method: 'PUT', body })
        : await request('/inspection-records', { method: 'POST', body })
      const text = state === 'submitted' ? `Inspection ${res.record.id} submitted for review.` : `Draft ${res.record.id} saved.`
      if (!record) navigate(`/inspections/records/${res.record.id}`, { replace: true, state: { toast: { kind: 'success', text } } })
      else { setRecord(res.record); setToast({ kind: 'success', text }) }
    } catch (e) {
      setErrors(e.fields ?? {})
      setToast({ kind: 'error', text: e.fields ? `${e.message} (${Object.keys(e.fields).length})` : e.message })
      const first = e.fields && Object.keys(e.fields)[0]
      const sec = first && sectionOf(first)
      if (sec) document.getElementById(`sec-${sec}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } finally {
      setSaving(null)
    }
  }

  const decide = async (decision) => {
    setSaving(decision)
    setErrors({})
    try {
      const res = await request(`/inspection-records/records/${record.id}/review`, { method: 'POST', body: { decision, ...review } })
      setRecord(res.record)
      const change2 = res.conditionChange ? ` ACM condition updated: ${res.conditionChange.from} → ${res.conditionChange.to}.` : ''
      setToast({ kind: 'success', text: decision === 'approve' ? `Inspection ${record.id} approved.${change2}` : `Inspection ${record.id} returned to the inspector.` })
    } catch (e) {
      setErrors(e.fields ?? {})
      setToast({ kind: 'error', text: e.message })
    } finally {
      setSaving(null)
    }
  }

  const setActionStatus = async (a, status) => {
    try {
      const res = await request(`/inspection-records/records/${record.id}/actions/${a.id}`, { method: 'PATCH', body: { status } })
      setRecord(res.record)
      setForm((f) => ({ ...f, actionItems: res.record.actionItems }))
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  const upload = async (file) => {
    try {
      const f = await uploadFile(`/inspection-records/records/${record.id}/attachments`, file, { category: docCategory })
      setRecord((r) => ({ ...r, attachments: [...r.attachments, f] }))
      setToast({ kind: 'success', text: `Uploaded ${f.name}` })
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }
  const removeDoc = async (f) => {
    if (!(await confirm({ title: `Remove ${f.name}?`, message: 'The file will be deleted from this inspection.', confirmLabel: 'Remove', tone: 'danger' }))) return
    try {
      await request(`/inspection-records/records/${record.id}/attachments/${f.id}`, { method: 'DELETE' })
      setRecord((r) => ({ ...r, attachments: r.attachments.filter((x) => x.id !== f.id) }))
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  if (loadError === 'notFound') {
    return <div className="coming-soon"><strong>Inspection not found</strong><span><Link to="/inspections">Back to inspections</Link></span></div>
  }

  // Section completeness for the index (what Submit will require)
  const a = form.assessment
  const filled = (obj, keys) => keys.every((k) => obj[k])
  const followUp = form.risk.followUpRequired === 'Yes' || form.checklist.immediateAction === 'Yes'
  const done = {
    location: Boolean(form.materialId && form.locationDescription && form.homogeneousAreaId && form.type && form.date && form.inspectorId),
    acm: Boolean(mat),
    condition: filled(a, ['currentCondition', 'damageType', 'damageExtent', 'waterDamage', 'potentialDisturbance', 'labelled', 'managementPlanUpdated']),
    checklist: (meta?.checklist ?? []).every((q) => form.checklist[q.key]),
    sampling: form.sampling.required === 'No' || (form.sampling.required === 'Yes' && filled(form.sampling, ['sampleId', 'collectionDate', 'sampleLocation', 'laboratory'])),
    risk: filled(form.risk, ['priority', 'damageSeverity', 'recommendedAction', 'immediateAttention', 'followUpRequired']) && (form.risk.followUpRequired !== 'Yes' || form.risk.targetDate),
    documents: null,
    comments: null,
    actions: followUp ? form.actionItems.length > 0 && form.actionItems.every((x) => x.action) : null,
    verification: Boolean(form.verification.inspectorSignature && form.verification.completionDate),
  }
  const required = Object.entries(done).filter(([, v]) => v !== null)
  const complete = required.filter(([, v]) => v).length
  const sectionErrors = (sid) => Object.keys(errors).filter((k) => sectionOf(k) === sid).length
  const state = record?.state ?? 'draft'
  const opt = (list) => list.map((x) => ({ value: x, label: x }))

  return (
    <div className="ai-page in-page">
      <div className="ai-head">
        <h1><ClipboardCheck size={24} />Asbestos Inspection – Detailed Form</h1>
        <div className="ai-head-actions">
          <button type="button" className="u-btn u-btn-outline" onClick={() => navigate('/inspections')}><ArrowLeft size={15} />Back</button>
          {editable && (
            <>
              <button type="button" className="u-btn u-btn-outline" disabled={!!saving} onClick={() => save('draft')}><Save size={15} />{saving === 'draft' ? 'Saving…' : 'Save Draft'}</button>
              <button type="button" className="u-btn u-btn-primary" disabled={!!saving} onClick={() => save('submitted')}><Send size={15} />{saving === 'submitted' ? 'Submitting…' : 'Submit for Review'}</button>
            </>
          )}
        </div>
      </div>

      {loadError && <div className="u-banner">Couldn't load the form ({loadError}).</div>}
      {record?.state === 'returned' && record.verification?.reviewComments && (
        <div className="in-banner warn"><Undo2 size={16} /><div><strong>Returned by {record.verification.reviewerName}</strong><span>{record.verification.reviewComments}</span></div></div>
      )}
      {record?.state === 'scheduled' && (
        <div className="in-banner info">
          <Info size={16} />
          <div>
            <strong>Assigned to {record.inspectorName}{record.scheduledDate ? ` for ${fmtDay(record.scheduledDate)}${record.scheduledTime ? ` at ${fmtTime(record.scheduledTime)}` : ''}` : ''}{record.assignment?.assignedBy ? ` by ${record.assignment.assignedBy.name}` : ''}</strong>
            <span>{record.assignment?.notes || 'Fill in the form on site. Save Draft to start the inspection; Submit for Review when it’s complete.'}</span>
          </div>
        </div>
      )}
      {record?.state === 'submitted' && <div className="in-banner info"><Info size={16} /><div><strong>Waiting for review</strong><span>The record is locked until a reviewer approves it or returns it with comments (section 10).</span></div></div>}
      {record?.state === 'approved' && <div className="in-banner ok"><BadgeCheck size={16} /><div><strong>Approved by {record.verification?.reviewerName} on {fmtDay(record.verification?.approvalDate)}</strong><span>Approved inspections are locked. Action item status can still be updated.</span></div></div>}

      <section className="u-card in-record">
        <div className="in-record-title">
          <h2>Inspection Record</h2>
          <Badge tone={STATE_TONE[state]}>{meta?.statusLabels[state] ?? 'Draft'}</Badge>
        </div>
        <fieldset className="in-fieldset" disabled={!editable}>
          <div className="sv-grid in-grid-4">
            <label className="uf-field">
              <span>Inspection ID</span>
              <input className="u-input" readOnly value={record?.id ?? `${meta?.nextId ?? '…'} (on save)`} />
            </label>
            <div className="uf-field">
              <span>Inspection Type *</span>
              <SearchSelect variant="field" label="Inspection type" value={form.type} onChange={set('type')} searchable={false}
                options={[{ value: '', label: 'Select a type' }, ...opt(meta?.types ?? [])]} />
              <Err msg={errors.type} />
            </div>
            <label className="uf-field">
              <span>Inspection Date *</span>
              <input type="date" className={`u-input${errors.date ? ' invalid' : ''}`} value={form.date} max={isoToday()} onChange={(e) => set('date')(e.target.value)} />
              <Err msg={errors.date} />
            </label>
            <div className="uf-field">
              <span>Inspector *</span>
              <SearchSelect variant="field" label="Inspector" value={form.inspectorId} onChange={set('inspectorId')} searchPlaceholder="Search inspectors…"
                options={[{ value: '', label: 'Assign an accredited inspector' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
              {cert && <small className={`sv-hint${certExpired ? ' sv-late' : ''}`}>{cert.name} · {cert.number} · {certExpired ? 'expired' : 'valid to'} {fmtDay(cert.expiresOn)}</small>}
              <Err msg={errors.inspectorId} />
            </div>
          </div>
        </fieldset>
      </section>

      <div className="sv-form-layout">
        <div className="sv-form-main">
        <fieldset className="in-fieldset in-stack" disabled={!editable}>
          <Section id="location" n={1} title="School & Location Details"
            hint="A homogeneous area groups materials that are similar in appearance, use, and installation characteristics.">
            <div className="sv-grid in-grid-3">
              <ReadRow label="District">{meta?.district}</ReadRow>
              <ReadRow label="School">{loc?.schoolName}</ReadRow>
              <ReadRow label="Building">{loc?.buildingName}</ReadRow>
              <ReadRow label="Floor">{loc?.floorName}</ReadRow>
              <ReadRow label="Room">{loc && `${loc.roomNumber} – ${loc.roomName}`}</ReadRow>
              {loc && <Link to={floorLink(loc)} className="ai-link in-read-link"><MapPin size={13} />Open on floor plan</Link>}
            </div>
            <div className="sv-grid in-grid-3 in-gap-top">
              <div className="uf-field sv-span-2">
                <span>ACM Being Inspected *</span>
                {editable && !record ? (
                  <SearchSelect variant="field" label="ACM" value={form.materialId} onChange={set('materialId')} searchPlaceholder="Search by material, school or room…"
                    options={[{ value: '', label: 'Select the material' }, ...materials.map((m) => ({ value: m.id, label: `${m.name} (${m.acmStatus}) — ${m.place}` }))]} />
                ) : <input className="u-input" readOnly value={mat ? `${shortAcm(mat.id, loc?.schoolId)} – ${mat.name}` : ''} />}
                <Err msg={errors.materialId} />
              </div>
              <label className="uf-field">
                <span>Homogeneous Area ID *</span>
                <input className={`u-input${errors.homogeneousAreaId ? ' invalid' : ''}`} value={form.homogeneousAreaId} maxLength={20} placeholder="e.g. HA-001"
                  onChange={(e) => set('homogeneousAreaId')(e.target.value.toUpperCase())} />
                <Err msg={errors.homogeneousAreaId} />
              </label>
              <label className="uf-field sv-span-3">
                <span>Location Description *</span>
                <input className={`u-input${errors.locationDescription ? ' invalid' : ''}`} value={form.locationDescription} maxLength={160} placeholder="e.g. Ceiling near entrance"
                  onChange={(e) => set('locationDescription')(e.target.value)} />
                <Err msg={errors.locationDescription} />
              </label>
            </div>
          </Section>

          <Section id="acm" n={2} title="ACM Material Details" hint="From the ACM inventory. Change these on the room's floor plan if they're wrong.">
            {mat ? (
              <div className="sv-grid in-grid-4">
                <ReadRow label="ACM ID"><span title={mat.id}>{shortAcm(mat.id, loc?.schoolId)}</span></ReadRow>
                <ReadRow label="Material Name">{mat.name}</ReadRow>
                <ReadRow label="Material Category">{mat.materialType}</ReadRow>
                <ReadRow label="ACM Status">{mat.acmStatus} · {mat.classification}</ReadRow>
                <ReadRow label="Friability">{mat.friability}</ReadRow>
                <ReadRow label="Quantity">{mat.quantity?.toLocaleString('en-US')}</ReadRow>
                <ReadRow label="Unit">{mat.unit}</ReadRow>
                <ReadRow label="Installation Location">{mat.location}</ReadRow>
              </div>
            ) : <p className="u-muted sv-empty-line">Choose the material in section 1.</p>}
          </Section>

          <Section id="condition" n={3} title="Material Condition Assessment">
            <div className="sv-grid in-grid-3">
              <div className="uf-field sv-span-2">
                <span>Current Condition *</span>
                <Choice name="Current condition" options={meta?.conditions ?? []} value={a.currentCondition} onChange={setIn('assessment', 'currentCondition')} error={errors['assessment.currentCondition']} />
                <Err msg={errors['assessment.currentCondition']} />
              </div>
              <div className="uf-field">
                <span>Previous Condition → Change</span>
                <div className="in-change">
                  {a.previousCondition ? <Badge tone={CONDITION_TONE[a.previousCondition]}>{a.previousCondition}</Badge> : <span className="u-muted">None on record</span>}
                  <Badge tone={CHANGE_TONE[change]}>{change}</Badge>
                </div>
              </div>
              <div className="uf-field">
                <span>Damage Type *</span>
                <SearchSelect variant="field" label="Damage type" value={a.damageType} onChange={setIn('assessment', 'damageType')} searchable={false}
                  options={[{ value: '', label: 'Select' }, ...opt(meta?.damageTypes ?? [])]} />
                <Err msg={errors['assessment.damageType']} />
              </div>
              <div className="uf-field">
                <span>Damage Extent *</span>
                <SearchSelect variant="field" label="Damage extent" value={a.damageExtent} onChange={setIn('assessment', 'damageExtent')} searchable={false}
                  options={[{ value: '', label: 'Select' }, ...opt(meta?.damageExtents ?? [])]} />
                <Err msg={errors['assessment.damageExtent']} />
              </div>
              <div className="uf-field">
                <span>Water Damage *</span>
                <Choice name="Water damage" options={['Yes', 'No']} value={a.waterDamage} onChange={setIn('assessment', 'waterDamage')} error={errors['assessment.waterDamage']} />
                <Err msg={errors['assessment.waterDamage']} />
              </div>
              <div className="uf-field">
                <span>Potential for Disturbance *</span>
                <Choice name="Potential disturbance" options={meta?.levels ?? []} value={a.potentialDisturbance} onChange={setIn('assessment', 'potentialDisturbance')} error={errors['assessment.potentialDisturbance']} />
                <Err msg={errors['assessment.potentialDisturbance']} />
              </div>
              <div className="uf-field">
                <span>Material Properly Labelled *</span>
                <Choice name="Properly labelled" options={['Yes', 'No', 'N/A']} value={a.labelled} onChange={setIn('assessment', 'labelled')} error={errors['assessment.labelled']} />
                <Err msg={errors['assessment.labelled']} />
              </div>
              <div className="uf-field">
                <span>Management Plan Updated *</span>
                <Choice name="Management plan updated" options={['Yes', 'No']} value={a.managementPlanUpdated} onChange={setIn('assessment', 'managementPlanUpdated')} error={errors['assessment.managementPlanUpdated']} />
                <Err msg={errors['assessment.managementPlanUpdated']} />
              </div>
            </div>
          </Section>

          <Section id="checklist" n={4} title="Inspection Checklist">
            <table className="in-checklist">
              <thead><tr><th>Question</th><th>Response</th></tr></thead>
              <tbody>
                {(meta?.checklist ?? []).map((q) => (
                  <tr key={q.key} className={errors[`checklist.${q.key}`] ? 'invalid' : undefined}>
                    <td>{q.question}<Err msg={errors[`checklist.${q.key}`]} /></td>
                    <td><Choice name={q.question} options={q.answers} value={form.checklist[q.key] ?? ''} onChange={setIn('checklist', q.key)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section id="sampling" n={5} title="Sampling & Laboratory Details">
            <div className="uf-field">
              <span>Sample Required *</span>
              <Choice name="Sample required" options={['Yes', 'No']} value={form.sampling.required} onChange={setIn('sampling', 'required')} error={errors['sampling.required']} />
              <Err msg={errors['sampling.required']} />
            </div>
            {form.sampling.required === 'Yes' && (
              <div className="sv-grid in-grid-3 in-gap-top">
                <label className="uf-field">
                  <span>Sample ID *</span>
                  <input className={`u-input${errors['sampling.sampleId'] ? ' invalid' : ''}`} value={form.sampling.sampleId} maxLength={30} placeholder="e.g. SMP-00125"
                    onChange={(e) => setIn('sampling', 'sampleId')(e.target.value.toUpperCase())} />
                  <Err msg={errors['sampling.sampleId']} />
                </label>
                <label className="uf-field">
                  <span>Collection Date *</span>
                  <input type="date" className={`u-input${errors['sampling.collectionDate'] ? ' invalid' : ''}`} value={form.sampling.collectionDate} max={isoToday()}
                    onChange={(e) => setIn('sampling', 'collectionDate')(e.target.value)} />
                  <Err msg={errors['sampling.collectionDate']} />
                </label>
                <div className="uf-field">
                  <span>Sample Result</span>
                  <SearchSelect variant="field" label="Sample result" value={form.sampling.result} onChange={setIn('sampling', 'result')} searchable={false} options={opt(meta?.sampleResults ?? [])} />
                </div>
                <label className="uf-field">
                  <span>Sample Location *</span>
                  <input className={`u-input${errors['sampling.sampleLocation'] ? ' invalid' : ''}`} value={form.sampling.sampleLocation} maxLength={120}
                    onChange={(e) => setIn('sampling', 'sampleLocation')(e.target.value)} />
                  <Err msg={errors['sampling.sampleLocation']} />
                </label>
                <label className="uf-field sv-span-2">
                  <span>Laboratory Name *</span>
                  <input className={`u-input${errors['sampling.laboratory'] ? ' invalid' : ''}`} value={form.sampling.laboratory} maxLength={120} placeholder="NVLAP-accredited laboratory"
                    onChange={(e) => setIn('sampling', 'laboratory')(e.target.value)} />
                  <Err msg={errors['sampling.laboratory']} />
                </label>
                <p className="sv-hint sv-span-3">Attach the lab report under section 7 as “Laboratory Report”.</p>
              </div>
            )}
          </Section>

          <Section id="risk" n={6} title="Risk Assessment & Recommendations">
            <div className="sv-grid in-grid-3">
              <div className="uf-field sv-span-2">
                <span>Priority *</span>
                <Choice name="Priority" options={meta?.priorities ?? []} value={form.risk.priority} onChange={setIn('risk', 'priority')} error={errors['risk.priority']} />
                <Err msg={errors['risk.priority']} />
              </div>
              <div className="uf-field">
                <span>Damage Severity *</span>
                <SearchSelect variant="field" label="Damage severity" value={form.risk.damageSeverity} onChange={setIn('risk', 'damageSeverity')} searchable={false}
                  options={[{ value: '', label: 'Select' }, ...opt(meta?.severities ?? [])]} />
                <Err msg={errors['risk.damageSeverity']} />
              </div>
              <div className="uf-field">
                <span>Recommended Action *</span>
                <SearchSelect variant="field" label="Recommended action" value={form.risk.recommendedAction} onChange={setIn('risk', 'recommendedAction')} searchable={false}
                  options={[{ value: '', label: 'Select' }, ...opt(meta?.recommendedActions ?? [])]} />
                <Err msg={errors['risk.recommendedAction']} />
              </div>
              <div className="uf-field">
                <span>Immediate Attention *</span>
                <Choice name="Immediate attention" options={['Yes', 'No']} value={form.risk.immediateAttention} onChange={setIn('risk', 'immediateAttention')} error={errors['risk.immediateAttention']} />
                <Err msg={errors['risk.immediateAttention']} />
              </div>
              <div className="uf-field">
                <span>Follow-up Required *</span>
                <Choice name="Follow-up required" options={['Yes', 'No']} value={form.risk.followUpRequired} onChange={setIn('risk', 'followUpRequired')} error={errors['risk.followUpRequired']} />
                <Err msg={errors['risk.followUpRequired']} />
              </div>
              <label className="uf-field">
                <span>Target Date{form.risk.followUpRequired === 'Yes' ? ' *' : ''}</span>
                <input type="date" className={`u-input${errors['risk.targetDate'] ? ' invalid' : ''}`} value={form.risk.targetDate} min={form.date || undefined}
                  onChange={(e) => setIn('risk', 'targetDate')(e.target.value)} />
                <Err msg={errors['risk.targetDate']} />
              </label>
            </div>
          </Section>
        </fieldset>

          <Section id="documents" n={7} title="Photos & Documents"
            hint="Before-inspection, material condition and damaged-area photographs, laboratory reports and supporting documents."
            aside={record && record.state !== 'approved' && (
              <div className="in-upload">
                <SearchSelect variant="field" label="Document category" value={docCategory} onChange={setDocCategory} searchable={false} options={opt(meta?.docCategories ?? [])} />
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Upload</button>
              </div>
            )}>
            {!record && <p className="u-muted sv-empty-line">Save the draft first, then attach photos and reports (PDF, JPG, PNG, WebP — up to 10 MB each).</p>}
            {record && !record.attachments.length && <p className="u-muted sv-empty-line">No photos or documents attached.</p>}
            {record?.attachments.length > 0 && (
              <ul className="sv-docs">
                {record.attachments.map((f) => (
                  <li key={f.id}>
                    {f.mime === 'application/pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                    <a href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                    <Badge tone="neutral">{f.category}</Badge>
                    <small className="u-muted">{(f.size / 1024).toFixed(0)} KB</small>
                    <a className="u-row-btn" href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}?download=1`} aria-label={`Download ${f.name}`}><Download size={14} /></a>
                    {record.state !== 'approved' && <button type="button" className="u-row-btn" onClick={() => removeDoc(f)} aria-label={`Remove ${f.name}`}><Trash2 size={14} /></button>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <fieldset className="in-fieldset in-stack" disabled={!editable}>
            <Section id="comments" n={8} title="Comments & Observations">
              <textarea className="u-input sv-textarea" rows={4} maxLength={2000} value={form.comments} onChange={(e) => set('comments')(e.target.value)} aria-label="Comments and observations"
                placeholder="Inspector notes, observations, inaccessible areas, limitations and recommendations." />
              <small className="sv-hint sv-count">{form.comments.length}/2000</small>
            </Section>
          </fieldset>

          <Section id="actions" n={9} title="Action Items"
            aside={editable && <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={addItem} disabled={form.actionItems.length >= 20}><Plus size={13} />Add Action Item</button>}>
            <Err msg={errors.actionItems} />
            {form.actionItems.length ? (
              <div className="u-table-wrap">
                <table className="u-table sv-items">
                  <thead><tr><th>Action</th><th>Assigned To</th><th>Priority</th><th>Due Date</th><th>Status</th>{editable && <th><span className="sr-only">Remove</span></th>}</tr></thead>
                  <tbody>
                    {form.actionItems.map((x, i) => (
                      <tr key={x.id}>
                        <td>
                          <input className={`u-input${errors[`actionItems.${i}.action`] ? ' invalid' : ''}`} value={x.action} maxLength={200} disabled={!editable}
                            placeholder="e.g. Review damaged ceiling tile" onChange={(e) => setItem(i, 'action')(e.target.value)} aria-label={`Action ${i + 1}`} />
                          <Err msg={errors[`actionItems.${i}.action`]} />
                        </td>
                        <td className="sv-item-select">
                          {editable
                            ? <SearchSelect variant="field" label={`Assigned to (action ${i + 1})`} value={x.assignedTo} onChange={setItem(i, 'assignedTo')} searchable={false} options={opt(meta?.teams ?? [])} />
                            : x.assignedTo}
                          <Err msg={errors[`actionItems.${i}.assignedTo`]} />
                        </td>
                        <td className="sv-item-status">
                          {editable
                            ? <SearchSelect variant="field" label={`Priority (action ${i + 1})`} value={x.priority} onChange={setItem(i, 'priority')} searchable={false} options={opt(meta?.priorities ?? [])} />
                            : x.priority}
                        </td>
                        <td>
                          <input type="date" className={`u-input${errors[`actionItems.${i}.dueDate`] ? ' invalid' : ''}`} value={x.dueDate} disabled={!editable}
                            onChange={(e) => setItem(i, 'dueDate')(e.target.value)} aria-label={`Due date (action ${i + 1})`} />
                          <Err msg={errors[`actionItems.${i}.dueDate`]} />
                        </td>
                        <td className="sv-item-status">
                          {/* Follow-up progress stays editable after submission/approval */}
                          <SearchSelect variant="field" label={`Status (action ${i + 1})`} value={x.status} searchable={false} options={opt(meta?.actionStatuses ?? [])}
                            onChange={(v) => (editable ? setItem(i, 'status')(v) : setActionStatus(x, v))} />                      </td>
                        {editable && (
                          <td className="ai-col-actions">
                            <button type="button" className="u-row-btn" onClick={() => setForm((f) => ({ ...f, actionItems: f.actionItems.filter((_, k) => k !== i) }))} aria-label={`Remove action ${i + 1}`}><Trash2 size={14} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="u-muted sv-empty-line">{followUp ? 'Follow-up is required — add at least one action item.' : 'No action items.'}</p>}
          </Section>

          <Section id="verification" n={10} title="Verification & Signatures">
            <div className="in-verify">
              <fieldset className="in-fieldset in-sign-block" disabled={!editable}>
                <h3>Inspector</h3>
                <div className="sv-grid in-grid-2">
                  <ReadRow label="Inspector Name">{inspector?.name ?? record?.inspectorName}</ReadRow>
                  <ReadRow label="Qualification / Certification">{cert ? `${cert.name} · ${cert.number}` : 'Not on file'}</ReadRow>
                </div>
                {certExpired && <p className="in-warn"><TriangleAlert size={14} />The certification expired on {fmtDay(cert.expiresOn)}, before the inspection date.</p>}
                <div className="uf-field in-gap-top">
                  <span className="in-sign-label">
                    Inspector Signature *
                    {editable && form.verification.inspectorSignature && form.verification.inspectorSignature !== 'on-file' && (
                      <button type="button" className="sv-link-btn" onClick={() => setIn('verification', 'inspectorSignature')(null)}><Eraser size={13} />Clear</button>
                    )}
                  </span>
                  {form.verification.inspectorSignature === 'on-file'
                    ? <div className="in-onfile">Signed on paper — signature on file</div>
                    : editable
                      ? <SignaturePad value={form.verification.inspectorSignature} label={inspector?.name} invalid={!!errors['verification.inspectorSignature']} onChange={setIn('verification', 'inspectorSignature')} />
                      : <div className="sv-sign">{form.verification.inspectorSignature && <img src={form.verification.inspectorSignature} alt="Inspector signature" />}</div>}
                  <Err msg={errors['verification.inspectorSignature']} />
                </div>
                <label className="uf-field in-gap-top">
                  <span>Inspection Completion Date *</span>
                  <input type="date" className={`u-input in-date${errors['verification.completionDate'] ? ' invalid' : ''}`} value={form.verification.completionDate}
                    min={form.date || undefined} max={isoToday()} onChange={(e) => setIn('verification', 'completionDate')(e.target.value)} />
                  <Err msg={errors['verification.completionDate']} />
                </label>
              </fieldset>

              <div className="in-sign-block">
                <h3>Reviewer</h3>
                {state === 'submitted' ? (
                  <>
                    <div className="uf-field">
                      <span>Reviewer *</span>
                      <SearchSelect variant="field" label="Reviewer" value={review.reviewerId} searchable={false}
                        onChange={(v) => { setReview((r) => ({ ...r, reviewerId: v })); clearErr('verification.reviewerId') }}
                        options={[{ value: '', label: 'Select the reviewer' }, ...(meta?.reviewers ?? []).map((u) => ({ value: u.id, label: `${u.name}${u.title ? ` – ${u.title}` : ''}` }))]} />
                      <Err msg={errors['verification.reviewerId']} />
                    </div>
                    <div className="uf-field in-gap-top">
                      <span className="in-sign-label">
                        Reviewer Signature (required to approve)
                        {review.signature && <button type="button" className="sv-link-btn" onClick={() => setReview((r) => ({ ...r, signature: null }))}><Eraser size={13} />Clear</button>}
                      </span>
                      <SignaturePad value={review.signature} invalid={!!errors['verification.reviewerSignature']} label="reviewer"
                        onChange={(s) => { setReview((r) => ({ ...r, signature: s })); clearErr('verification.reviewerSignature') }} />
                      <Err msg={errors['verification.reviewerSignature']} />
                    </div>
                    <label className="uf-field in-gap-top">
                      <span>Review Comments (required to return)</span>
                      <textarea className="u-input sv-textarea" rows={2} maxLength={500} value={review.comments}
                        onChange={(e) => { setReview((r) => ({ ...r, comments: e.target.value })); clearErr('verification.reviewComments') }} />
                      <Err msg={errors['verification.reviewComments']} />
                    </label>
                    <div className="in-review-actions">
                      <button type="button" className="u-btn u-btn-outline" disabled={!!saving} onClick={() => decide('return')}><Undo2 size={15} />Return for Changes</button>
                      <button type="button" className="u-btn u-btn-primary" disabled={!!saving} onClick={() => decide('approve')}><BadgeCheck size={15} />Approve Inspection</button>
                    </div>
                    {mat && form.assessment.currentCondition && mat.condition !== form.assessment.currentCondition && (
                      <p className="sv-callout"><Info size={14} /><span>Approving will update the material's condition in the ACM inventory from <strong>{mat.condition}</strong> to <strong>{form.assessment.currentCondition}</strong>.</span></p>
                    )}
                  </>
                ) : (
                  <div className="sv-grid in-grid-2">
                    <ReadRow label="Review Status"><Badge tone={STATE_TONE[state]}>{record?.verification?.reviewStatus ?? 'Not Submitted'}</Badge></ReadRow>
                    <ReadRow label="Reviewer Name">{record?.verification?.reviewerName}</ReadRow>
                    <ReadRow label="Approval Date">{record?.verification?.approvalDate ? fmtDay(record.verification.approvalDate) : ''}</ReadRow>
                    <ReadRow label="Reviewer Signature">
                      {record?.verification?.reviewerSignature === 'on-file' ? 'On file'
                        : record?.verification?.reviewerSignature ? <img className="in-sig-img" src={record.verification.reviewerSignature} alt="Reviewer signature" /> : ''}
                    </ReadRow>
                    {!record || state === 'draft' || state === 'scheduled' ? <p className="sv-hint sv-span-2">An EHS manager reviews the inspection after it's submitted.</p> : null}
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>

        <aside className="sv-form-side">
          <section className="u-card sv-side-card">
            <div className="sv-side-head">
              <h3><ListChecks size={16} />Sections</h3>
              <span className="u-muted in-progress-text">{complete}/{required.length} complete</span>
            </div>
            <div className="in-progress" role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={complete}>
              <span style={{ width: `${(complete / required.length) * 100}%` }} />
            </div>
            <ol className="in-index">
              {SECTIONS.map((s) => {
                const d = done[s.id]
                const errs = sectionErrors(s.id)
                return (
                  <li key={s.id}>
                    <a href={`#sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                      className={errs ? 'err' : d ? 'ok' : undefined}>
                      {errs ? <TriangleAlert size={14} /> : d ? <CircleCheck size={14} /> : <Circle size={14} />}
                      <span>{s.n}. {s.title}</span>
                      {d === null && !errs && <small>optional</small>}
                      {errs > 0 && <small>{errs} to fix</small>}
                    </a>
                  </li>
                )
              })}
            </ol>
          </section>

          {shownCtx && (
            <section className="u-card sv-side-card">
              <h3><History size={16} />Inspection History</h3>
              {shownCtx.history.length ? (
                <table className="u-table sv-history">
                  <thead><tr><th>Date</th><th>Condition</th><th>Inspector</th></tr></thead>
                  <tbody>
                    {shownCtx.history.slice(0, 6).map((h) => (
                      <tr key={h.id}>
                        <td className="u-nowrap"><Link to={`/inspections/records/${h.id}`} className="sv-id">{fmtDay(h.date)}</Link></td>
                        <td>{h.condition ? <Badge tone={CONDITION_TONE[h.condition]}>{h.condition}</Badge> : '—'}</td>
                        <td>{h.inspectorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="u-muted sv-empty-line">No earlier inspections of this material.</p>}
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

// Which form section a server error key belongs to (for scrolling and the section index)
function sectionOf(key) {
  if (['type', 'date', 'inspectorId', 'materialId', 'locationDescription', 'homogeneousAreaId'].includes(key)) return 'location'
  const head = key.split('.')[0]
  return { assessment: 'condition', checklist: 'checklist', sampling: 'sampling', risk: 'risk', actionItems: 'actions', verification: 'verification', comments: 'comments' }[head] ?? null
}
