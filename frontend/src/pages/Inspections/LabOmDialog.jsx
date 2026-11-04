import { useEffect, useRef, useState } from 'react'
import { X, FlaskConical, Wrench, Paperclip, FileText, Trash2, Plus, ArrowRight, CircleCheckBig, CalendarPlus, Send } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { fmtDay, isoToday, addDays } from '../Surveillance/survMeta'
import { request, uploadFile, API_BASE } from '../../lib/api'
import { LAB_DETAILS, METHODS, STANDARDS, PickOrType } from '../LabSamples/SampleResultDialog'

const MAX_BYTES = 10 * 1024 * 1024
const blankTask = (materialId) => ({ materialId: materialId ?? '', type: '', description: '', assignedToId: '', priority: 'Medium', dueDate: addDays(isoToday(), 14) })

/**
 * Laboratory Analysis: record each sample's result (with notes and the lab report), and — if the results call
 * for it — create O&M tasks under the inspection. Results take the inspection out of Laboratory Analysis;
 * O&M tasks move it to Corrective Action / Remediation until the work is completed in the O&M module.
 * mode 'lab' (results + optional O&M) or 'om' (O&M tasks only).
 */
export default function LabOmDialog({ mode, record, meta, materials, lifecycle, onClose, onDone }) {
  const acms = [record, ...(record.extra ?? [])]
  const nameOf = (id) => materials.find((m) => m.id === id)?.name ?? id
  const placeOf = (id) => { const m = materials.find((x) => x.id === id); return m ? `${m.floorName} · ${m.roomNumber} ${m.roomName}` : '' }
  const samples = acms.filter((a) => a.sampling?.required === 'Yes')

  const reportsOf = (id) => (record.attachments ?? []).filter((f) => f.category === 'Laboratory Report' && (f.materialId ?? record.materialId) === id)
  const [rows, setRows] = useState(() => samples.map((a) => ({
    materialId: a.materialId, notAnalyzed: a.sampling.result === 'Not Analyzed', value: a.sampling.airValue ?? a.sampling.measuredValue ?? '',
    asbestosTypes: a.sampling.asbestosTypes ?? [], notes: a.sampling.resultNotes ?? '', files: [], removeReports: [],
    ...Object.fromEntries(LAB_DETAILS.map((k) => [k, a.sampling[k] ?? ''])),
  })))
  const anyRecorded = samples.some((a) => a.sampling.result && a.sampling.result !== 'Pending')
  // Each sample type's measurement: air – fibre count against the Air Monitoring limit; bulk / soil – asbestos
  // content (%); dust – loading (s/cm²); each against its limit for Pass / Fail
  const isAir = (s) => s.sampleType === 'Air Sample'
  const measureOf = (s) => {
    if (isAir(s)) {
      const l = meta?.air?.limits[`${s.airType}|${/TEM/.test(s.testMethod ?? '') ? 'TEM' : 'PCM'}`]
      return { label: 'Fibre Count', unit: l?.unit ?? 'f/cc', limit: l?.value, basis: l?.basis }
    }
    return meta?.sampleTypes?.find((t) => t.value === (s.sampleType || 'Bulk Material Sample'))?.measure ?? { label: 'Result', unit: '' }
  }
  const withUnit = (v, unit) => `${v}${unit === '%' ? '' : ' '}${unit}`
  const verdict = (s, r) => {
    if (r.notAnalyzed) return { text: 'Not analysed', tone: '' }
    if (r.value === '' || r.value == null) return { text: 'Pending', tone: '' }
    const m = measureOf(s)
    const fail = m.limit != null && Number(r.value) > m.limit
    const finding = isAir(s) ? (fail ? 'Exceeds limit' : 'Below limit') : Number(r.value) > 0 ? 'Asbestos detected' : 'No asbestos detected'
    return { text: `${fail ? 'Fail' : 'Pass'} · ${finding}`, tone: fail ? 'bad' : 'good' }
  }
  const [omNeeded, setOmNeeded] = useState(mode === 'om')
  const [tasks, setTasks] = useState(() => [blankTask(acms.length === 1 ? record.materialId : '')])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState('')
  const fileInput = useRef(null)
  const [fileFor, setFileFor] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const setRow = (i, k) => (v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const setTask = (i, k) => (v) => { setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t))); setErrors((e) => { const n = { ...e }; delete n[`tasks.${i}.${k}`]; return n }) }
  const addFiles = (i, list) => {
    const ok = [...list].filter((f) => /\.(pdf|jpe?g|png|webp)$/i.test(f.name) && f.size <= MAX_BYTES)
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, files: [...r.files, ...ok].slice(0, 5) } : r)))
    setErrors((e) => ({ ...e, [`files.${i}`]: ok.length < list.length ? 'Use PDF, JPG, PNG or WebP files of up to 10 MB' : undefined }))
  }

  // O&M tasks are checked here too, so nothing is saved until everything is filled in
  const taskErrors = () => {
    const e = {}
    if (!omNeeded) return e
    tasks.forEach((t, i) => {
      if (!t.materialId) e[`tasks.${i}.materialId`] = 'Choose the ACM'
      if (!t.type) e[`tasks.${i}.type`] = 'Choose the activity type'
      if (!t.description.trim()) e[`tasks.${i}.description`] = 'Describe the work'
      if (!t.assignedToId) e[`tasks.${i}.assignedToId`] = 'Assign someone'
      if (!t.dueDate) e[`tasks.${i}.dueDate`] = 'Choose the due date'
    })
    return e
  }

  /**
   * After Laboratory Analysis: with O&M work the inspection can move straight to Corrective Action /
   * Remediation; without it the lab stage goes to a reviewer — to approve the results only, to close the
   * inspection, or to schedule a follow-up inspection (a child of this one).
   */
  const atLab = mode === 'lab' && lifecycle?.current === 'lab'
  const moveTo = atLab && omNeeded ? lifecycle.stages.find((s) => s.id === 'action') : null
  const canRequest = atLab && !omNeeded && lifecycle.gate !== 'awaitingReview'
  const openActions = (record.actionItems ?? []).some((a) => a.status !== 'Completed')
  const closeBlocked = openActions ? 'It has open action items'
    : acms.some((a) => a.risk?.followUpRequired === 'Yes') ? 'The inspector marked a follow-up as required'
      : record.state !== 'submitted' ? 'It already had its final review' : null
  const [nextStep, setNextStep] = useState('none')
  const [plan, setPlan] = useState({ inspectorId: record.inspectorId ?? '', scheduledDate: addDays(isoToday(), 30), scheduledTime: '09:00', notes: '' })
  const setPlanField = (k) => (v) => { setPlan((p) => ({ ...p, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[`followUp.${k}`]; return n }) }
  const STEP_LABEL = { review: 'Save & Send for Review', close: 'Save & Request Closure', followUp: 'Save & Request Follow-up' }

  const save = async (move = false) => {
    const pre = taskErrors()
    const requesting = move && canRequest && nextStep !== 'none'
    if ((move || requesting) && pendingLeft) pre.form = 'Enter every sample’s result (or mark it not analysed) first'
    if (requesting && nextStep === 'followUp') {
      if (!plan.inspectorId) pre['followUp.inspectorId'] = 'Choose the inspector'
      if (!plan.scheduledDate) pre['followUp.scheduledDate'] = 'Choose the date'
      if (!plan.scheduledTime) pre['followUp.scheduledTime'] = 'Choose the time'
    }
    if (Object.keys(pre).length) { setErrors(pre); return }
    setErrors({})
    const failed = []
    try {
      if (mode === 'lab' && rows.length) {
        // Reports taken off, then new ones, filed under Laboratory Analysis for their sample's ACM
        for (const fid of rows.flatMap((r) => r.removeReports)) {
          setSaving('Removing report…')
          await request(`/inspection-records/records/${record.id}/attachments/${fid}`, { method: 'DELETE' })
        }
        for (const r of rows) {
          for (const f of r.files) {
            setSaving(`Uploading report ${f.name}…`)
            try {
              await uploadFile(`/inspection-records/records/${record.id}/stage-documents`, f, { category: 'Laboratory Report', stage: 'lab', material: r.materialId })
            } catch (e) {
              failed.push(`${f.name} (${e.message})`)
            }
          }
        }
        setSaving('Saving results…')
        await request(`/inspection-records/records/${record.id}/lab-results`, {
          method: 'POST',
          body: {
            results: rows.map((r) => {
              const details = Object.fromEntries(LAB_DETAILS.map((k) => [k, r[k]]))
              return r.notAnalyzed
                ? { materialId: r.materialId, result: 'Not Analyzed', notes: r.notes, ...details }
                : { materialId: r.materialId, value: r.value, asbestosTypes: r.asbestosTypes, notes: r.notes, ...details }
            }),
          },
        })
      }
      if (omNeeded) {
        setSaving('Creating O&M tasks…')
        await request(`/inspection-records/records/${record.id}/om-tasks`, { method: 'POST', body: { tasks } })
      }
      let fresh = await request(`/inspection-records/records/${record.id}`)
      // Save & Move (O&M work): on to Corrective Action, recorded as a manual stage change with the reason
      const target = move && omNeeded && fresh.lifecycle.current === 'lab' ? fresh.lifecycle.stages.find((s) => s.id === 'action') : null
      if (target) {
        setSaving(`Moving to ${target.label}…`)
        const note = `Lab results recorded; ${tasks.length} O&M task${tasks.length === 1 ? '' : 's'} created`
        await request(`/inspection-records/records/${record.id}/stage`, { method: 'POST', body: { stage: target.id, note } })
        fresh = await request(`/inspection-records/records/${record.id}`)
      }
      // No O&M work: the lab stage goes to the reviewer, with a closure or follow-up request if one was chosen
      let requested = null
      if (requesting && (fresh.lifecycle.gate === 'readyForReview' || fresh.lifecycle.gate === 'returned')) {
        setSaving('Sending for review…')
        const note = nextStep === 'close' ? 'Lab results recorded – no O&M work needed. Please close the inspection.'
          : nextStep === 'followUp' ? 'Lab results recorded – no O&M work needed. Please schedule a follow-up inspection.' : 'Lab results recorded.'
        await request(`/inspection-records/records/${record.id}/stage-review/request`, {
          method: 'POST', body: { note, fileIds: [], ...(nextStep === 'review' ? {} : { outcome: nextStep }), ...(nextStep === 'followUp' ? { followUp: plan } : {}) },
        })
        fresh = await request(`/inspection-records/records/${record.id}`)
        requested = nextStep
      }
      const stage = fresh.lifecycle.stages.find((s) => s.id === fresh.lifecycle.current)?.label
      const parts = [mode === 'lab' && rows.length && (anyRecorded ? 'Lab results updated' : 'Lab results saved'), omNeeded && `${tasks.length} O&M task${tasks.length === 1 ? '' : 's'} created`]
      const next = target ? ''
        : requested === 'close' ? ' Closure requested – the reviewer closes the inspection on approval.'
          : requested === 'followUp' ? ' Follow-up requested – the reviewer schedules it on approval.'
            : requested ? ' Sent for review.'
              : fresh.lifecycle.gate === 'readyForReview' || fresh.lifecycle.gate === 'returned' ? ' Use Send for Review so a reviewer can approve them.'
                : fresh.lifecycle.gate === 'awaitingReview' ? ' The reviewer sees the updated results.' : ''
      onDone(fresh, `${parts.filter(Boolean).join(' · ')}. Stage: ${stage}.${next}`, failed)
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
    } finally {
      setSaving('')
    }
  }

  const om = meta?.om ?? { types: [], priorities: [], assignees: [] }
  const pendingLeft = rows.filter((r) => !r.notAnalyzed && (r.value === '' || r.value == null)).length
  const toggleType = (i, t) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, asbestosTypes: r.asbestosTypes.includes(t) ? r.asbestosTypes.filter((x) => x !== t) : [...r.asbestosTypes, t] } : r)))

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="u-modal ai-add in-lab-modal" role="dialog" aria-modal="true" aria-labelledby="in-labom-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="in-labom-title">{mode === 'lab' ? <><FlaskConical size={18} />{anyRecorded ? 'Update' : 'Record'} Lab Results – {record.id}</> : <><Wrench size={18} />Add O&amp;M Tasks – {record.id}</>}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={!!saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple hidden
            onChange={(e) => { if (fileFor != null) addFiles(fileFor, e.target.files); e.target.value = '' }} />

          {mode === 'lab' && (
            <>
              <p className="ai-add-intro">
                Enter what the lab measured for each sample – Pass / Fail is worked out against the limit – and attach the lab report.
                Results can be corrected until the Laboratory Analysis review approves them; then use <strong>Send for Review</strong>.
              </p>
              <div className="in-labres">
                {rows.map((r, i) => {
                  const s = samples[i].sampling
                  const m = measureOf(s)
                  const v = verdict(s, r)
                  const err = (k) => errors[`results.${i}.${k}`]
                  const kept = reportsOf(r.materialId).filter((f) => !r.removeReports.includes(f.id))
                  return (
                    <div key={r.materialId} className="in-labres-row">
                      <div className="in-labres-head">
                        <strong>{s.sampleId || 'Sample'} · {nameOf(r.materialId)} <span className="in-labres-type">{s.sampleType || 'Bulk Material Sample'}{isAir(s) && s.airType ? ` · ${s.airType}` : ''}</span></strong>
                        <small className="u-muted">{placeOf(r.materialId)} · {s.laboratory} · {s.testMethod}{s.sentToLabAt ? ` · sent ${fmtDay(s.sentToLabAt)}` : ''}</small>
                      </div>
                      <div className="lr-res-grid in-labres-details">
                        <label className="uf-field"><span>Laboratory Name</span>
                          <input className="u-input" value={r.laboratory} maxLength={120} placeholder="e.g. ABC Environmental Testing Laboratory" onChange={(e) => setRow(i, 'laboratory')(e.target.value)} />
                        </label>
                        <label className="uf-field"><span>Laboratory Sample ID</span>
                          <input className="u-input" value={r.labSampleId} maxLength={120} placeholder="e.g. LAB-2026-13382" onChange={(e) => setRow(i, 'labSampleId')(e.target.value)} />
                        </label>
                        <label className="uf-field"><span>Lab Report No.</span>
                          <input className="u-input" value={r.labReportNo} maxLength={120} placeholder="e.g. LAB-RPT-2026-13382" onChange={(e) => setRow(i, 'labReportNo')(e.target.value)} />
                        </label>
                        <PickOrType label="Analysis Method" value={r.analysisMethod} choices={METHODS} placeholder="Enter the method" onChange={setRow(i, 'analysisMethod')} />
                        <PickOrType label="Analysis Standard" value={r.analysisStandard} choices={STANDARDS} placeholder="Enter the standard" onChange={setRow(i, 'analysisStandard')} />
                        <label className="uf-field"><span>Analysis Date</span>
                          <input type="date" className={`u-input${err('analysisDate') ? ' invalid' : ''}`} max={new Date().toISOString().slice(0, 10)} value={r.analysisDate} onChange={(e) => setRow(i, 'analysisDate')(e.target.value)} />
                          {err('analysisDate') && <em className="uf-error">{err('analysisDate')}</em>}
                        </label>
                        {!isAir(s) && (
                          <label className="uf-field"><span>Material Layer</span>
                            <input className="u-input" value={r.materialLayer} maxLength={120} placeholder="e.g. Floor Tile" onChange={(e) => setRow(i, 'materialLayer')(e.target.value)} />
                          </label>
                        )}
                      </div>
                      <div className="in-labres-fields">
                        <label className="uf-field">
                          <span>{m.unit === '%' ? 'Asbestos Percentage' : m.label} ({m.unit})</span>
                          <input type="number" min={0} max={m.max} step="any" className={`u-input${err('value') ? ' invalid' : ''}`} value={r.value} placeholder="Empty = pending"
                            disabled={r.notAnalyzed} onChange={(e) => setRow(i, 'value')(e.target.value)} />
                          {err('value') && <em className="uf-error">{err('value')}</em>}
                        </label>
                        <div className="uf-field">
                          <span>Test Result</span>
                          <span className={`in-labres-verdict ${v.tone}`}>{v.text}</span>
                          {m.limit != null && <small className="u-muted" title={m.basis}>Pass at or below {withUnit(m.limit, m.unit)}</small>}
                        </div>
                        <label className="in-labres-na">
                          <input type="checkbox" checked={r.notAnalyzed} onChange={(e) => setRow(i, 'notAnalyzed')(e.target.checked)} />Not analysed by the lab
                        </label>
                        {!isAir(s) && !r.notAnalyzed && Number(r.value) > 0 && (
                          <div className="uf-field in-labres-wide">
                            <span>Asbestos Type Found *</span>
                            <div className="in-labres-types" role="group" aria-label="Asbestos type">
                              {(meta?.asbestosTypes ?? []).map((t) => (
                                <button key={t} type="button" className={`in-labres-type-chip${r.asbestosTypes.includes(t) ? ' on' : ''}`} aria-pressed={r.asbestosTypes.includes(t)} onClick={() => toggleType(i, t)}>{t}</button>
                              ))}
                            </div>
                            {err('asbestosTypes') && <em className="uf-error">{err('asbestosTypes')}</em>}
                          </div>
                        )}
                        <label className="uf-field in-labres-wide">
                          <span>Result Notes</span>
                          <input className="u-input" value={r.notes} maxLength={1000} placeholder={isAir(s) ? 'e.g. 12 fibres counted in 100 fields' : 'e.g. Layer 2 (mastic) only'} onChange={(e) => setRow(i, 'notes')(e.target.value)} />
                        </label>
                      </div>
                      <div className="in-labres-reports">
                        <span className="in-labres-cap">Lab Reports</span>
                        {kept.map((f) => (
                          <span key={f.id} className="in-cl-file">
                            <a href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer"><FileText size={12} />{f.name}</a>
                            <button type="button" onClick={() => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, removeReports: [...x.removeReports, f.id] } : x)))} aria-label={`Remove ${f.name}`}><Trash2 size={11} /></button>
                          </span>
                        ))}
                        {r.removeReports.length > 0 && (
                          <button type="button" className="in-labres-undo" onClick={() => setRow(i, 'removeReports')([])}>Undo removal of {r.removeReports.length}</button>
                        )}
                        <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { setFileFor(i); fileInput.current?.click() }} disabled={r.files.length >= 5}>
                          <Paperclip size={13} />{kept.length ? 'Add Report' : 'Attach Report'}
                        </button>
                      </div>
                      {r.files.length > 0 && (
                        <div className="in-cl-files">
                          {r.files.map((f, j) => (
                            <span key={`${f.name}-${j}`} className="in-cl-file">
                              <FileText size={12} /><span>{f.name}</span>
                              <button type="button" onClick={() => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, files: x.files.filter((_, q) => q !== j) } : x)))} aria-label={`Remove ${f.name}`}><Trash2 size={11} /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      {errors[`files.${i}`] && <em className="uf-error">{errors[`files.${i}`]}</em>}
                      {errors[`results.${i}`] && <em className="uf-error">{errors[`results.${i}`]}</em>}
                    </div>
                  )
                })}
              </div>
              <label className="in-om-toggle">
                <input type="checkbox" checked={omNeeded} onChange={(e) => setOmNeeded(e.target.checked)} />
                <span><strong>O&amp;M / corrective work required</strong><small>Create O&amp;M tasks under this inspection – it moves to Corrective Action / Remediation until they’re completed.</small></span>
              </label>
            </>
          )}

          {omNeeded && (
            <div className="in-om-tasks">
              {mode === 'om' && <p className="ai-add-intro">Each task is created in Operations &amp; Maintenance, linked to this inspection. The inspection moves to Corrective Action / Remediation until the tasks are completed.</p>}
              {tasks.map((t, i) => {
                const err = (k) => errors[`tasks.${i}.${k}`]
                return (
                  <div key={i} className="in-om-task">
                    <div className="in-om-task-head">
                      <strong>O&amp;M Task {i + 1}</strong>
                      {tasks.length > 1 && <button type="button" className="u-row-btn" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}><Trash2 size={13} /></button>}
                    </div>
                    <div className="in-om-grid">
                      <div className="uf-field">
                        <span>ACM *</span>
                        <SearchSelect variant="field" label="ACM" value={t.materialId} onChange={setTask(i, 'materialId')} searchable={false}
                          options={[{ value: '', label: 'Choose the ACM' }, ...acms.map((a) => ({ value: a.materialId, label: `${nameOf(a.materialId)} – ${placeOf(a.materialId)}` }))]} />
                        {err('materialId') && <em className="uf-error">{err('materialId')}</em>}
                      </div>
                      <div className="uf-field">
                        <span>Activity Type *</span>
                        <SearchSelect variant="field" label="Activity type" value={t.type} onChange={setTask(i, 'type')} searchable={false}
                          options={[{ value: '', label: 'Choose the type' }, ...om.types.map((x) => ({ value: x, label: x }))]} />
                        {err('type') && <em className="uf-error">{err('type')}</em>}
                      </div>
                      <div className="uf-field">
                        <span>Priority *</span>
                        <SearchSelect variant="field" label="Priority" value={t.priority} onChange={setTask(i, 'priority')} searchable={false} options={om.priorities.map((x) => ({ value: x, label: x }))} />
                      </div>
                      <label className="uf-field in-om-desc">
                        <span>Work Description *</span>
                        <input className={`u-input${err('description') ? ' invalid' : ''}`} value={t.description} maxLength={500}
                          placeholder="e.g. Encapsulate damaged pipe lagging" onChange={(e) => setTask(i, 'description')(e.target.value)} />
                        {err('description') && <em className="uf-error">{err('description')}</em>}
                      </label>
                      <div className="uf-field">
                        <span>Assign To *</span>
                        <SearchSelect variant="field" label="Assign to" value={t.assignedToId} onChange={setTask(i, 'assignedToId')} searchPlaceholder="Search people…"
                          options={[{ value: '', label: 'Choose a person' }, ...om.assignees.map((p) => ({ value: p.id, label: `${p.name}${p.category ? ` – ${p.category}` : ''}` }))]} />
                        {err('assignedToId') && <em className="uf-error">{err('assignedToId')}</em>}
                      </div>
                      <label className="uf-field">
                        <span>Due Date *</span>
                        <input type="date" className={`u-input${err('dueDate') ? ' invalid' : ''}`} value={t.dueDate} min={isoToday()} onChange={(e) => setTask(i, 'dueDate')(e.target.value)} />
                        {err('dueDate') && <em className="uf-error">{err('dueDate')}</em>}
                      </label>
                    </div>
                  </div>
                )
              })}
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setTasks((ts) => [...ts, blankTask(acms.length === 1 ? record.materialId : '')])} disabled={tasks.length >= 20}>
                <Plus size={13} />Add Another Task
              </button>
            </div>
          )}
          {/* No O&M work: what happens after Laboratory Analysis — decided by the reviewer on approval */}
          {canRequest && (
            <section className="in-next" aria-label="Next step">
              <h3>Next Step <small className="u-muted">– no O&amp;M work needed; the reviewer approves it</small></h3>
              <div className="in-next-options" role="radiogroup" aria-label="Next step">
                {[
                  { id: 'close', icon: CircleCheckBig, title: 'Request Closure', text: 'Results are fine – close the inspection when the reviewer approves.', blocked: closeBlocked },
                  { id: 'followUp', icon: CalendarPlus, title: 'Request Follow-up Inspection', text: 'Schedule a follow-up inspection of these ACMs, linked to this one.' },
                  { id: 'review', icon: Send, title: 'Send for Review Only', text: 'The reviewer approves the results; the final review decides the rest.' },
                ].map((o) => (
                  <label key={o.id} className={`in-next-option${nextStep === o.id ? ' on' : ''}${o.blocked ? ' blocked' : ''}`}>
                    <input type="radio" name="next-step" checked={nextStep === o.id} disabled={!!o.blocked} onChange={() => setNextStep(o.id)} />
                    <o.icon size={18} />
                    <span><strong>{o.title}</strong><small>{o.blocked ? `Not available – ${o.blocked.toLowerCase()}` : o.text}</small></span>
                  </label>
                ))}
              </div>
              {nextStep === 'followUp' && (
                <div className="in-next-plan">
                  <div className="uf-field">
                    <span>Inspector *</span>
                    <SearchSelect variant="field" label="Inspector" value={plan.inspectorId} onChange={setPlanField('inspectorId')} searchPlaceholder="Search inspectors…"
                      options={[{ value: '', label: 'Choose the inspector' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
                    {errors['followUp.inspectorId'] && <em className="uf-error">{errors['followUp.inspectorId']}</em>}
                  </div>
                  <label className="uf-field">
                    <span>Date *</span>
                    <input type="date" className={`u-input${errors['followUp.scheduledDate'] ? ' invalid' : ''}`} value={plan.scheduledDate} min={isoToday()} onChange={(e) => setPlanField('scheduledDate')(e.target.value)} />
                    {errors['followUp.scheduledDate'] && <em className="uf-error">{errors['followUp.scheduledDate']}</em>}
                  </label>
                  <label className="uf-field">
                    <span>Time *</span>
                    <input type="time" className={`u-input${errors['followUp.scheduledTime'] ? ' invalid' : ''}`} value={plan.scheduledTime} onChange={(e) => setPlanField('scheduledTime')(e.target.value)} />
                    {errors['followUp.scheduledTime'] && <em className="uf-error">{errors['followUp.scheduledTime']}</em>}
                  </label>
                  <label className="uf-field in-next-notes">
                    <span>Notes for the Inspector</span>
                    <input className="u-input" value={plan.notes} maxLength={500} placeholder="e.g. Re-check the mastic after the lab result" onChange={(e) => setPlanField('notes')(e.target.value)} />
                  </label>
                </div>
              )}
              {errors.outcome && <em className="uf-error">{errors.outcome}</em>}
            </section>
          )}
          {(errors.form || errors.results || errors.tasks) && <p className="uf-error">{errors.form ?? errors.results ?? errors.tasks}</p>}
        </div>
        <footer className="u-modal-foot">
          {mode === 'lab' && rows.length > 0 && (
            <span className="u-muted in-labom-hint">{pendingLeft ? `${pendingLeft} sample${pendingLeft === 1 ? '' : 's'} still pending` : 'All results recorded'}</span>
          )}
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={!!saving}>Cancel</button>
          {/* The next step is the main action once one applies; saving alone stays available */}
          {(() => {
            const nextButton = moveTo || (canRequest && nextStep !== 'none')
            return (
              <>
                <button type="button" className={`u-btn ${nextButton ? 'u-btn-outline' : 'u-btn-primary'}`} onClick={() => save(false)} disabled={!!saving || (mode === 'om' && !tasks.length)}>
                  {saving || (mode === 'lab' ? (omNeeded ? 'Save Results & Create O&M Tasks' : anyRecorded ? 'Update Results' : 'Save Results') : 'Create O&M Tasks')}
                </button>
                {nextButton && !saving && (
                  <button type="button" className="u-btn u-btn-primary" onClick={() => save(true)} title={pendingLeft ? 'Enter every sample’s result first' : undefined}>
                    <ArrowRight size={15} />{moveTo ? <>Save &amp; Move to {moveTo.label}</> : STEP_LABEL[nextStep]}
                  </button>
                )}
              </>
            )
          })()}
        </footer>
      </div>
    </div>
  )
}
