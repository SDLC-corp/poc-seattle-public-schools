import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  ClipboardCheck, ArrowLeft, Save, Send, Plus, Trash2, Upload, Download, FileText, Image as ImageIcon, MapPin, History, Info,
  CircleCheck, CircleAlert, Eraser, BadgeCheck, Undo2, Circle, TriangleAlert, ListChecks, Milestone, Paperclip, Layers, X, FlaskConical, Wrench, ShieldCheck,
  CornerUpLeft, CalendarPlus,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import Badge from '../AcmInventory/Badge'
import SignaturePad from '../Surveillance/SignaturePad'
import { fmtDay, isoToday, addDays, shortAcm, floorLink } from '../Surveillance/survMeta'
import { STATE_TONE, CONDITION_TONE, CHANGE_TONE, SECTIONS, conditionChange, fmtTime } from './inspMeta'
import LifecycleStepper from './LifecycleStepper'
import InspectionTimeline from './InspectionTimeline'
import StageDialog from './StageDialog'
import LabOmDialog from './LabOmDialog'
import StageReviewDialog from './StageReviewDialog'
import StageReviews from './StageReviews'
import { FollowUpsPanel, LabPanel, OmPanel } from './ParentTabs'
import { request, uploadFile, API_BASE } from '../../lib/api'
import { useGoBack } from '../../lib/useGoBack'
import '../Users/users.css'
import '../Audit/audit.css'
import '../AcmInventory/acmInventory.css'
import '../Surveillance/surveillance.css'
import './inspections.css'

/**
 * One inspection can cover several ACMs. These fields are per ACM; the rest (type, date, inspector, comments,
 * action items, signatures) cover the whole inspection. The form keeps every ACM in `acms` and mirrors the
 * selected one (`active`) into the top-level fields that sections 1–6 edit.
 */
const PER_ACM = ['materialId', 'locationDescription', 'homogeneousAreaId', 'assessment', 'checklist', 'checklistNotes', 'sampling', 'risk']
const perAcm = (f) => Object.fromEntries(PER_ACM.map((k) => [k, f[k]]))
// Server error keys for a per-ACM field (extra ACMs' errors arrive as extra.<i>.<key>)
const PER_ACM_ERR = /^(materialId|locationDescription|homogeneousAreaId|assessment\.|checklist\.|sampling\.|risk\.)/

const blankAcm = (materialId) => ({
  materialId: materialId ?? '', locationDescription: '', homogeneousAreaId: '',
  assessment: { currentCondition: '', previousCondition: null, damageType: '', damageExtent: '', waterDamage: '', potentialDisturbance: '', labelled: '', managementPlanUpdated: '' },
  checklist: {},
  checklistNotes: {},
  sampling: { required: '', sampleType: '', sampleId: '', collectionDate: '', laboratory: '', testMethod: '', notes: '', result: 'Pending', airType: '', durationMin: '' },
  risk: { priority: '', damageSeverity: '', recommendedAction: '', immediateAttention: '', followUpRequired: '', targetDate: '' },
})
const acmFrom = (x) => {
  const b = blankAcm(x.materialId)
  return {
    ...b, locationDescription: x.locationDescription ?? '', homogeneousAreaId: x.homogeneousAreaId ?? '',
    assessment: { ...b.assessment, ...x.assessment }, checklist: { ...x.checklist }, checklistNotes: { ...x.checklistNotes },
    sampling: { ...b.sampling, ...x.sampling }, risk: { ...b.risk, ...x.risk },
  }
}

const blankForm = (materialId) => {
  const first = blankAcm(materialId)
  return {
    type: '', date: isoToday(), inspectorId: '', ...first,
    comments: '',
    actionItems: [],
    verification: { inspectorSignature: null, completionDate: isoToday() },
    acms: [first], active: 0,
  }
}

// A scheduled (not yet started) inspection starts with today as the inspection date
const fromRecord = (r) => {
  const acms = [acmFrom(r), ...(r.extra ?? []).map(acmFrom)]
  return {
    type: r.type ?? '', date: r.date ?? isoToday(), inspectorId: r.inspectorId ?? '', ...acms[0], comments: r.comments ?? '',
    actionItems: r.actionItems ?? [],
    verification: { inspectorSignature: r.verification?.inspectorSignature ?? null, completionDate: r.verification?.completionDate || (r.state === 'scheduled' ? isoToday() : '') },
    acms, active: 0,
  }
}

// Every ACM, with the selected one's current edits
const allAcms = (f) => f.acms.map((x, i) => (i === f.active ? perAcm(f) : x))

// The errors to show while ACM `active` is selected: its own per-ACM errors plus the inspection-wide ones
function errorsFor(all, active) {
  const out = {}
  for (const [k, v] of Object.entries(all)) {
    const m = k.match(/^extra\.(\d+)\.(.+)$/)
    if (m) { if (Number(m[1]) + 1 === active) out[m[2]] = v } else if (active === 0 || !PER_ACM_ERR.test(k)) out[k] = v
  }
  return out
}
const acmErrorCount = (all, i) => Object.keys(all).filter((k) => (i === 0 ? PER_ACM_ERR.test(k) : k.startsWith(`extra.${i - 1}.`))).length

const ASSESSMENT_REQUIRED = ['currentCondition', 'damageType', 'damageExtent', 'waterDamage', 'potentialDisturbance', 'labelled', 'managementPlanUpdated']
const RISK_REQUIRED = ['priority', 'damageSeverity', 'recommendedAction', 'immediateAttention', 'followUpRequired']

/**
 * Everything "Inspection Submitted" needs, checked before sending: each ACM's location, condition assessment,
 * checklist, sampling and risk, plus the inspection-wide details. Same keys as the server's errors (extra ACMs
 * under extra.<i>.), so fields highlight and the ACM summary lists them. Contradictions are left to the server.
 */
