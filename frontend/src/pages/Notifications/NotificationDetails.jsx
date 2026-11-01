import { Link } from 'react-router'
import { X, School, Building2, DoorOpen, CalendarDays, Clock, Check, MailOpen, ExternalLink, Info } from 'lucide-react'
import { NotificationIcon, PriorityBadge, TypeBadge } from './notifMeta'
import { fmtDate, fmtDateTime } from '../../lib/api'

function Row({ icon: Icon, label, children }) {
  return (
    <div className="nd-row">
      <dt><Icon size={15} />{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// `now` comes from the page so "Past due" is stable across renders
export default function NotificationDetails({ n, now, onClose, onToggleRead }) {
  if (!n) return <aside className="u-card n-details n-details-empty">Select a notification to see its details.</aside>
  const overdue = n.dueDate && Date.parse(n.dueDate) < now
  return (
    <aside className="u-card n-details" aria-label="Notification details">
      <header className="u-card-head">
        <h2>Notification Details</h2>
        <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </header>

      <div className="nd-title">
        <NotificationIcon n={n} size={17} />
        <strong>{n.title}</strong>
        <PriorityBadge priority={n.priority} />
      </div>
      <p className="nd-message">{n.message}</p>

      <dl className="nd-facts">
        <Row icon={School} label="School">{n.schoolName ?? 'All Schools'}</Row>
        {n.buildingName && <Row icon={Building2} label="Building">{n.buildingName}</Row>}
        {n.rooms && <Row icon={DoorOpen} label="Room(s)">{n.rooms}</Row>}
        {n.dueDate && (
          <Row icon={CalendarDays} label="Due Date">
            {fmtDate(n.dueDate)}{overdue && <span className="nd-overdue">Past due</span>}
          </Row>
        )}
        <Row icon={Clock} label="Created On">{fmtDateTime(n.createdAt)}</Row>
        <Row icon={Info} label="Type"><TypeBadge type={n.type} /></Row>
      </dl>

      <section className="nd-desc">
        <h3>Description</h3>
        <p>{n.description}</p>
      </section>
      {n.sample && <p className="ad-sample"><Info size={13} />Sample notification generated for this demo</p>}

      <div className="nd-actions">
        <button type="button" className={`u-btn ${n.read ? 'u-btn-outline' : 'u-btn-primary'}`} onClick={() => onToggleRead(n)}>
          {n.read ? <><MailOpen size={15} />Mark as Unread</> : <><Check size={15} />Mark as Read</>}
        </button>
        {n.link && (
          <Link className="u-btn u-btn-outline" to={n.link}>
            {n.linkLabel ?? 'View'}
          </Link>
        )}
      </div>
      {['inspection', 'compliance', 'acm'].includes(n.type) && (
        <Link className="nd-secondary" to="/response-actions">Create Response Action <ExternalLink size={13} /></Link>
      )}
    </aside>
  )
}
