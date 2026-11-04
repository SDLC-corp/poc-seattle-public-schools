import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { X, Send, ShieldCheck, Undo2, Paperclip, FileText, Trash2, Plus, Eraser, FlaskConical, Wrench, ClipboardCheck, CircleCheckBig, CalendarPlus } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import SignaturePad from '../Surveillance/SignaturePad'
import Badge from '../AcmInventory/Badge'
import { fmtDay, isoToday, addDays } from '../Surveillance/survMeta'
import { ACTION_TONE, RESULT_TONE, PASS_TONE, measureText, limitText } from './inspMeta'
import { request, uploadFile, fmtDateTime, API_BASE } from '../../lib/api'

const MAX_BYTES = 10 * 1024 * 1024
const blankTask = () => ({ action: '', assignedTo: 'O&M – Maintenance', priority: 'Medium', dueDate: addDays(isoToday(), 14) })

/**
 * Stage review. mode 'request': send the current stage (its work done) to a reviewer, with a note and files.
 * mode 'decide': the reviewer checks the stage's work — Laboratory Analysis: confirms each sample result;
 * Corrective Action: the action items / O&M tasks, and can add open tasks (which returns the stage) — then
 * signs, dates and approves (next stage) or returns it with notes and files.
 */
export default function StageReviewDialog({ mode, record, lifecycle, meta, materials = [], onClose, onDone }) {
  const stageId = lifecycle.current
  const stage = lifecycle.stages.find((s) => s.id === stageId)
  const latest = (record.stageReviews ?? []).filter((x) => x.stage === stageId).at(-1)
  const lastReturn = latest?.status === 'returned' ? latest : null
  const acms = [record, ...(record.extra ?? [])]
  const samples = acms.filter((a) => a.sampling?.required === 'Yes')
  const nameOf = (id) => materials.find((m) => m.id === id)?.name ?? id

  const [note, setNote] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [reviewDate, setReviewDate] = useState(isoToday())
  const [signature, setSignature] = useState(null)
  const [confirmed, setConfirmed] = useState(() => new Set())
  const [tasks, setTasks] = useState([])
  // Inspection Submitted / Laboratory Analysis: the reviewer can correct each sample's details
  const SAMPLE_FIELDS = ['sampleId', 'collectionDate', 'laboratory', 'testMethod', 'notes']
  const [sampleEdits, setSampleEdits] = useState(() => Object.fromEntries(samples.map((a) => [a.materialId, Object.fromEntries(SAMPLE_FIELDS.map((k) => [k, a.sampling[k] ?? '']))])))
  const setSampleField = (id, k) => (v) => setSampleEdits((cur) => ({ ...cur, [id]: { ...cur[id], [k]: v } }))
  // Laboratory Analysis: O&M work the results call for (created on approval)
  const [omTasks, setOmTasks] = useState([])
  // A closure / follow-up request from the lab stage (the follow-up's inspector, date and time can be adjusted)
  const asksClose = latest?.outcome === 'close' || (stageId === 'followUp' && record.state === 'submitted')
  const [plan, setPlan] = useState(() => ({ inspectorId: '', scheduledDate: '', scheduledTime: '', notes: '', ...(latest?.followUpPlan ?? {}) }))
  const setPlanField = (k) => (v) => setPlan((p) => ({ ...p, [k]: v }))
  const blankOm = () => ({ materialId: samples.length === 1 ? samples[0].materialId : '', type: '', description: '', assignedToId: '', priority: 'Medium', dueDate: addDays(isoToday(), 14) })
  const setOm = (i, k) => (v) => setOmTasks((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)))
  const [files, setFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const addFiles = (list) => {
    const ok = [...list].filter((f) => /\.(pdf|jpe?g|png|webp)$/i.test(f.name) && f.size <= MAX_BYTES)
    setFiles((cur) => [...cur, ...ok].slice(0, 10))
    setErrors((e) => ({ ...e, files: ok.length < list.length ? 'Use PDF, JPG, PNG or WebP files of up to 10 MB' : undefined }))
  }
  const toggleSample = (id) => setConfirmed((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const setTask = (i, k) => (v) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, [k]: v } : t)))

  const submit = async (decision) => {
    const pre = {}
    if (mode === 'decide') {
      if (!reviewerId) pre.reviewerId = 'Choose the reviewer'
      if (!reviewDate) pre.reviewDate = 'Choose the review date'
      if (decision === 'approve' && !signature) pre.signature = 'Sign to approve'
      if (decision === 'approve' && stageId === 'lab' && confirmed.size < samples.length) pre.confirmedSamples = 'Confirm every sample result before approving'
      tasks.forEach((t, i) => { if (!t.action.trim()) pre[`newTasks.${i}.action`] = 'Describe the task' })
      if (decision === 'approve') {
        omTasks.forEach((t, i) => {
          if (!t.materialId) pre[`omTasks.${i}.materialId`] = 'Choose the ACM'
          if (!t.type) pre[`omTasks.${i}.type`] = 'Choose the type'
          if (!t.description.trim()) pre[`omTasks.${i}.description`] = 'Describe the work'
          if (!t.assignedToId) pre[`omTasks.${i}.assignedToId`] = 'Assign someone'
          if (!t.dueDate) pre[`omTasks.${i}.dueDate`] = 'Choose the due date'
        })
      }
    }
    if (decision === 'return' && !note.trim()) pre.comments = 'Tell them what needs to be done'
    if (Object.keys(pre).length) { setErrors(pre); return }
    setErrors({})
    try {
      const fileIds = []
      for (const f of files) {
        setSaving(`Uploading ${f.name}…`)
        const up = await uploadFile(`/inspection-records/records/${record.id}/stage-documents`, f, {
          category: f.type === 'application/pdf' ? 'Supporting Document' : 'After Work Photo', stage: stageId,
        })
        fileIds.push(up.id)
      }
      setSaving(mode === 'request' ? 'Sending…' : 'Saving…')
      if (mode === 'request') {
        await request(`/inspection-records/records/${record.id}/stage-review/request`, { method: 'POST', body: { note, fileIds } })
      } else {
        await request(`/inspection-records/records/${record.id}/stage-review/decide`, {
          method: 'POST',
          body: {
            decision, reviewerId, comments: note, fileIds, reviewDate, signature, confirmedSamples: [...confirmed], newTasks: decision === 'return' ? tasks : [],
            // Only the sample fields the reviewer changed
            sampleEdits: samples.map((a) => {
              const changed = Object.fromEntries(SAMPLE_FIELDS.filter((k) => (sampleEdits[a.materialId][k] ?? '') !== (a.sampling[k] ?? '')).map((k) => [k, sampleEdits[a.materialId][k]]))
              return Object.keys(changed).length ? { materialId: a.materialId, ...changed } : null
            }).filter(Boolean),
            omTasks: decision === 'approve' ? omTasks : [],
            ...(latest?.outcome === 'followUp' ? { followUp: plan } : {}),
          },
        })
      }
      const fresh = await request(`/inspection-records/records/${record.id}`)
      const next = fresh.lifecycle.stages.find((s) => s.id === fresh.lifecycle.current)?.label
      const text = mode === 'request' ? `${stage.label} sent for review.`
        : decision === 'approve' && stageId === 'submitted' ? `Approved – samples sent to the laboratory. Stage: ${next}.`
          : decision === 'approve' && asksClose ? `Approved – inspection closed. Stage: ${next}.`
          : decision === 'approve' && latest?.outcome === 'followUp' ? `Approved – follow-up inspection ${fresh.record.stageReviews.at(-1)?.childInspectionId ?? ''} scheduled. Stage: ${next}.`
          : decision === 'approve' && omTasks.length ? `${stage.label} approved · ${omTasks.length} O&M task${omTasks.length === 1 ? '' : 's'} created. Stage: ${next}.`
          : decision === 'approve' ? `${stage.label} approved. Stage: ${next}.`
            : stageId === 'submitted' ? 'Inspection returned to the inspector for changes.'
          : `${stage.label} returned for rework${tasks.length ? ` with ${tasks.length} new open task${tasks.length === 1 ? '' : 's'}` : ''}.`
      onDone(fresh, text)
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
    } finally {
      setSaving('')
    }
  }

  const fieldErr = (k) => errors[k] && <em className="uf-error">{errors[k]}</em>

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className={`u-modal ai-add in-stage-modal${mode === 'decide' ? ' in-review-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="in-review-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="in-review-title">{mode === 'request' ? <Send size={18} /> : <ShieldCheck size={18} />}{mode === 'request' ? 'Send for Review' : 'Review Stage'} – {stage?.label}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={!!saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          {mode === 'request' ? (
            <>
              <p className="ai-add-intro">
                The work in <strong>{stage?.label}</strong> is done ({stage?.hint?.replace(/\.$/, '').toLowerCase()}). A reviewer confirms it before the inspection moves to the next stage.
              </p>
              {lastReturn && <p className="in-review-returned"><Undo2 size={14} /><span><strong>Returned by {lastReturn.reviewerName}:</strong> {lastReturn.comments}</span></p>}
            </>
          ) : (
            <div className="in-review-request">
              <strong>Sent by {latest?.requestedBy?.name} · {latest?.requestedAt && fmtDateTime(latest.requestedAt)}</strong>
              {latest?.note ? <p>{latest.note}</p> : <p className="u-muted">No note.</p>}
              {latest?.outcome === 'close' && <p className="in-review-ask"><CircleCheckBig size={14} />Requested: <strong>close the inspection</strong> – approving gives it its final approval.</p>}
              {latest?.outcome === 'followUp' && <p className="in-review-ask"><CalendarPlus size={14} />Requested: <strong>a follow-up inspection</strong> – approving schedules it (adjust below).</p>}
              {stageId === 'followUp' && record.state === 'submitted' && <p className="in-review-ask"><CircleCheckBig size={14} />The follow-up is done – approving <strong>closes the inspection</strong>.</p>}
            </div>
          )}

          {/* What the reviewer checks in this stage */}
          {/* Inspection Submitted / Laboratory Analysis: the samples, editable by the reviewer */}
          {mode === 'decide' && (stageId === 'submitted' || stageId === 'lab') && (
            <section className="in-review-part">
              <h3>
                <FlaskConical size={15} />{stageId === 'submitted' ? 'Samples to Send to the Laboratory' : 'Samples & Lab Results'}
                <small className="u-muted">– {stageId === 'submitted' ? 'correct anything before sending' : 'confirm each result; details can be corrected'}</small>
              </h3>
              <div className="in-review-samples">
                {samples.map((a) => {
                  const s = a.sampling
                  const ed = sampleEdits[a.materialId]
                  const methods = meta?.sampleTypes?.find((t) => t.value === (s.sampleType || 'Bulk Material Sample'))?.testMethods ?? []
                  const reports = (record.attachments ?? []).filter((f) => f.category === 'Laboratory Report' && (f.materialId ?? record.materialId) === a.materialId)
                  const e = (k) => errors[`sampleEdits.${a.materialId}.${k}`]
                  return (
                    <div key={a.materialId} className={`in-review-sample${confirmed.has(a.materialId) ? ' ok' : ''}`}>
                      <div className="in-review-sample-head">
                        {stageId === 'lab' && (
                          <label className="in-review-confirm">
                            <input type="checkbox" checked={confirmed.has(a.materialId)} onChange={() => toggleSample(a.materialId)} />Confirm
                          </label>
                        )}
                        <strong>{nameOf(a.materialId)}</strong>
                        <span className="in-labres-type">{s.sampleType || 'Bulk Material Sample'}{s.airType ? ` · ${s.airType}, ${s.durationMin} min` : ''}</span>
                        {stageId === 'lab' && (
                          <span className="in-review-result">
                            <Badge tone={RESULT_TONE[s.result] ?? 'neutral'}>{s.result}</Badge>
                            {s.passFail && <Badge tone={PASS_TONE[s.passFail]}>{s.passFail}</Badge>}
                            {measureText(s) && <small>{measureText(s)}{limitText(s) ? ` · ${limitText(s)}` : ''}</small>}
                            {s.resultNotes && <small>{s.resultNotes}</small>}
                          </span>
                        )}
                      </div>
                      <div className="in-review-sample-grid">
                        <label className="uf-field"><span>Sample ID</span>
                          <input className={`u-input${e('sampleId') ? ' invalid' : ''}`} value={ed.sampleId} maxLength={30} onChange={(ev) => setSampleField(a.materialId, 'sampleId')(ev.target.value.toUpperCase())} />
                        </label>
                        <label className="uf-field"><span>Collected</span>
                          <input type="date" className={`u-input${e('collectionDate') ? ' invalid' : ''}`} value={ed.collectionDate} max={isoToday()} onChange={(ev) => setSampleField(a.materialId, 'collectionDate')(ev.target.value)} />
                        </label>
                        <div className="uf-field"><span>Laboratory</span>
                          <SearchSelect variant="field" label="Laboratory" value={ed.laboratory} onChange={setSampleField(a.materialId, 'laboratory')} searchable={false}
                            options={[...new Set([...(meta?.laboratories ?? []), ed.laboratory].filter(Boolean))].map((x) => ({ value: x, label: x }))} />
                        </div>
                        <div className="uf-field"><span>What to Test</span>
                          <SearchSelect variant="field" label="What to test" value={ed.testMethod} onChange={setSampleField(a.materialId, 'testMethod')} searchable={false}
                            options={[...new Set([...methods, ed.testMethod].filter(Boolean))].map((x) => ({ value: x, label: x }))} />
                        </div>
                        <label className="uf-field in-review-wide"><span>Notes</span>
                          <input className="u-input" value={ed.notes} maxLength={1000} placeholder="Chain of custody, turnaround…" onChange={(ev) => setSampleField(a.materialId, 'notes')(ev.target.value)} />
                        </label>
                      </div>
                      {stageId === 'lab' && reports.length > 0 && (
                        <div className="in-review-reports">
                          {reports.map((f) => <a key={f.id} href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer" className="in-review-doc"><FileText size={12} />{f.name}</a>)}
                        </div>
                      )}
                      {['sampleId', 'collectionDate', 'laboratory', 'testMethod'].map((k) => e(k) && <em key={k} className="uf-error">{e(k)}</em>)}
                    </div>
                  )
                })}
              </div>
              {fieldErr('confirmedSamples')}
            </section>
          )}

          {/* Laboratory Analysis: O&M work the results call for — created when the stage is approved */}
          {/* A requested follow-up inspection: scheduled on approval, as a child of this one */}
          {mode === 'decide' && latest?.outcome === 'followUp' && (
            <section className="in-review-part">
              <h3><CalendarPlus size={15} />Follow-up Inspection <small className="u-muted">– scheduled when you approve; adjust if needed</small></h3>
              <div className="in-next-plan">
                <div className="uf-field">
                  <span>Inspector *</span>
                  <SearchSelect variant="field" label="Inspector" value={plan.inspectorId} onChange={setPlanField('inspectorId')} searchPlaceholder="Search inspectors…"
                    options={[{ value: '', label: 'Choose the inspector' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
                  {fieldErr('followUp.inspectorId')}
                </div>
                <label className="uf-field">
                  <span>Date *</span>
                  <input type="date" className="u-input" value={plan.scheduledDate} min={isoToday()} onChange={(e) => setPlanField('scheduledDate')(e.target.value)} />
                  {fieldErr('followUp.scheduledDate')}
                </label>
                <label className="uf-field">
                  <span>Time *</span>
                  <input type="time" className="u-input" value={plan.scheduledTime} onChange={(e) => setPlanField('scheduledTime')(e.target.value)} />
                  {fieldErr('followUp.scheduledTime')}
                </label>
                <label className="uf-field in-next-notes">
                  <span>Notes for the Inspector</span>
                  <input className="u-input" value={plan.notes} maxLength={500} onChange={(e) => setPlanField('notes')(e.target.value)} />
                </label>
              </div>
            </section>
          )}

          {mode === 'decide' && stageId === 'lab' && !latest?.outcome && (
            <section className="in-review-part">
              <h3><Wrench size={15} />O&amp;M Tasks <small className="u-muted">– optional; created on approval and the inspection moves to Corrective Action</small></h3>
              {omTasks.map((t, i) => {
                const e = (k) => errors[`omTasks.${i}.${k}`]
                return (
                  <div key={i} className="in-om-task">
                    <div className="in-om-task-head">
                      <strong>O&amp;M Task {i + 1}</strong>
                      <button type="button" className="u-row-btn" onClick={() => setOmTasks((ts) => ts.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}><Trash2 size={13} /></button>
                    </div>
                    <div className="in-om-grid">
                      <div className="uf-field"><span>ACM *</span>
                        <SearchSelect variant="field" label="ACM" value={t.materialId} onChange={setOm(i, 'materialId')} searchable={false}
                          options={[{ value: '', label: 'Choose the ACM' }, ...acms.map((a) => ({ value: a.materialId, label: nameOf(a.materialId) }))]} />
                        {e('materialId') && <em className="uf-error">{e('materialId')}</em>}
                      </div>
                      <div className="uf-field"><span>Activity Type *</span>
                        <SearchSelect variant="field" label="Activity type" value={t.type} onChange={setOm(i, 'type')} searchable={false}
                          options={[{ value: '', label: 'Choose the type' }, ...(meta?.om?.types ?? []).map((x) => ({ value: x, label: x }))]} />
                        {e('type') && <em className="uf-error">{e('type')}</em>}
                      </div>
                      <div className="uf-field"><span>Priority *</span>
                        <SearchSelect variant="field" label="Priority" value={t.priority} onChange={setOm(i, 'priority')} searchable={false} options={(meta?.om?.priorities ?? []).map((x) => ({ value: x, label: x }))} />
                      </div>
                      <label className="uf-field in-om-desc"><span>Work Description *</span>
                        <input className={`u-input${e('description') ? ' invalid' : ''}`} value={t.description} maxLength={500} placeholder="e.g. Encapsulate the damaged ceiling tiles" onChange={(ev) => setOm(i, 'description')(ev.target.value)} />
                        {e('description') && <em className="uf-error">{e('description')}</em>}
                      </label>
                      <div className="uf-field"><span>Assign To *</span>
                        <SearchSelect variant="field" label="Assign to" value={t.assignedToId} onChange={setOm(i, 'assignedToId')} searchPlaceholder="Search people…"
                          options={[{ value: '', label: 'Choose a person' }, ...(meta?.om?.assignees ?? []).map((p) => ({ value: p.id, label: `${p.name}${p.category ? ` – ${p.category}` : ''}` }))]} />
                        {e('assignedToId') && <em className="uf-error">{e('assignedToId')}</em>}
                      </div>
                      <label className="uf-field"><span>Due Date *</span>
                        <input type="date" className={`u-input${e('dueDate') ? ' invalid' : ''}`} value={t.dueDate} min={isoToday()} onChange={(ev) => setOm(i, 'dueDate')(ev.target.value)} />
                        {e('dueDate') && <em className="uf-error">{e('dueDate')}</em>}
                      </label>
                    </div>
                  </div>
                )
              })}
              <button type="button" className="u-btn u-btn-outline u-btn-sm in-review-addtask" onClick={() => setOmTasks((ts) => [...ts, blankOm()])} disabled={omTasks.length >= 20}>
                <Plus size={13} />Add O&amp;M Task
              </button>
            </section>
          )}
          {mode === 'decide' && stageId === 'action' && (
            <section className="in-review-part">
              <h3><Wrench size={15} />Action Items &amp; O&amp;M Tasks</h3>
              <ul className="in-review-items">
                {record.actionItems.map((x) => (
                  <li key={x.id}>
                    <span className="in-review-item-text">
                      <strong>{x.action}</strong>
                      <small>{x.assignee ?? x.assignedTo} · {x.priority} · due {fmtDay(x.dueDate)}{x.omActivityId && <> · <Link to={`/operations/activities/${x.omActivityId}`}>{x.omActivityId}</Link></>}</small>
                    </span>
                    <Badge tone={ACTION_TONE[x.status]}>{x.status}</Badge>
                  </li>
                ))}
              </ul>
              {tasks.length > 0 && (
                <div className="in-review-newtasks">
                  <strong>New open tasks <small className="u-muted">(returns the stage for this work)</small></strong>
                  {tasks.map((t, i) => (
                    <div key={i} className="in-review-task">
                      <input className={`u-input${errors[`newTasks.${i}.action`] ? ' invalid' : ''}`} value={t.action} maxLength={200} placeholder="Task, e.g. Re-seal the remaining tile edges"
                        onChange={(e) => setTask(i, 'action')(e.target.value)} aria-label={`Task ${i + 1}`} />
                      <SearchSelect variant="field" label={`Responsible (task ${i + 1})`} value={t.assignedTo} onChange={setTask(i, 'assignedTo')} searchable={false}
                        options={(meta?.teams ?? []).map((x) => ({ value: x, label: x }))} />
                      <SearchSelect variant="field" label={`Priority (task ${i + 1})`} value={t.priority} onChange={setTask(i, 'priority')} searchable={false}
                        options={(meta?.priorities ?? []).map((x) => ({ value: x, label: x }))} />
                      <input type="date" className="u-input" value={t.dueDate} min={isoToday()} onChange={(e) => setTask(i, 'dueDate')(e.target.value)} aria-label={`Due date (task ${i + 1})`} />
                      <button type="button" className="u-row-btn" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} aria-label={`Remove task ${i + 1}`}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="u-btn u-btn-outline u-btn-sm in-review-addtask" onClick={() => setTasks((ts) => [...ts, blankTask()])} disabled={tasks.length >= 20}>
                <Plus size={13} />Add Open Task
              </button>
            </section>
          )}

          {mode === 'decide' && stageId === 'followUp' && (
            <section className="in-review-part">
              <h3><ClipboardCheck size={15} />Follow-up Verification</h3>
              <p className="in-review-sub">{stage?.detail}{stage?.link && <> · <Link to={stage.link}>Open follow-up inspection</Link></>}</p>
            </section>
          )}

          {mode === 'decide' && (
            <div className="in-review-signoff">
              <div className="uf-field">
                <span>Reviewer *</span>
                <SearchSelect variant="field" label="Reviewer" value={reviewerId} onChange={(v) => { setReviewerId(v); setErrors((e) => ({ ...e, reviewerId: undefined })) }} searchable={false}
                  options={[{ value: '', label: 'Select the reviewer' }, ...(meta?.reviewers ?? []).map((u) => ({ value: u.id, label: `${u.name}${u.title ? ` – ${u.title}` : ''}` }))]} />
                {fieldErr('reviewerId')}
              </div>
              <label className="uf-field">
                <span>Review Date *</span>
                <input type="date" className={`u-input${errors.reviewDate ? ' invalid' : ''}`} value={reviewDate} max={isoToday()} onChange={(e) => setReviewDate(e.target.value)} />
                {fieldErr('reviewDate')}
              </label>
              <div className="uf-field in-review-sign">
                <span className="in-sign-label">
                  Reviewer Signature (required to approve)
                  {signature && <button type="button" className="sv-link-btn" onClick={() => setSignature(null)}><Eraser size={13} />Clear</button>}
                </span>
                <SignaturePad value={signature} onChange={(s) => { setSignature(s); setErrors((e) => ({ ...e, signature: undefined })) }} invalid={!!errors.signature} label="reviewer" />
                {fieldErr('signature')}
              </div>
            </div>
          )}

          <label className="uf-field in-stage-note">
            <span>{mode === 'request' ? 'Note for the reviewer' : 'Review notes (required to return)'}</span>
            <textarea className={`u-input sv-textarea${errors.comments ? ' invalid' : ''}`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={mode === 'request' ? 'What was done, anything to check…' : 'Findings, conditions, what to rework…'} />
            {fieldErr('comments')}
          </label>

          <div className="in-stage-docs">
            <div className="in-stage-docs-head"><span><Paperclip size={14} />Files <small className="u-muted">(optional)</small></span></div>
            <div className="in-stage-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileInput.current?.click()} disabled={files.length >= 10}><Paperclip size={13} />Add files</button>
              <span className="u-muted">or drop them here · PDF, JPG, PNG or WebP, up to 10 MB each</span>
              <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            </div>
            {files.length > 0 && (
              <ul className="in-stage-files">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <FileText size={14} /><span className="in-stage-file-name" title={f.name}>{f.name}</span>
                    <button type="button" className="u-row-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            {fieldErr('files')}
          </div>
          {(errors.form || errors.decision || errors.newTasks) && <p className="uf-error">{errors.form ?? errors.decision ?? errors.newTasks}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={!!saving}>Cancel</button>
          {mode === 'request' ? (
            <button type="button" className="u-btn u-btn-primary" onClick={() => submit()} disabled={!!saving}><Send size={15} />{saving || 'Send for Review'}</button>
          ) : (
            <>
              <button type="button" className="u-btn u-btn-outline" onClick={() => submit('return')} disabled={!!saving}>
                <Undo2 size={15} />{tasks.length ? `Return with ${tasks.length} Open Task${tasks.length === 1 ? '' : 's'}` : stageId === 'submitted' ? 'Return to Inspector' : 'Return for Rework'}
              </button>
              <button type="button" className="u-btn u-btn-primary" onClick={() => submit('approve')} disabled={!!saving || tasks.length > 0}
                title={tasks.length ? 'New open tasks mean the stage isn’t finished – return it instead' : undefined}>
                <ShieldCheck size={15} />{saving || (stageId === 'submitted' ? 'Approve & Send to Lab'
                  : omTasks.length ? `Approve & Create ${omTasks.length} O&M Task${omTasks.length === 1 ? '' : 's'}`
                    : asksClose ? 'Approve & Close Inspection' : latest?.outcome === 'followUp' ? 'Approve & Schedule Follow-up' : 'Approve & Continue')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
