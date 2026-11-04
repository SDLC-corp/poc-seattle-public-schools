import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FlaskConical, ArrowLeft, MapPin, Microscope, FileSpreadsheet, Copy, ClipboardCheck, FileText, Pencil, CircleCheck, CircleAlert, Lock } from 'lucide-react'
import { ResultChip, RESULT_META } from './labMeta'
import SampleResultDialog from './SampleResultDialog'
import { request, fmtDateTime, API_BASE } from '../../lib/api'
import { useGoBack } from '../../lib/useGoBack'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './labSamples.css'

function Row({ label, children }) {
  return (
    <div className="cd-row">
      <dt>{label}</dt>
      <dd>{children ?? <span className="u-muted">Not recorded</span>}</dd>
    </div>
  )
}

const day = (iso) => (iso ? fmtDateTime(iso.length > 10 ? iso : `${iso}T00:00:00`).replace(/, \d\d:\d\d [AP]M$/, '') : null)
const samplePath = (id) => `/sampling/samples/${encodeURIComponent(id)}`

/**
 * One lab sample on its own page: the result, where it was taken, the inspection it came from (results are
 * entered on the inspection until its Laboratory Analysis review approves them), other rows with the same sample
 * number and where the record came from.
 */
export default function SamplePage() {
  const { id } = useParams()
  const goBack = useGoBack('/sampling')
  const [s, setSample] = useState(null)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [entering, setEntering] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let cancelled = false
    request(`/lab-samples/${encodeURIComponent(id)}`)
      .then((d) => { if (!cancelled) { setSample(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.status === 404 ? 'notFound' : err.message) })
    return () => { cancelled = true }
  }, [id, refreshKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (error === 'notFound') {
    return <div className="coming-soon"><strong>Sample not found</strong><span><Link to="/sampling">Back to Lab &amp; Sampling Results</Link></span></div>
  }

  const fromInspection = s?.source === 'inspection'
  const unit = s?.measureUnit === '%' ? '%' : s?.measureUnit ? ` ${s.measureUnit}` : ''

  return (
    <div className="lr-sample-page">
      <div className="c-head">
        <div>
          <h1><FlaskConical size={22} />Sample <span className="a-mono">{s?.sampleNo ?? '…'}</span></h1>
          <p>{s ? [s.sampleType ?? 'Bulk Material Sample', s.site, s.room && `Rm ${s.room}`].filter(Boolean).join(' · ') : 'Loading…'}</p>
        </div>
        <div className="lr-sp-actions">
          <button type="button" className="u-btn u-btn-outline" onClick={goBack}><ArrowLeft size={15} />Back</button>
          {/* Entered here (saved on the inspection) until its Laboratory Analysis review approves them */}
          {fromInspection && s.resultsEditable && (
            <button type="button" className="u-btn u-btn-primary" onClick={() => setEntering(true)}>
              <Pencil size={14} />{s.resultClass === 'pending' ? 'Enter Lab Results' : 'Update Lab Results'}
            </button>
          )}
          {fromInspection && !s.resultsEditable && s.resultClass !== 'pending' && <span className="lr-sp-locked"><Lock size={13} />Results approved – read only</span>}
        </div>
      </div>

      {error && <div className="u-banner">Couldn't load the sample ({error}).</div>}

      {s && (
        <>
          {/* The result at a glance */}
          <section className={`u-card lr-sp-result ${s.resultClass}`} aria-label="Result">
            <div className="lr-sp-figure">
              <small>Classification</small>
              <ResultChip resultClass={s.resultClass} label={RESULT_META[s.resultClass].label} />
            </div>
            {fromInspection && s.measuredValue != null ? (
              <>
                <div className="lr-sp-figure">
                  <small>{s.measureUnit === '%' ? 'Asbestos Content' : 'Dust Loading'}</small>
                  <strong>{s.measuredValue}<span>{unit}</span></strong>
                  {s.limitValue != null && <em>limit {s.limitValue}{unit}</em>}
                </div>
                <div className="lr-sp-figure">
                  <small>Test Result</small>
                  <strong className={`lr-pass ${s.passFail === 'Fail' ? 'fail' : 'pass'}`}>{s.passFail}</strong>
                </div>
              </>
            ) : (
              <div className="lr-sp-figure lr-sp-wide">
                <small>{fromInspection ? 'Result' : 'As Reported'}</small>
                <strong className="lr-sp-text">{fromInspection ? (s.resultClass === 'pending' ? 'Awaiting lab result' : RESULT_META[s.resultClass].label) : s.result}</strong>
              </div>
            )}
            <div className="lr-sp-figure">
              <small>Asbestos Type</small>
              <strong className="lr-sp-text">
                {fromInspection ? (s.asbestosTypes?.length ? s.asbestosTypes.join(', ') : '—') : (s.components.length ? s.components.join(', ') : '—')}
              </strong>
            </div>
          </section>

          <div className="lr-sp-layout">
            <div className="lr-sp-main">
              <section className="u-card lr-sp-card">
                <h2><Microscope size={16} />Laboratory Result</h2>
                {fromInspection ? (
                  <>
                    <h3 className="lr-sp-sub">Analysis</h3>
                    <dl className="cd-facts lr-sp-facts">
                      <Row label="Laboratory Name">{s.laboratory}</Row>
                      <Row label="Lab Sample ID">{s.labSampleId && <span className="a-mono">{s.labSampleId}</span>}</Row>
                      <Row label="Analysis Method">{s.analysisMethod ?? s.testMethod}</Row>
                      <Row label="Lab Report No.">{s.labReportNo && <span className="a-mono">{s.labReportNo}</span>}</Row>
                      <Row label="Analysis Standard">{s.analysisStandard}</Row>
                      <Row label="Analysis Date">{day(s.analysisDate)}</Row>
                    </dl>
                    <h3 className="lr-sp-sub">Findings</h3>
                    <dl className="cd-facts lr-sp-facts">
                      <Row label="Result">{s.resultClass === 'pending' ? 'Pending at lab' : RESULT_META[s.resultClass].label}</Row>
                      <Row label="Asbestos Detected">{s.resultClass === 'pending' ? 'Pending' : s.resultClass === 'detected' ? 'Yes' : s.resultClass === 'none' ? 'No' : '—'}</Row>
                      <Row label="Asbestos Type">{s.asbestosTypes?.length ? s.asbestosTypes.join(', ') : null}</Row>
                      <Row label={s.measureUnit && s.measureUnit !== '%' ? 'Measured' : 'Asbestos Percentage'}>{s.measuredValue != null ? `${s.measuredValue}${unit}` : null}</Row>
                      <Row label="Material Layer">{s.materialLayer}</Row>
                      <Row label="Test Result">{s.passFail && <span className={`lr-pass ${s.passFail === 'Fail' ? 'fail' : 'pass'}`}>{s.passFail}</span>}</Row>
                      {s.resultNotes && <div className="cd-row lr-sp-span"><dt>Result Notes</dt><dd>{s.resultNotes}</dd></div>}
                    </dl>
                    <div className="lr-sp-files">
                      <span className="lr-sp-files-h">Lab Report Files</span>
                      {s.reports?.length
                        ? s.reports.map((f) => <a key={f.href} href={`${API_BASE}${f.href}`} target="_blank" rel="noreferrer" className="lr-report"><FileText size={13} />{f.name}</a>)
                        : <span className="u-muted">No files uploaded</span>}
                    </div>
                    <p className="lr-sp-recorded">
                      {s.resultRecordedAt
                        ? `${s.resultUpdatedAt ? 'Last updated' : 'Recorded'} ${fmtDateTime(s.resultUpdatedAt ?? s.resultRecordedAt)}${s.resultRecordedBy ? ` by ${s.resultRecordedBy}` : ''}`
                        : 'No result recorded yet.'}
                    </p>
                  </>
                ) : (
                  <dl className="cd-facts">
                    <Row label="Classification"><ResultChip resultClass={s.resultClass} label={RESULT_META[s.resultClass].label} /></Row>
                    {s.components.length > 0 && (
                      <Row label="Asbestos">
                        <ul className="lr-components">{s.components.map((c) => <li key={c}>{c}</li>)}</ul>
                      </Row>
                    )}
                    <Row label="As Reported"><q className="lr-raw">{s.result}</q></Row>
                  </dl>
                )}
              </section>

              <section className="u-card lr-sp-card">
                <h2><MapPin size={16} />Sample Information</h2>
                <dl className="cd-facts lr-sp-facts">
                  <Row label="Sample No."><span className="a-mono">{s.sampleNo}</span></Row>
                  <Row label="Sample Type">{s.sampleType ?? 'Bulk Material Sample'}</Row>
                  <Row label="School">{s.site}</Row>
                  {fromInspection && <Row label="Building">{s.building}</Row>}
                  <Row label="Room">{s.room && `${s.room}${s.roomName ? ` – ${s.roomName}` : ''}`}</Row>
                  {!fromInspection && <Row label="Homog. Area">{s.homogeneousArea}</Row>}
                  <div className="cd-row lr-sp-span"><dt>Description</dt><dd>{s.description || <span className="u-muted">Not recorded</span>}</dd></div>
                </dl>
              </section>
            </div>

            <aside className="lr-sp-side">
              {fromInspection ? (
                <section className="u-card lr-sp-card">
                  <h2><ClipboardCheck size={16} />From Inspection</h2>
                  <dl className="cd-facts">
                    <Row label="Inspection"><Link to={`/inspections/records/${s.inspectionId}?tab=lab`} className="sv-id">{s.inspectionId}</Link></Row>
                    <Row label="Type">{s.inspectionType}</Row>
                    <Row label="Inspector">{s.inspectorName}</Row>
                    <Row label="Collected">{day(s.collectionDate)}</Row>
                    <Row label="Sent to Lab">{s.sentToLabAt && `${fmtDateTime(s.sentToLabAt)}${s.sentToLabBy ? ` by ${s.sentToLabBy}` : ''}`}</Row>
                    {s.notes && <Row label="Notes">{s.notes}</Row>}
                  </dl>
                </section>
              ) : (
                <section className="u-card lr-sp-card">
                  <h2><FileSpreadsheet size={16} />Source</h2>
                  <dl className="cd-facts">
                    <Row label="File">{s.sourceFile}</Row>
                    <Row label="Worksheet">{s.worksheet}</Row>
                    <Row label="Row">{Number(s.id).toLocaleString('en-US')}</Row>
                  </dl>
                </section>
              )}

              <section className="u-card lr-sp-card">
                <h2><MapPin size={16} />{s.site}</h2>
                <p className="lr-sp-note">
                  {s.siteSummary.detected.toLocaleString('en-US')} of {s.siteSummary.total.toLocaleString('en-US')} samples at this site had asbestos detected.
                </p>
                <Link className="lr-link" to={`/sampling?site=${encodeURIComponent(s.site)}`}>Show all {s.site} samples →</Link>
              </section>

              {s.sameNumber.length > 0 && (
                <section className="u-card lr-sp-card">
                  <h2><Copy size={16} />Same Sample No. ({s.sameNumber.length})</h2>
                  <ul className="lr-same">
                    {s.sameNumber.map((x) => (
                      <li key={x.id}>
                        <Link to={samplePath(x.id)}>
                          <span>{x.site} · {x.description || '—'}</span>
                          <ResultChip resultClass={x.resultClass} label={x.resultLabel} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>        </>
      )}

      {entering && s && (
        <SampleResultDialog inspectionId={s.inspectionId} materialId={s.materialId} onClose={() => setEntering(false)}
          onSaved={(text, warn) => { setEntering(false); setToast({ kind: warn ? 'error' : 'success', text }); setRefreshKey((k) => k + 1) }} />
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