function missingForSubmit(f, checklist) {
  const errs = {}
  const acms = allAcms(f)
  acms.forEach((x, i) => {
    const need = (cond, key, msg) => { if (cond) errs[`${i ? `extra.${i - 1}.` : ''}${key}`] = msg }
    need(!x.materialId, 'materialId', 'Choose the ACM being inspected')
    need(!x.locationDescription?.trim(), 'locationDescription', 'Describe where the material is')
    for (const k of ASSESSMENT_REQUIRED) need(!x.assessment[k], `assessment.${k}`, 'Required')
    for (const q of checklist) need(!x.checklist[q.key], `checklist.${q.key}`, 'Answer this question')
    need(!x.sampling.required, 'sampling.required', 'Is a sample required?')
    if (x.sampling.required === 'Yes') {
      need(!x.sampling.sampleType, 'sampling.sampleType', 'Choose the sample type')
      need(!x.sampling.sampleId, 'sampling.sampleId', 'Sample ID is required')
      need(!x.sampling.collectionDate, 'sampling.collectionDate', 'Collection date is required')
      need(!x.sampling.laboratory, 'sampling.laboratory', 'Laboratory is required')
      need(!x.sampling.testMethod, 'sampling.testMethod', 'Choose what to test')
      if (x.sampling.sampleType === 'Air Sample') {
        need(!x.sampling.airType, 'sampling.airType', 'Choose the kind of air sample')
        need(x.sampling.durationMin === '' || x.sampling.durationMin == null, 'sampling.durationMin', 'Enter how long the sample ran')
      }
    }
    for (const k of RISK_REQUIRED) need(!x.risk[k], `risk.${k}`, 'Required')
    need(x.risk.followUpRequired === 'Yes' && !x.risk.targetDate, 'risk.targetDate', 'Target date is required when follow-up is needed')
  })
  const need = (cond, key, msg) => { if (cond) errs[key] = msg }
  need(!f.type, 'type', 'Choose an inspection type')
  need(!f.date, 'date', 'Inspection date is required')
  need(!f.inspectorId, 'inspectorId', 'Choose the accredited inspector')
  need(!f.verification.inspectorSignature, 'verification.inspectorSignature', 'The inspector must sign the inspection')
  need(!f.verification.completionDate, 'verification.completionDate', 'Completion date is required')
  const followUp = acms.some((x) => x.risk.followUpRequired === 'Yes' || x.checklist.immediateAction === 'Yes')
  need(followUp && !f.actionItems.length, 'actionItems', 'Add at least one action item for the follow-up')
  f.actionItems.forEach((a, i) => {
    need(!a.action?.trim(), `actionItems.${i}.action`, 'Describe the action')
    need(!a.dueDate, `actionItems.${i}.dueDate`, 'Due date required')
  })
  return errs
}

// Section title for an error key (per-ACM keys without their extra.<i>. prefix)
const RECORD_KEYS = ['type', 'date', 'inspectorId']
const sectionTitle = (key) => (RECORD_KEYS.includes(key) ? 'Inspection Record' : SECTIONS.find((s) => s.id === sectionOf(key))?.title ?? 'Other details')

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

/**
 * The inspection page, or (embedded, with recordId) a follow-up inspection's form inside its parent's
 * Follow-up tab — onChanged lets the parent reload its stages and tabs after each save or review.
 */
