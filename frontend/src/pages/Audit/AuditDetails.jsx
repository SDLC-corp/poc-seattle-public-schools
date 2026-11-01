import { Link } from 'react-router'
import { X, UsersRound, FileText, Link2, ExternalLink, Info } from 'lucide-react'
import { ActionBadge } from './ActionBadge'
import { initials, fmtDateTime } from '../../lib/api'

const humanize = (field) => field
  .split('.').pop()
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/^./, (c) => c.toUpperCase())

function Row({ label, children }) {
  return (
    <div className="ad-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Changes({ entry }) {
  if (!entry.changes.length) return <p className="u-muted ad-none">No field changes recorded for this activity.</p>
  const isCreate = entry.action === 'create'
  const isDelete = entry.action === 'delete'
  return (
    <div className={`ad-changes ${isCreate ? 'created' : isDelete ? 'deleted' : 'updated'}`}>
      <strong>{isCreate ? 'New record created' : isDelete ? 'Record deleted' : `${entry.changes.length} field${entry.changes.length > 1 ? 's' : ''} changed`}</strong>
      <dl>
        {entry.changes.map((c) => (
          <div key={c.field} className="ad-change">
            <dt title={c.field}>{humanize(c.field)}</dt>
            <dd>
              {c.from !== undefined && !isDelete && <><del>{c.from}</del><span aria-hidden="true"> → </span></>}
              <span>{isDelete && c.from !== undefined ? c.from : c.to}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function AuditDetails({ entry, onClose }) {
  const related = entry.related ?? {}
  const hasRelated = Object.values(related).some(Boolean)
  return (
    <aside className="u-card a-details" aria-label="Audit log details">
      <header className="u-card-head">
        <h2>Audit Log Details</h2>
        <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </header>

      <section className="ad-section">
        <h3><UsersRound size={16} />Activity Information</h3>
        <dl>
          <Row label="Action"><ActionBadge action={entry.action} /></Row>
          <Row label="Date & Time">{fmtDateTime(entry.at)}</Row>
          <Row label="User">
            <span className="ad-user">
              <span className="u-avatar">{initials(entry.user.name)}</span>
              <span>
                {entry.user.name}
                <small>{entry.user.email}</small>
              </span>
            </span>
          </Row>
          <Row label="IP Address"><span className="a-mono">{entry.ip}</span></Row>
          <Row label="Module">{entry.module}</Row>
          <Row label="Record ID"><span className="a-mono">{entry.recordId}</span></Row>
          <Row label="Log ID"><span className="a-mono">{entry.id}</span></Row>
        </dl>
        {entry.source === 'sample' && (
          <p className="ad-sample"><Info size={13} />Sample data generated for this demo</p>
        )}
      </section>

      <section className="ad-section">
        <h3><FileText size={16} />Activity Details</h3>
        <dl>
          <Row label="Description">{entry.summary}</Row>
        </dl>
        <Changes entry={entry} />
      </section>

      {hasRelated && (
        <section className="ad-section">
          <h3><Link2 size={16} />Related Information</h3>
          <dl>
            {related.school && <Row label="School">{related.school}</Row>}
            {related.building && <Row label="Building">{related.building}</Row>}
            {related.room && <Row label="Room">{related.room}</Row>}
          </dl>
        </section>
      )}

      {entry.link && (
        <Link to={entry.link} className="u-btn u-btn-outline ad-view">
          View Record <ExternalLink size={14} />
        </Link>
      )}
    </aside>
  )
}
