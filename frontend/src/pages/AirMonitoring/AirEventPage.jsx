import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  Wind, ArrowLeft, Pencil, TriangleAlert, Info, FileText, FlaskConical, MapPin, ClipboardCheck, StickyNote, CircleCheck, CircleAlert, Lock,
} from 'lucide-react'
import AirEventForm from './AirEventForm'
import SampleResultDialog from '../LabSamples/SampleResultDialog'
import { AirStatusBadge } from './airMeta'
import { request, fmtDateTime, API_BASE } from '../../lib/api'
import { useGoBack } from '../../lib/useGoBack'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './air.css'
import '../LabSamples/labSamples.css' // shared detail-page layout (.lr-sp-*)

function Row({ label, children }) {
  return (
    <div className="cd-row">
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  )
}

/**
 * One air monitoring event on its own page: the result against its limit, the sample, where it was taken and
 * where it came from (logged here, or an air sample from an inspection — whose result is recorded on the
 * inspection), with notes and the lab report. Logged events can be edited here.
 */
export default function AirEventPage() {
  const { id } = useParams()
  const goBack = useGoBack('/air-monitoring')
  const [e, setEvent] = useState(null)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editing, setEditing] = useState(false)
  const [enteringResult, setEnteringResult] = useState(false)
  const [lists, setLists] = useState(null) // { meta, schools, buildings } for the edit form
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let cancelled = false
    request(`/air-monitoring/${encodeURIComponent(id)}`)
      .then((d) => { if (!cancelled) { setEvent(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.status === 404 ? 'notFound' : err.message) })
    return () => { cancelled = true }
  }, [id, refreshKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // The edit form's option lists, loaded when it's first opened
  const edit = useCallback(() => {
    setEditing(true)
    if (lists) return
    Promise.all([request('/air-monitoring/meta'), request('/schools'), request('/buildings')])
      .then(([meta, s, b]) => setLists({ meta, schools: s.schools, buildings: b.buildings }))
      .catch((err) => { setEditing(false); setToast({ kind: 'error', text: err.message }) })
  }, [lists])

  if (error === 'notFound') {
    return <div className="coming-soon"><strong>Monitoring event not found</strong><span><Link to="/air-monitoring">Back to Air Monitoring</Link></span></div>
  }

  const fromInspection = Boolean(e?.inspectionId)
  const unit = e?.limit?.unit ?? 'f/cc'
  const fail = e && e.result !== null && e.result > e.limit.value
  const ratio = e && e.result !== null ? e.result / e.limit.value : null

  return (
    <div className="air-event-page">
      <div className="c-head">
        <div>
          <h1><Wind size={22} />Air Monitoring Event <span className="a-mono">{id}</span></h1>
          <p>{e ? `${e.type} sample · ${e.schoolName} · ${fmtDateTime(e.sampledAt)}` : 'Loading…'}</p>
        </div>
        <div className="air-ev-actions">
          <button type="button" className="u-btn u-btn-outline" onClick={goBack}><ArrowLeft size={15} />Back</button>
          {/* Logged here and still pending: its fibre count is entered here; once submitted it's final
              (an inspection's air sample is recorded on the inspection) */}
          {e && !fromInspection && e.result === null && (
            <button type="button" className="u-btn u-btn-primary" onClick={edit}><Pencil size={15} />Enter Fibre Count</button>
          )}
          {/* An inspection's air sample: its result is entered here too (saved on the inspection) until the review approves it */}
          {e && fromInspection && e.resultsEditable && (
            <button type="button" className="u-btn u-btn-primary" onClick={() => setEnteringResult(true)}>
              <Pencil size={15} />{e.result === null ? 'Enter Lab Results' : 'Update Lab Results'}
            </button>
          )}
          {e && e.result !== null && !(fromInspection && e.resultsEditable) && <span className="air-ev-locked"><Lock size={13} />Submitted – read only</span>}
        </div>
      </div>

      {error && error !== 'notFound' && <div className="u-banner">Couldn't load the event ({error}).</div>}

      {e && (
        <>
          {/* The result against its limit */}
          <section className={`u-card air-ev-result ${e.status}`} aria-label="Result">
            <div className="air-ev-figure">
              <small>Fibre Count</small>
              <strong>{e.result === null ? 'Pending' : <>{e.result} <span>{unit}</span></>}</strong>
            </div>
            <div className="air-ev-figure">
              <small>Test Result</small>
              <strong className={`air-pass ${e.result === null ? '' : fail ? 'fail' : 'pass'}`}>{e.result === null ? '—' : fail ? 'Fail' : 'Pass'}</strong>
            </div>
            <div className="air-ev-figure">
              <small>Limit</small>
              <strong>{e.limit.value} <span>{unit}</span></strong>
              <em>{e.limit.basis}</em>
            </div>
            <div className="air-ev-figure">
              <small>Status</small>
              <AirStatusBadge status={e.status} />
              {ratio !== null && <em>{ratio < 0.01 ? '<1%' : `${Math.round(ratio * 100)}%`} of the limit</em>}
            </div>
          </section>
          {e.status === 'exceedance' && (
            <p className="air-alert air-ev-alert">
              <TriangleAlert size={15} />
              {ratio.toFixed(1)}× the {e.limit.basis.toLowerCase()} limit. Review containment and re-sample before re-occupancy.
            </p>
          )}

          <div className="lr-sp-layout">
            <div className="lr-sp-main">
              <section className="u-card lr-sp-card">
                <h2><FlaskConical size={16} />Laboratory Result</h2>
                <h3 className="lr-sp-sub">Analysis</h3>
                <dl className="cd-facts lr-sp-facts">
                  <Row label="Laboratory">{e.laboratory || <span className="u-muted">Not recorded</span>}</Row>
                  <Row label="Lab Sample ID">{e.labSampleId ? <span className="a-mono">{e.labSampleId}</span> : <span className="u-muted">Not recorded</span>}</Row>
                  <Row label="Analysis Method">{e.analysisMethod || (e.method === 'PCM' ? 'Phase Contrast Microscopy (PCM)' : 'Transmission Electron Microscopy (TEM)')}</Row>
                  <Row label="Lab Report No.">{e.labReportNo ? <span className="a-mono">{e.labReportNo}</span> : <span className="u-muted">Not recorded</span>}</Row>
                  <Row label="Analysis Standard">{e.analysisStandard || (e.method === 'PCM' ? 'NIOSH 7400' : 'AHERA TEM (40 CFR 763 App. A)')}</Row>
                  <Row label="Analysis Date">{e.analysisDate ? fmtDateTime(`${e.analysisDate}T00:00:00`).replace(/, \d\d:\d\d [AP]M$/, '') : <span className="u-muted">Not recorded</span>}</Row>
                </dl>
                <h3 className="lr-sp-sub">Findings</h3>
                <dl className="cd-facts lr-sp-facts">
                  <Row label="Fibre Count">{e.result === null ? <span className="u-muted">Pending</span> : <strong>{e.result} {unit}</strong>}</Row>
                  <Row label="Limit">{e.limit.value} {unit}</Row>
                  <Row label="Test Result">{e.result === null ? <span className="u-muted">Pending</span> : <span className={`lr-pass ${fail ? 'fail' : 'pass'}`}>{fail ? 'Fail' : 'Pass'}</span>}</Row>
                  <Row label="Of the Limit">{ratio === null ? <span className="u-muted">—</span> : ratio < 0.01 ? '<1%' : `${Math.round(ratio * 100)}%`}</Row>
                  <div className="cd-row lr-sp-span"><dt>Limit Basis</dt><dd>{e.limit.basis}</dd></div>
                </dl>
                <div className="lr-sp-files">
                  <span className="lr-sp-files-h">Lab Report Files</span>
                  {e.reports?.length
                    ? e.reports.map((f) => <a key={f.href} href={`${API_BASE}${f.href}`} target="_blank" rel="noreferrer" className="lr-report"><FileText size={13} />{f.name}</a>)
                    : fromInspection
                      ? <span className="u-muted">None yet – attach it with the lab result</span>
                      : <span className="u-muted">None attached – upload in <Link to="/reports/documents/other">Reports &amp; Documents</Link> (type: Air Monitoring)</span>}
                </div>
                <p className="lr-sp-recorded">
                  {e.result === null ? 'No fibre count recorded yet.'
                    : e.submittedAt ? `Submitted ${fmtDateTime(e.submittedAt)}${e.submittedBy?.name ? ` by ${e.submittedBy.name}` : ''}` : 'Result recorded.'}
                </p>
              </section>

              <section className="u-card lr-sp-card">
                <h2><MapPin size={16} />Sample &amp; Location</h2>
                <dl className="cd-facts lr-sp-facts">
                  <Row label="Event ID"><span className="a-mono">{e.id}</span></Row>
                  <Row label="Sample ID">{e.sampleId ? <span className="a-mono">{e.sampleId}</span> : null}</Row>
                  <Row label="Date & Time">{fmtDateTime(e.sampledAt)}</Row>
                  <Row label="Monitoring Type">{e.type}</Row>
                  <Row label="Method">{e.method === 'PCM' ? 'PCM (NIOSH 7400)' : 'TEM (AHERA)'}</Row>
                  <Row label="Duration">{e.durationMin != null ? `${e.durationMin} minutes` : null}</Row>
                  <Row label="School">{e.schoolName}</Row>
                  <Row label="Building">{e.buildingName}</Row>
                  <div className="cd-row lr-sp-span"><dt>Location / Room</dt><dd>{e.location || '—'}</dd></div>
                </dl>
              </section>
            </div>

            <aside className="lr-sp-side">
              <section className="u-card lr-sp-card">
                <h2><ClipboardCheck size={16} />{fromInspection ? 'From Inspection' : 'Source'}</h2>
                <dl className="cd-facts">
                  {fromInspection ? (
                    <>
                      <Row label="Inspection"><Link to={`/inspections/records/${e.inspectionId}?tab=lab`} className="sv-id">{e.inspectionId}</Link></Row>
                      <Row label="ACM Material">{e.materialName}</Row>
                      <Row label="Result">{e.resultsEditable ? 'Open – approved in the inspection’s review' : 'Approved in the inspection’s review'}</Row>
                    </>
                  ) : (
                    <>
                      <Row label="Logged In">Air Monitoring{e.loggedBy ? ` by ${e.loggedBy}` : ''}</Row>
                      <Row label="Related Inspection">
                        {e.relatedInspectionId
                          ? <Link to={`/inspections/records/${e.relatedInspectionId}`} className="sv-id">{e.relatedInspectionId}</Link>
                          : 'No inspection at this school'}
                      </Row>
                      <Row label="Status"><AirStatusBadge status={e.status} /></Row>
                    </>
                  )}
                </dl>
              </section>

              <section className="u-card lr-sp-card">
                <h2><StickyNote size={16} />Notes</h2>
                <p className={e.notes ? 'air-ev-notes' : 'u-muted air-ev-notes'}>{e.notes || 'No notes.'}</p>
                {e.sample && <p className="ad-sample"><Info size={13} />Sample record generated for this demo</p>}
              </section>
            </aside>
          </div>        </>
      )}

      {editing && lists && e && (
        <AirEventForm event={e} meta={lists.meta} schools={lists.schools} buildings={lists.buildings} onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            setRefreshKey((k) => k + 1)
            setToast(saved.status === 'exceedance'
              ? { kind: 'error', text: `${saved.id} submitted — exceedance recorded and a notification was raised.` }
              : { kind: 'success', text: saved.result === null ? `${saved.id} saved – still pending.` : `${saved.id} submitted.` })
          }} />
      )}
      {enteringResult && e && (
        <SampleResultDialog inspectionId={e.inspectionId} materialId={e.materialId} sampleKey={e.sampleKey ?? 0} onClose={() => setEnteringResult(false)}
          onSaved={(text, warn) => { setEnteringResult(false); setToast({ kind: warn ? 'error' : 'success', text }); setRefreshKey((k) => k + 1) }} />
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