export default function InspectionForm({ recordId, embedded = false, onChanged }) {
  const params0 = useParams()
  const id = recordId ?? params0.id
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef(null)
  // Evidence for one checklist question: the shared file input remembers which question it's for
  const evidenceRef = useRef(null)
  const [evidenceFor, setEvidenceFor] = useState(null)

  const [meta, setMeta] = useState(null)
  const [materials, setMaterials] = useState([])
  const [record, setRecord] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [lifecycle, setLifecycle] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [changingStage, setChangingStage] = useState(false)
  // Lab results / O&M tasks dialog ('lab' | 'om'), for this inspection or one of its follow-ups (labTarget)
  const [labOm, setLabOm] = useState(null)
  const [labTarget, setLabTarget] = useState(null)
  // Follow-up inspections carried out under this one, or the inspection this one follows up
  const [followUps, setFollowUps] = useState([])
  const [parentInfo, setParentInfo] = useState(null)
  // The open tab and the follow-up shown in the Follow-up tab live in the URL (?tab=&fu=), so coming back from
  // a page opened from here (an O&M activity, a lab sample…) returns to the same view
  const tab = embedded ? 'inspection' : params.get('tab') ?? 'inspection'
  const openFollowUp = embedded ? null : params.get('fu')
  const setView = (next) => setParams((p) => {
    const n = new URLSearchParams(p)
    for (const [k, v] of Object.entries(next)) { if (v) n.set(k, v); else n.delete(k) }
    n.delete('labResults')
    return n
  }, { replace: true })
  const setTab = (t) => setView({ tab: t === 'inspection' ? null : t })
  const setOpenFollowUp = (fid) => setView({ fu: fid })
  const goBack = useGoBack('/inspections')
  // Stage review dialog ('request' | 'decide')
  const [reviewing, setReviewing] = useState(null)
  const [form, setForm] = useState(() => blankForm(params.get('material')))
  const [allErrors, setErrors] = useState({})
  const [saving, setSaving] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [docCategory, setDocCategory] = useState('Material Condition Photo')
  const [review, setReview] = useState({ reviewerId: '', signature: null, comments: '' })
  const [toast, setToast] = useState(() => (embedded ? null : routerLocation.state?.toast ?? null))

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

  // Embedded follow-up: tell the parent after each change (not on the first load)
  const loadedOnce = useRef(false)
  useEffect(() => {
    if (!embedded || !record?.id) return
    if (loadedOnce.current) onChanged?.()
    loadedOnce.current = true
  }, [record]) // eslint-disable-line react-hooks/exhaustive-deps

  // Life-cycle stages and timeline follow the saved record (save, review and action-item changes all replace it)
  useEffect(() => {
    if (!record?.id) return
    let cancelled = false
    request(`/inspection-records/records/${record.id}`)
      .then((d) => { if (!cancelled) { setLifecycle(d.lifecycle); setTimeline(d.timeline); setFollowUps(d.followUps ?? []); setParentInfo(d.parent ?? null) } })
      .catch(() => {})
    return () => { cancelled = true }
  }, [record])

  // The ACM details (and history) follow the selected ACM. A newly chosen or added ACM gets its previous
  // condition and location filled in; saved ACMs keep what was recorded.
  const ctxFor = ctx?.material?.id
  useEffect(() => {
    if (!form.materialId || ctxFor === form.materialId) return
    let cancelled = false
    const materialId = form.materialId
    request(`/inspection-records/material/${encodeURIComponent(materialId)}`)
      .then((d) => {
        if (cancelled) return
        setCtx(d)
        setForm((f) => (f.materialId !== materialId ? f : {
          ...f,
          assessment: { ...f.assessment, previousCondition: !id || f.assessment.previousCondition == null ? d.previousCondition : f.assessment.previousCondition },
          locationDescription: f.locationDescription || [d.material.location, d.location.roomName].filter(Boolean).join(', '),
        }))
      })
      .catch(() => { if (!cancelled) setCtx(null) })
    return () => { cancelled = true }
  }, [id, form.materialId, ctxFor])

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
  const errors = errorsFor(allErrors, form.active)
  // Per-ACM errors of an extra ACM are stored as extra.<i>.<key>
  const errKey = (k) => (form.active && PER_ACM_ERR.test(k) ? `extra.${form.active - 1}.${k}` : k)
  const clearErr = (...keys) => setErrors((e) => { const n = { ...e }; keys.forEach((k) => delete n[errKey(k)]); return n })

  // ACMs in this inspection: select / add / remove
  const acmList = allAcms(form)
  const selectAcm = (i) => setForm((f) => { const acms = allAcms(f); return { ...f, ...acms[i], acms, active: i } })
  const addAcm = (materialId) => {
    if (!materialId) return
    setForm((f) => { const acms = [...allAcms(f), blankAcm(materialId)]; return { ...f, ...acms.at(-1), acms, active: acms.length - 1 } })
  }
  const removeAcm = async (i) => {
    const m = materials.find((x) => x.id === acmList[i].materialId)
    if (!(await confirm({ title: `Remove ${m?.name ?? 'this ACM'} from the inspection?`, message: 'Its condition assessment, checklist, sampling and risk details will be removed.', confirmLabel: 'Remove', tone: 'danger' }))) return
    setForm((f) => {
      const acms = allAcms(f).filter((_, k) => k !== i)
      const active = f.active === i ? 0 : f.active > i ? f.active - 1 : f.active
      return { ...f, ...acms[active], acms, active }
    })
    setErrors({})
  }

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
        next.sampling = { ...next.sampling, collectionDate: f.sampling.collectionDate || f.date }
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

  // Select the ACM an error belongs to and scroll to its section
  const goToError = (key) => {
    const extra = key.match(/^extra\.(\d+)\.(.+)$/)
    if (extra) selectAcm(Number(extra[1]) + 1)
    else if (PER_ACM_ERR.test(key) && form.active !== 0) selectAcm(0)
    const bare = extra ? extra[2] : key
    const sec = RECORD_KEYS.includes(bare) ? null : sectionOf(bare)
    setTimeout(() => {
      const el = sec ? document.getElementById(`sec-${sec}`) : document.querySelector('.in-record')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const save = async (state) => {
    // Submitting needs every ACM complete: list what's missing instead of sending
    if (state === 'submitted') {
      const missing = missingForSubmit(form, meta?.checklist ?? [])
      if (Object.keys(missing).length) {
        setErrors(missing)
        const acmsWithGaps = allAcms(form).filter((_, i) => acmErrorCount(missing, i) > 0).length
        setToast({ kind: 'error', text: `Complete ${Object.keys(missing).length} required field${Object.keys(missing).length === 1 ? '' : 's'}${acmsWithGaps ? ` across ${acmsWithGaps} ACM${acmsWithGaps === 1 ? '' : 's'}` : ''} before submitting.` })
        document.querySelector('.in-acms')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    setSaving(state)
    setErrors({})
    try {
      // The first ACM goes on the record itself, the others in `extra`
      const acms = allAcms(form)
      const { acms: _acms, active: _active, ...shared } = form
      const body = { ...shared, ...acms[0], extra: acms.slice(1), state }
      const res = record
        ? await request(`/inspection-records/records/${record.id}`, { method: 'PUT', body })
        : await request('/inspection-records', { method: 'POST', body })
      const samples = allAcms(form).filter((x) => x.sampling.required === 'Yes').length
      const text = state !== 'submitted' ? `Inspection ${res.record.id} saved – in progress.`
        : samples ? `Inspection ${res.record.id} submitted for review – the reviewer sends the ${samples === 1 ? 'sample' : `${samples} samples`} to the laboratory.`
          : `Inspection ${res.record.id} submitted for review.`
      if (!record) navigate(`/inspections/records/${res.record.id}`, { replace: true, state: { toast: { kind: 'success', text } } })
      else { setRecord(res.record); setToast({ kind: 'success', text }) }
    } catch (e) {
      setErrors(e.fields ?? {})
      setToast({ kind: 'error', text: e.fields ? `${e.message} (${Object.keys(e.fields).length})` : e.message })
      // Show the list of problems per ACM
      if (e.fields) document.querySelector('.in-acms')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  const uploadEvidence = async (key, file) => {
    try {
      const f = await uploadFile(`/inspection-records/records/${record.id}/attachments`, file, {
        category: file.type === 'application/pdf' ? 'Supporting Document' : 'Material Condition Photo', checklist: key, material: form.materialId,
      })
      setRecord((r) => ({ ...r, attachments: [...r.attachments, f] }))
      setToast({ kind: 'success', text: `Attached ${f.name}` })
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

  const hasSamples = Boolean(record && [record, ...(record.extra ?? [])].some((x) => x.sampling?.required === 'Yes'))
  // Lab results can be entered / corrected once the samples are at the lab, until the lab review approves them
  const labApproved = Boolean(record?.reviewGates && (record.stageReviews ?? []).filter((x) => x.stage === 'lab').at(-1)?.status === 'approved')
  const canEditResults = Boolean(hasSamples && lifecycle && (record.state === 'submitted' || record.state === 'approved')
    && !(lifecycle.current === 'submitted' && lifecycle.gate) && !labApproved)
  // A follow-up inspection (child) continues its parent; a parent shows its follow-ups, lab and O&M in tabs
  const isChild = Boolean(record?.parentId)
  const showTabs = Boolean(record && !isChild && (record.state === 'submitted' || record.state === 'approved'))
  const family = record ? [record, ...followUps] : []
  const familySamples = family.flatMap((r) => [r, ...(r.extra ?? [])]).filter((a) => a.sampling?.required === 'Yes').length
  const familyTasks = family.reduce((n, r) => n + (r.actionItems?.length ?? 0), 0)
  const timelineEvents = (timeline ?? []).reduce((n, s) => n + s.events.filter((e) => e.kind !== 'stage').length, 0)
  // Every inspection (not a follow-up shown inside its parent) has Inspection + Timeline; submitted ones also the rest
  const sectionTabs = record && !isChild ? [
    { id: 'inspection', label: 'Inspection', icon: ClipboardCheck },
    ...(showTabs ? [
      { id: 'followUp', label: 'Follow-up Inspections', icon: CalendarPlus, count: followUps.length },
      { id: 'lab', label: 'Lab Results', icon: FlaskConical, count: familySamples },
      { id: 'om', label: 'O&M Tasks', icon: Wrench, count: familyTasks },
    ] : []),
    { id: 'timeline', label: 'Timeline', icon: History, count: timelineEvents },
  ] : []
  const activeTab = sectionTabs.some((t) => t.id === tab) ? tab : 'inspection'
  // The follow-up whose form is open: the chosen one, else the first not yet approved, else the latest
  const shownFollowUp = (followUps.some((k) => k.id === openFollowUp) ? openFollowUp : null)
    ?? followUps.find((k) => k.state !== 'approved')?.id ?? followUps.at(-1)?.id ?? null
  // ?labResults=1 (from Lab & Sampling Results / Air Monitoring) opens the lab results dialog once
  const labLinkOpened = useRef(false)
  useEffect(() => {
    if (embedded || labLinkOpened.current || params.get('labResults') !== '1' || !meta || !lifecycle) return
    labLinkOpened.current = true
    // A follow-up's results are entered from its parent's Lab Results tab
    if (record?.parentId) navigate(`/inspections/records/${record.parentId}?tab=lab`, { replace: true })
    else if (canEditResults) setLabOm('lab')
    else setToast({ kind: 'error', text: labApproved ? 'The lab results were approved in the Laboratory Analysis review and can no longer be changed.' : 'Lab results can be entered once the samples have been sent to the laboratory.' })
  }, [params, meta, lifecycle, canEditResults, labApproved, record?.parentId, navigate, embedded])

  if (loadError === 'notFound') {
    return <div className="coming-soon"><strong>Inspection not found</strong><span><Link to="/inspections">Back to inspections</Link></span></div>
  }

  // Section completeness for the index (what Submit will require)
  const a = form.assessment
  const filled = (obj, keys) => keys.every((k) => obj[k])
  // Sample type decides what can be tested; air samples also record their kind and duration
  const sampleTypeDef = meta?.sampleTypes?.find((t) => t.value === form.sampling.sampleType)
  const testOptions = sampleTypeDef?.testMethods ?? []
  const isAirSample = form.sampling.sampleType === 'Air Sample'
  const airLimit = isAirSample && form.sampling.airType && form.sampling.testMethod
    ? meta?.air.limits[`${form.sampling.airType}|${/TEM/.test(form.sampling.testMethod) ? 'TEM' : 'PCM'}`] : null
  const setSampleType = (value) => {
    const methods = meta?.sampleTypes?.find((t) => t.value === value)?.testMethods ?? []
    setForm((f) => ({
      ...f,
      sampling: { ...f.sampling, sampleType: value, testMethod: methods.includes(f.sampling.testMethod) ? f.sampling.testMethod : methods.length === 1 ? methods[0] : '' },
    }))
    clearErr('sampling.sampleType', 'sampling.testMethod')
  }
  // Action items are needed if any ACM needs follow-up
  const followUp = acmList.some((x) => x.risk.followUpRequired === 'Yes' || x.checklist.immediateAction === 'Yes')
  const several = acmList.length > 1
  const acmMeta = (x) => materials.find((m) => m.id === x.materialId)
  const activeName = acmMeta(form)?.name ?? mat?.name
  const acmTag = several ? <span className="in-acm-tag">ACM {form.active + 1} of {acmList.length}{activeName ? `: ${activeName}` : ''}</span> : null
  // A checklist answer's evidence can be attached once its ACM is saved on the inspection
  const savedAcmIds = record ? [record.materialId, ...(record.extra ?? []).map((x) => x.materialId)] : []
  // What still needs completing, per ACM and for the whole inspection, grouped by section
  const issueGroups = (() => {
    const keys = Object.keys(allErrors)
    if (!keys.length) return []
    const bySection = (list) => {
      const out = new Map()
      for (const k of list) {
        const bare = k.replace(/^extra\.\d+\./, '')
        const title = sectionTitle(bare)
        const g = out.get(title) ?? { title, count: 0, key: k }
        g.count += 1
        out.set(title, g)
      }
      return [...out.values()]
    }
    const groups = acmList.map((x, i) => ({
      label: `ACM ${i + 1}: ${acmMeta(x)?.name ?? (x.materialId || 'not chosen')}`,
      sections: bySection(keys.filter((k) => (i === 0 ? PER_ACM_ERR.test(k) : k.startsWith(`extra.${i - 1}.`)))),
    })).filter((g) => g.sections.length)
    const shared = bySection(keys.filter((k) => !PER_ACM_ERR.test(k) && !k.startsWith('extra.')))
    if (shared.length) groups.push({ label: 'Whole inspection', sections: shared })
    return groups
  })()
  const issueCount = Object.keys(allErrors).length
  const acmDone = (x) => Boolean(x.assessment.currentCondition && (meta?.checklist ?? []).every((q) => x.checklist[q.key]) && x.sampling.required && x.risk.priority && x.risk.recommendedAction)
  const done = {
    location: Boolean(form.materialId && form.locationDescription && form.type && form.date && form.inspectorId),
    acm: Boolean(mat),
    condition: filled(a, ['currentCondition', 'damageType', 'damageExtent', 'waterDamage', 'potentialDisturbance', 'labelled', 'managementPlanUpdated']),
    checklist: (meta?.checklist ?? []).every((q) => form.checklist[q.key]),
    sampling: form.sampling.required === 'No' || (form.sampling.required === 'Yes' && filled(form.sampling, ['sampleType', 'sampleId', 'collectionDate', 'laboratory', 'testMethod'])
      && (!isAirSample || (form.sampling.airType && form.sampling.durationMin !== '' && form.sampling.durationMin != null))),
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
    <div className={`ai-page in-page${embedded ? ' in-embedded' : ''}`}>
      <div className="ai-head">
        {embedded
          ? <h2 className="in-embed-title"><ClipboardCheck size={18} />Follow-up Inspection {record?.id ?? ''} <Badge tone={STATE_TONE[state]}>{meta?.statusLabels[state] ?? ''}</Badge></h2>
          : <h1><ClipboardCheck size={24} />Asbestos Inspection – Detailed Form</h1>}
        <div className="ai-head-actions">
          {!embedded && <button type="button" className="u-btn u-btn-outline" onClick={goBack}><ArrowLeft size={15} />Back</button>}
          {/* A follow-up inspection's stages, lab results and O&M work continue on its parent */}
          {isChild && !embedded && (
            <Link className="u-btn u-btn-primary" to={`/inspections/records/${record.parentId}?tab=followUp`}><CornerUpLeft size={15} />Open Parent {record.parentId}</Link>
          )}
          {!isChild && lifecycle && (record?.state === 'submitted' || record?.state === 'approved') && (
            <>
              {/* Stage review: send the finished stage for review, or (reviewer) approve / return it */}
              {(lifecycle.gate === 'readyForReview' || lifecycle.gate === 'returned') && (
                <button type="button" className="u-btn u-btn-primary" onClick={() => setReviewing('request')}><Send size={15} />Send for Review</button>
              )}
              {lifecycle.gate === 'awaitingReview' && (
                <button type="button" className="u-btn u-btn-primary" onClick={() => setReviewing('decide')}><ShieldCheck size={15} />Review Stage</button>
              )}
              {/* Lab results once the samples have gone to the lab (after the submitted inspection's review) */}
              {canEditResults && (
                <button type="button" className={`u-btn ${lifecycle.current === 'lab' ? 'u-btn-primary' : 'u-btn-outline'}`} onClick={() => setLabOm('lab')}>
                  <FlaskConical size={15} />{lifecycle.current === 'lab' ? 'Update Lab Results' : 'Lab Results'}
                </button>
              )}
              <button type="button" className="u-btn u-btn-outline" onClick={() => navigate(`/operations/activities/new?inspection=${record.id}`)}><Wrench size={15} />Add O&amp;M Task</button>
              <button type="button" className="u-btn u-btn-primary" onClick={() => setChangingStage(true)}><Milestone size={15} />Change Stage</button>
            </>
          )}
          {editable && (
            <>
              {/* In progress = saved, still being filled in; submitted = findings final, sent for review */}
              <button type="button" className="u-btn u-btn-outline" disabled={!!saving} onClick={() => save('draft')} title="Save and keep working on the inspection">
                <Save size={15} />{saving === 'draft' ? 'Saving…' : 'Mark as In Progress'}
              </button>
              <button type="button" className="u-btn u-btn-primary" disabled={!!saving} onClick={() => save('submitted')} title="Findings are complete — send for review">
                <Send size={15} />{saving === 'submitted' ? 'Submitting…' : isChild ? 'Submit for Review' : 'Inspection Submitted'}
              </button>
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
            <span>{record.assignment?.notes || 'Fill in the form on site. Mark as In Progress to start the inspection; Inspection Submitted when it’s complete.'}</span>
          </div>
        </div>
      )}
      {record?.state === 'submitted' && <div className="in-banner info"><Info size={16} /><div><strong>Waiting for review</strong><span>The record is locked until a reviewer approves it or returns it with comments (section 10).</span></div></div>}
      {record?.state === 'approved' && <div className="in-banner ok"><BadgeCheck size={16} /><div><strong>Approved by {record.verification?.reviewerName} on {fmtDay(record.verification?.approvalDate)}</strong><span>Approved inspections are locked. Action item status can still be updated.</span></div></div>}

      {isChild && !embedded && (
        <div className="in-banner info in-child-banner">
          <CornerUpLeft size={16} />
          <div>
            <strong>Follow-up inspection of <Link to={`/inspections/records/${record.parentId}?tab=followUp`}>{record.parentId}</Link>{parentInfo ? ` · ${parentInfo.type}` : ''}</strong>
            <span>
              Carried out under the parent inspection – it has no stages of its own. Its result, lab samples and O&amp;M work show in the parent’s
              Follow-up, Lab Results and O&amp;M tabs{parentInfo ? `; the parent is in ${parentInfo.stageLabel}` : ''}.
            </span>
          </div>
        </div>
      )}
      {record && !isChild && <LifecycleStepper lifecycle={lifecycle} />}
      {/* Tabs: the inspection and its timeline; once submitted also its follow-ups, lab samples and O&M work */}
      {sectionTabs.length > 0 && (
        <div className="in-family-tabs" role="tablist" aria-label="Inspection sections">
          {sectionTabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} className={`in-family-tab${activeTab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
              <t.icon size={15} />{t.label}{t.count != null && <span className="in-family-count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      {activeTab === 'timeline' && (timeline?.length ? <InspectionTimeline timeline={timeline} /> : <div className="u-card u-muted in-tab-empty">No activity recorded yet.</div>)}
      {showTabs && activeTab === 'followUp' && (
        <>
          <FollowUpsPanel followUps={followUps} selected={shownFollowUp} onSelect={setOpenFollowUp} />
          {/* The selected follow-up's own form: filled in, submitted for review and approved here */}
          {shownFollowUp && (
            <InspectionForm key={shownFollowUp} recordId={shownFollowUp} embedded onChanged={() => setRecord((r) => ({ ...r }))} />
          )}
        </>
      )}
      {showTabs && activeTab === 'lab' && (
        <LabPanel record={record} followUps={followUps} materials={materials} canEditParent={canEditResults}
          onUpdate={(r) => { setLabTarget(r.id === record.id ? null : r); setLabOm('lab') }} />
      )}
      {/* O&M tasks are added with the full O&M activity form, for this inspection or one of its follow-ups */}
      {showTabs && activeTab === 'om' && <OmPanel record={record} followUps={followUps} onAdd={(r) => navigate(`/operations/activities/new?inspection=${r.id}`)} />}
      {activeTab === 'inspection' && (
      <>
      {record && !isChild && (
        <StageReviews record={record} lifecycle={lifecycle} materials={materials} onUpdateResults={canEditResults ? () => setLabOm('lab') : undefined}
          onReview={lifecycle?.gate === 'awaitingReview' && (record.state === 'submitted' || record.state === 'approved') ? () => setReviewing('decide') : undefined} />
      )}

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
                options={[{ value: '', label: 'Select a type' }, ...opt([...(meta?.types ?? []), ...(record?.type && !meta?.types.includes(record.type) ? [record.type] : [])])]} />
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

      <section className="u-card in-acms" aria-label="ACMs in this inspection">
        <header className="in-acms-head">
          <div>
            <h2><Layers size={16} />ACMs in this Inspection <span className="u-muted">({acmList.filter((x) => x.materialId).length})</span></h2>
            <p className="in-hint">Sections 1–6 are filled in for the selected ACM. Comments, action items and signatures cover the whole inspection.</p>
          </div>
          {editable && (
            <div className="in-acm-add" title={form.acms[0].materialId || form.materialId ? undefined : 'Choose the first ACM in section 1 first'}>
              <SearchSelect variant="field" label="Add another ACM" value="" onChange={addAcm} searchPlaceholder="Search by material, school, floor or room…"
                options={[{ value: '', label: '+ Add another ACM (any room or floor)' },
                  ...materials.filter((m) => !acmList.some((x) => x.materialId === m.id)).map((m) => ({ value: m.id, label: `${m.name} (${m.acmStatus}) — ${m.place}` }))]} />
            </div>
          )}
        </header>
        <div className="in-acm-tabs" role="tablist" aria-label="Select an ACM">
          {acmList.map((x, i) => {
            const m = acmMeta(x)
            const errs = acmErrorCount(allErrors, i)
            return (
              <div key={`${x.materialId}-${i}`} className={`in-acm-tab${i === form.active ? ' on' : ''}${errs ? ' err' : ''}`}>
                <button type="button" role="tab" aria-selected={i === form.active} onClick={() => selectAcm(i)}>
                  <span className="in-acm-n">{errs ? <TriangleAlert size={12} /> : acmDone(x) ? <CircleCheck size={13} /> : i + 1}</span>
                  <span className="in-acm-text">
                    <strong>{m?.name ?? (x.materialId ? x.materialId : 'Choose the ACM in section 1')}</strong>
                    {m && <small>{m.floorName} · {m.roomNumber} {m.roomName}</small>}
                  </span>
                  {errs > 0 && <small className="in-acm-errs">{errs} to fix</small>}
                </button>
                {editable && acmList.length > 1 && (
                  <button type="button" className="in-acm-remove" onClick={() => removeAcm(i)} aria-label={`Remove ${m?.name ?? 'ACM'} from the inspection`}><X size={13} /></button>
                )}
              </div>
            )
          })}
        </div>
        {issueGroups.length > 0 && (
          <div className="in-acm-issues" role="alert">
            <p><TriangleAlert size={15} /><strong>{issueCount} required field{issueCount === 1 ? '' : 's'} to complete before submitting</strong></p>
            <ul>
              {issueGroups.map((g) => (
                <li key={g.label}>
                  <span className="in-acm-issue-who">{g.label}</span>
                  <span className="in-acm-issue-list">
                    {g.sections.map((s) => (
                      <button key={s.title} type="button" className="in-acm-issue" onClick={() => goToError(s.key)}>
                        {s.title} <b>{s.count}</b>
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="sv-form-layout">
        <div className="sv-form-main">
        <fieldset className="in-fieldset in-stack" disabled={!editable}>
          <Section id="location" n={1} title="School & Location Details" aside={acmTag}>
            <div className="sv-grid in-grid-3">
              <ReadRow label="District">{meta?.district}</ReadRow>
              <ReadRow label="School">{loc?.schoolName}</ReadRow>
              <ReadRow label="Building">{loc?.buildingName}</ReadRow>
              <ReadRow label="Floor">{loc?.floorName}</ReadRow>
              <ReadRow label="Room">{loc && `${loc.roomNumber} – ${loc.roomName}`}</ReadRow>
              {loc && <Link to={floorLink(loc)} className="ai-link in-read-link"><MapPin size={13} />Open on floor plan</Link>}
            </div>
            <div className="sv-grid in-grid-3 in-gap-top">
              <div className="uf-field sv-span-3">
                <span>ACM Being Inspected *</span>
                {editable && !record ? (
                  <SearchSelect variant="field" label="ACM" value={form.materialId} onChange={set('materialId')} searchPlaceholder="Search by material, school or room…"
                    options={[{ value: '', label: 'Select the material' }, ...materials.map((m) => ({ value: m.id, label: `${m.name} (${m.acmStatus}) — ${m.place}` }))]} />
                ) : <input className="u-input" readOnly value={mat ? `${shortAcm(mat.id, loc?.schoolId)} – ${mat.name}` : ''} />}
                <Err msg={errors.materialId} />
              </div>
              <label className="uf-field sv-span-3">
                <span>Location Description *</span>
                <input className={`u-input${errors.locationDescription ? ' invalid' : ''}`} value={form.locationDescription} maxLength={160} placeholder="e.g. Ceiling near entrance"
                  onChange={(e) => set('locationDescription')(e.target.value)} />
                <Err msg={errors.locationDescription} />
              </label>
            </div>
          </Section>

          <Section id="acm" n={2} title="ACM Material Details" aside={acmTag} hint="From the ACM inventory. Change these on the room's floor plan if they're wrong.">
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

          <Section id="condition" n={3} title="Material Condition Assessment" aside={acmTag}>
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

          <Section id="checklist" n={4} title="Inspection Checklist" aside={acmTag} hint="Add a note or attach a photo / document to any answer (optional).">
            <input ref={evidenceRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && evidenceFor) uploadEvidence(evidenceFor, f) }} />
            <table className="in-checklist">
              <thead><tr><th>Question</th><th>Response</th><th>Notes &amp; Evidence</th></tr></thead>
              <tbody>
                {(meta?.checklist ?? []).map((q) => {
                  // Evidence for this question on the selected ACM (older files without an ACM belong to the first one)
                  const files = record?.attachments.filter((f) => f.checklistKey === q.key && (f.materialId ?? record.materialId) === form.materialId) ?? []
                  const canAttach = savedAcmIds.includes(form.materialId)
                  return (
                    <tr key={q.key} className={errors[`checklist.${q.key}`] ? 'invalid' : undefined}>
                      <td>{q.question}<Err msg={errors[`checklist.${q.key}`]} /></td>
                      <td><Choice name={q.question} options={q.answers} value={form.checklist[q.key] ?? ''} onChange={setIn('checklist', q.key)} /></td>
                      <td className="in-cl-extra">
                        <div className="in-cl-row">
                          <input className="u-input in-cl-note" value={form.checklistNotes[q.key] ?? ''} maxLength={500} placeholder="Add a note (optional)"
                            onChange={(e) => setIn('checklistNotes', q.key)(e.target.value)} aria-label={`Note for: ${q.question}`} />
                          <button type="button" className="u-row-btn" disabled={!canAttach} aria-label={`Attach a photo or document to: ${q.question}`}
                            title={canAttach ? 'Attach a photo or document' : 'Mark as In Progress first to attach files'}
                            onClick={() => { setEvidenceFor(q.key); evidenceRef.current?.click() }}>
                            <Paperclip size={14} />
                          </button>
                        </div>
                        {files.length > 0 && (
                          <div className="in-cl-files">
                            {files.map((f) => (
                              <span key={f.id} className="in-cl-file">
                                {f.mime === 'application/pdf' ? <FileText size={12} /> : <ImageIcon size={12} />}
                                <a href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer" title={f.name}>{f.name}</a>
                                {editable && <button type="button" onClick={() => removeDoc(f)} aria-label={`Remove ${f.name}`}><Trash2 size={11} /></button>}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>

          <Section id="sampling" n={5} title="Sampling & Laboratory Details" aside={acmTag}>
            <div className="uf-field">
              <span>Sample Required *</span>
              <Choice name="Sample required" options={['Yes', 'No']} value={form.sampling.required} onChange={setIn('sampling', 'required')} error={errors['sampling.required']} />
              <Err msg={errors['sampling.required']} />
            </div>
            {form.sampling.required === 'Yes' && (
              <div className="sv-grid in-grid-3 in-gap-top">
                <div className="uf-field sv-span-3">
                  <span>Sample Type *</span>
                  <div className={`in-stype${editable ? '' : ' locked'}`} role="radiogroup" aria-label="Sample type">
                    {(meta?.sampleTypes ?? []).map((t) => (
                      <label key={t.value} className={`in-stype-opt${form.sampling.sampleType === t.value ? ' on' : ''}`}>
                        <input type="radio" name={`sample-type-${form.active}`} checked={form.sampling.sampleType === t.value} onChange={() => setSampleType(t.value)} />
                        <strong>{t.value}</strong>
                        <small>{t.purpose}</small>
                        <small className="u-muted">{t.examples}</small>
                      </label>
                    ))}
                  </div>
                  <Err msg={errors['sampling.sampleType']} />
                </div>
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
                  <span>Laboratory Name *</span>
                  <SearchSelect variant="field" label="Laboratory" value={form.sampling.laboratory} onChange={setIn('sampling', 'laboratory')} searchable={false}
                    options={[{ value: '', label: 'Select a laboratory' },
                      ...opt([...(meta?.laboratories ?? []), ...(form.sampling.laboratory && !meta?.laboratories.includes(form.sampling.laboratory) ? [form.sampling.laboratory] : [])])]} />
                  <Err msg={errors['sampling.laboratory']} />
                </div>
                <div className="uf-field sv-span-2">
                  <span>What to Test *</span>
                  <SearchSelect variant="field" label="What to test" value={form.sampling.testMethod} onChange={setIn('sampling', 'testMethod')} searchable={false}
                    options={[{ value: '', label: sampleTypeDef ? 'Select the analysis' : 'Choose the sample type first' },
                      ...opt([...testOptions, ...(form.sampling.testMethod && !testOptions.includes(form.sampling.testMethod) ? [form.sampling.testMethod] : [])])]} />
                  <Err msg={errors['sampling.testMethod']} />
                </div>
                {isAirSample && (
                  <>
                    <div className="uf-field">
                      <span>Air Sample Kind *</span>
                      <SearchSelect variant="field" label="Air sample kind" value={form.sampling.airType ?? ''} onChange={setIn('sampling', 'airType')} searchable={false}
                        options={[{ value: '', label: 'Select' }, ...opt(meta?.air.types ?? [])]} />
                      <Err msg={errors['sampling.airType']} />
                    </div>
                    <label className="uf-field">
                      <span>Duration (minutes) *</span>
                      <input type="number" min={1} max={1440} className={`u-input${errors['sampling.durationMin'] ? ' invalid' : ''}`} value={form.sampling.durationMin ?? ''}
                        onChange={(e) => setIn('sampling', 'durationMin')(e.target.value === '' ? '' : Number(e.target.value))} />
                      <Err msg={errors['sampling.durationMin']} />
                    </label>
                    {airLimit && <p className="sv-hint in-air-limit">Judged against {airLimit.basis}: {airLimit.value} {airLimit.unit}. Listed under Air Monitoring once submitted.</p>}
                  </>
                )}
                <label className="uf-field sv-span-3">
                  <span>Additional Notes</span>
                  <textarea className="u-input sv-textarea" rows={2} maxLength={1000} value={form.sampling.notes ?? ''} placeholder="Chain of custody, turnaround, special handling…"
                    onChange={(e) => setIn('sampling', 'notes')(e.target.value)} />
                </label>
                <p className="sv-hint sv-span-3">The result is recorded after submission with “Update Lab Results” (with the lab report).</p>
              </div>
            )}
          </Section>

          <Section id="risk" n={6} title="Risk Assessment & Recommendations" aside={acmTag}>
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
            {!record && <p className="u-muted sv-empty-line">Mark the inspection as In Progress first, then attach photos and reports (PDF, JPG, PNG, WebP — up to 10 MB each).</p>}
            {record && !record.attachments.length && <p className="u-muted sv-empty-line">No photos or documents attached.</p>}
            {record?.attachments.length > 0 && (
              <ul className="sv-docs">
                {record.attachments.map((f) => (
                  <li key={f.id}>
                    {f.mime === 'application/pdf' ? <FileText size={16} /> : <ImageIcon size={16} />}
                    <a href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer">{f.name}</a>
                    <Badge tone="neutral">{f.category}</Badge>
                    {f.checklistKey && <small className="u-muted">Checklist: {meta?.checklist.find((q) => q.key === f.checklistKey)?.question ?? f.checklistKey}</small>}
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
      </>
      )}

      {confirmDialog}
      {reviewing && record && lifecycle && (
        <StageReviewDialog mode={reviewing} record={record} lifecycle={lifecycle} meta={meta} materials={materials} onClose={() => setReviewing(null)}
          onDone={(res, text) => { setReviewing(null); setRecord(res.record); setToast({ kind: 'success', text }) }} />
      )}
      {labOm && record && (
        <LabOmDialog mode={labOm} record={labTarget ?? record} meta={meta} materials={materials} lifecycle={labTarget ? null : lifecycle}
          onClose={() => { setLabOm(null); setLabTarget(null) }}
          onDone={(res, text, failed) => {
            setLabOm(null)
            const forFollowUp = Boolean(labTarget)
            setLabTarget(null)
            // A follow-up's results / tasks: reload this inspection (its stages and tabs follow the follow-up)
            if (forFollowUp) setRecord((r) => ({ ...r }))
            else {
              setRecord(res.record)
              setForm((f) => ({ ...f, actionItems: res.record.actionItems }))
            }
            const label = forFollowUp ? `${res.record.id}: ${text}` : text
            setToast(failed.length ? { kind: 'error', text: `${label} Not uploaded: ${failed.join(', ')}` } : { kind: 'success', text: label })
          }} />
      )}
      {changingStage && lifecycle && (
        <StageDialog record={record} lifecycle={lifecycle} meta={meta} onClose={() => setChangingStage(false)}
          onDone={(res, text, failed) => {
            setChangingStage(false)
            setRecord(res.record)
            setToast(failed.length ? { kind: 'error', text: `${text} Not uploaded: ${failed.join(', ')}` } : { kind: 'success', text })
          }} />
      )}
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
