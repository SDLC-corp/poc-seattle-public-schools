import { Link } from 'react-router'
import { ShieldCheck, FileText, Undo2, Hourglass, FlaskConical, Wrench, PenLine, CircleCheckBig, CalendarPlus } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import { fmtDay } from '../Surveillance/survMeta'
import { fmtDateTime, API_BASE } from '../../lib/api'
import { RESULT_TONE, PASS_TONE, measureText, limitText } from './inspMeta'

const STATUS = {
  pending: { label: 'Waiting for review', tone: 'violet', icon: Hourglass },
  approved: { label: 'Approved', tone: 'good', icon: ShieldCheck },
  returned: { label: 'Returned for rework', tone: 'warning', icon: Undo2 },
}

const SAMPLE_STAGES = ['submitted', 'lab']

/**
 * Every stage review on the inspection (newest first): request, reviewer's decision, date, notes, signature and
 * files. Inspection Submitted / Laboratory Analysis reviews also list the samples with their lab details, the
 * reviewer's corrections and the O&M tasks created. A pending review has a Review Stage button (onReview);
 * Update Lab Results (onUpdateResults) while the results can still be changed.
 */
export default function StageReviews({ record, lifecycle, materials = [], onReview, onUpdateResults }) {
  // Newest first, by the latest thing that happened to each review (its decision, else its request)
  const when = (rv) => rv.decidedAt ?? rv.requestedAt ?? ''
  const reviews = [...(record.stageReviews ?? [])].sort((a, b) => when(b).localeCompare(when(a)))
  if (!reviews.length) return null
  const label = (id) => lifecycle?.stages.find((s) => s.id === id)?.label ?? id
  const files = (ids) => (record.attachments ?? []).filter((f) => ids?.includes(f.id))
  const task = (id) => record.actionItems.find((a) => a.id === id)
  const samples = [record, ...(record.extra ?? [])].filter((a) => a.sampling?.required === 'Yes')
  const nameOf = (id) => materials.find((m) => m.id === id)?.name ?? id
  const omOf = (id) => record.actionItems.find((a) => a.omActivityId === id)
  const Docs = ({ ids }) => (files(ids).length ? (
    <span className="in-rv-docs">
      {files(ids).map((f) => <a key={f.id} href={`${API_BASE}/inspection-records/records/${record.id}/attachments/${f.id}`} target="_blank" rel="noreferrer"><FileText size={12} />{f.name}</a>)}
    </span>
  ) : null)

  return (
    <section className="u-card in-rv" aria-label="Stage reviews">
      <div className="in-rv-top">
        <h2><ShieldCheck size={17} />Stage Reviews <span className="in-rv-count">{reviews.length}</span><small className="in-rv-order">Newest first</small></h2>
        {onUpdateResults && <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={onUpdateResults}><FlaskConical size={13} />Update Lab Results</button>}
      </div>
      <ol className="in-rv-list">
        {reviews.map((rv, idx) => {
          const st = STATUS[rv.status]
          return (
            <li key={rv.id} className={`in-rv-item ${rv.status}`}>
              <span className="in-rv-dot" aria-hidden="true"><st.icon size={12} /></span>
              <div className="in-rv-head">
                <strong>{label(rv.stage)}</strong>
                <Badge tone={st.tone}><st.icon size={12} />{st.label}</Badge>
                <span className="in-rv-when">{fmtDateTime(when(rv))}</span>
                {rv.status === 'pending' && onReview && rv.stage === lifecycle?.current && (
                  <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={onReview}><ShieldCheck size={13} />Review Stage</button>
                )}
              </div>
              {SAMPLE_STAGES.includes(rv.stage) && samples.length > 0 && (
                <details className="in-rv-samples" open={idx === 0}>
                  <summary className="in-rv-cap"><FlaskConical size={12} />Samples &amp; laboratory ({samples.length})</summary>
                  <div className="u-table-wrap">
                    <table className="u-table in-rv-table">
                      <thead>
                        <tr><th>Sample ID</th><th>ACM</th><th>Type</th><th>Collected</th><th>Laboratory</th><th>What to Test</th><th>Sent to Lab</th><th>Result</th></tr>
                      </thead>
                      <tbody>
                        {samples.map((a) => {
                          const s = a.sampling
                          return (
                            <tr key={a.materialId}>
                              <td><strong>{s.sampleId || '—'}</strong></td>
                              <td>{nameOf(a.materialId)}</td>
                              <td>{s.sampleType || 'Bulk Material Sample'}{s.airType ? ` · ${s.airType}` : ''}</td>
                              <td>{s.collectionDate ? fmtDay(s.collectionDate) : '—'}</td>
                              <td>{s.laboratory || '—'}</td>
                              <td>{s.testMethod || '—'}{s.notes && <small className="in-rv-sub">{s.notes}</small>}</td>
                              <td>{s.sentToLabAt ? <>{fmtDay(s.sentToLabAt)}<small className="in-rv-sub">{s.sentToLabBy?.name}</small></> : <span className="u-muted">Not sent</span>}</td>
                              <td>
                                <span className="in-rv-result">
                                  <Badge tone={RESULT_TONE[s.result] ?? 'neutral'}>{s.result}</Badge>
                                  {s.passFail && <Badge tone={PASS_TONE[s.passFail]}>{s.passFail}</Badge>}
                                </span>
                                {measureText(s) && <small className="in-rv-sub">{measureText(s)}{limitText(s) ? ` · ${limitText(s)}` : ''}</small>}
                                {s.resultNotes && <small className="in-rv-sub">{s.resultNotes}</small>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
              <div className="in-rv-cols">
                <div className="in-rv-col">
                  <small className="in-rv-cap">Sent for review</small>
                  <span>{rv.requestedBy?.name} · {fmtDateTime(rv.requestedAt)}</span>
                  {rv.note && <p className="in-rv-note">{rv.note}</p>}
                  {rv.outcome === 'close' && <small className="in-rv-ask"><CircleCheckBig size={12} />Requested closure</small>}
                  {rv.outcome === 'followUp' && rv.followUpPlan && (
                    <small className="in-rv-ask">
                      <CalendarPlus size={12} />Requested follow-up: {rv.followUpPlan.inspectorName} · {fmtDay(rv.followUpPlan.scheduledDate)} {rv.followUpPlan.scheduledTime}
                    </small>
                  )}
                  <Docs ids={rv.requestFileIds} />
                </div>
                {rv.status !== 'pending' && (
                  <div className="in-rv-col">
                    <small className="in-rv-cap">Review decision</small>
                    <span><strong>{rv.reviewerName}</strong> · review date {fmtDay(rv.reviewDate ?? rv.decidedAt)}</span>
                    {rv.comments && <p className="in-rv-note">{rv.comments}</p>}
                    {rv.confirmedSamples && <small className="u-muted">{rv.confirmedSamples.length} sample result{rv.confirmedSamples.length === 1 ? '' : 's'} confirmed</small>}
                    {rv.childInspectionId && (
                      <small className="in-rv-ask"><CalendarPlus size={12} />Follow-up inspection <Link to={`/inspections/records/${rv.childInspectionId}`}>{rv.childInspectionId}</Link> scheduled</small>
                    )}
                    {rv.status === 'approved' && rv.outcome === 'close' && <small className="in-rv-ask"><CircleCheckBig size={12} />Inspection closed</small>}
                    {rv.sampleChanges?.length > 0 && (
                      <ul className="in-rv-tasks">{rv.sampleChanges.map((c, i) => <li key={i}><PenLine size={11} /> Corrected {c.field}: {c.from} → {c.to}</li>)}</ul>
                    )}
                    {rv.omActivities?.length > 0 && (
                      <ul className="in-rv-tasks">
                        {rv.omActivities.map((id) => (
                          <li key={id}><Wrench size={11} /> O&amp;M task <Link to={`/operations/activities/${id}`}>{id}</Link>{omOf(id) && <>: {omOf(id).action} <small className="u-muted">({omOf(id).status})</small></>}</li>
                        ))}
                      </ul>
                    )}
                    {rv.addedTasks?.length > 0 && (
                      <ul className="in-rv-tasks">{rv.addedTasks.map((id) => <li key={id}>Open task: {task(id)?.action ?? id} <small className="u-muted">({task(id)?.status})</small></li>)}</ul>
                    )}
                    <Docs ids={rv.fileIds} />
                  </div>
                )}
                {rv.signature && (
                  <div className="in-rv-col in-rv-sigcol">
                    <small className="in-rv-cap">Signature</small>
                    <img className="in-rv-sig" src={rv.signature} alt={`Signature of ${rv.reviewerName}`} />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
