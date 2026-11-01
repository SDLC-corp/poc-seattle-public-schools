import { Pencil, X, Info, TriangleAlert, ImageOff } from 'lucide-react'
import { Link } from 'react-router'
import { AirStatusBadge } from './airMeta'
import { fmtDateTime } from '../../lib/api'

function Row({ label, children }) {
  return (
    <div className="cd-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function AirDetails({ event: e, onEdit, onClose }) {
  if (!e) return <aside className="u-card air-details"><p className="c-details-empty">Select a monitoring event to see its details.</p></aside>
  const result = e.result === null ? 'Pending' : `${e.result} ${e.limit.unit}`
  const ratio = e.result !== null ? e.result / e.limit.value : null
  return (
    <aside className="u-card air-details" aria-label="Monitoring event details">
      <header className="u-card-head">
        <h2>Monitoring Event Details</h2>
        <span className="ud-head-actions">
          <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={onEdit}><Pencil size={13} />{e.result === null ? 'Enter Result' : 'Edit'}</button>
          <button type="button" className="u-row-btn ud-close" onClick={onClose} aria-label="Close details"><X size={15} /></button>
        </span>
      </header>

      <AirStatusBadge status={e.status} />
      {e.status === 'exceedance' && (
        <p className="air-alert">
          <TriangleAlert size={14} />
          {ratio.toFixed(1)}× the {e.limit.basis.toLowerCase()} limit. Review containment and re-sample before re-occupancy.
        </p>
      )}

      <dl className="cd-facts">
        <Row label="Event ID"><span className="a-mono">{e.id}</span></Row>
        <Row label="Date & Time">{fmtDateTime(e.sampledAt)}</Row>
        <Row label="School">{e.schoolName}</Row>
        <Row label="Building">{e.buildingName}</Row>
        <Row label="Location / Room">{e.location}</Row>
        <Row label="Monitoring Type">{e.type}</Row>
        <Row label="Method">{e.method === 'PCM' ? 'PCM (NIOSH 7400)' : 'TEM (AHERA)'}</Row>
        <Row label={`Result (${e.limit.unit})`}><strong>{result}</strong></Row>
        <Row label="Limit">{e.limit.value} {e.limit.unit}<small className="air-basis">{e.limit.basis}</small></Row>
        <Row label="Sample Duration">{e.durationMin} minutes</Row>
        <Row label="Contractor">{e.contractorName || '—'}</Row>
        <Row label="Inspector">{e.inspectorName || '—'}</Row>
        <Row label="Project">{e.project || '—'}</Row>
        <Row label="Notes">{e.notes || '—'}</Row>
      </dl>
      {e.sample && <p className="ad-sample"><Info size={13} />Sample record generated for this demo</p>}

      <section className="air-attach">
        <h3>Photos &amp; Lab Report</h3>
        <p className="u-muted u-small"><ImageOff size={14} />No files attached. Upload site photos and the lab report in{' '}
          <Link to="/documents/other">Document Management</Link> (type: Air Monitoring).</p>
      </section>
    </aside>
  )
}
