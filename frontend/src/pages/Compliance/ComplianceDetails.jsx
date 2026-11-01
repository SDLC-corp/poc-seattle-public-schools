import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  X, CalendarDays, Map as MapIcon, Layers, CalendarClock, CircleCheck, School, ChevronRight, Info,
} from 'lucide-react'
import { InspectionStatusBadge, SchoolStatusBadge } from './complianceMeta'
import { request, fmtDate } from '../../lib/api'
import { fmtDay, isoDay } from './complianceUtils'

function Row({ label, children }) {
  return (
    <div className="cd-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function InspectionView({ inspection: i, onChanged, notify, onOpenSchool }) {
  const [reschedule, setReschedule] = useState(false)
  const [date, setDate] = useState(i.scheduledDate)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [minDate] = useState(() => isoDay(new Date())) // reschedule can't go into the past
  const open = !i.completedAt

  useEffect(() => {
    if (!confirmComplete) return
    const t = setTimeout(() => setConfirmComplete(false), 4000)
    return () => clearTimeout(t)
  }, [confirmComplete])

  const run = async (path, body, success) => {
    setBusy(true)
    setError(null)
    try {
      const r = await request(`/compliance/inspections/${i.id}/${path}`, { method: 'POST', body })
      notify('success', success(r))
      setReschedule(false)
      onChanged()
    } catch (err) {
      setError(err.fields?.date ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="cd-title">
        <span className="cd-icon"><CalendarDays size={16} /></span>
        <button type="button" className="cd-school-link" onClick={() => onOpenSchool(i.schoolId)} title="Show school compliance">
          {i.schoolName}
        </button>
        <InspectionStatusBadge status={i.status} />
      </div>
      <dl className="cd-facts">
        <Row label="Inspection Type">{i.type}</Row>
        <Row label="School">{i.schoolName}</Row>
        <Row label="Building">{i.buildingName}</Row>
        <Row label="Floor">{i.floor}</Row>
        <Row label="Rooms">{i.rooms}</Row>
        <Row label="Assigned Inspector">{i.inspectorName}</Row>
        <Row label={i.completedAt ? 'Scheduled For' : 'Due Date'}>{fmtDay(i.scheduledDate)}</Row>
        {i.completedAt && <Row label="Completed On">{fmtDate(i.completedAt)}</Row>}
        <Row label="Priority"><span className={`n-priority ${i.priority}`}>{i.priority[0].toUpperCase() + i.priority.slice(1)}</span></Row>
        <Row label="Inspection ID"><span className="a-mono">{i.id}</span></Row>
      </dl>
      {i.sample && <p className="ad-sample"><Info size={13} />Sample schedule generated for this demo</p>}

      <h3 className="cd-h">Actions</h3>
      <div className="cd-actions">
        <Link className="u-btn u-btn-primary" to={open ? '/inspections/upcoming' : '/inspections/history'}><CalendarDays size={15} />View Inspection</Link>
        <Link className="u-btn u-btn-outline" to="/schools/rooms"><MapIcon size={15} />View Floor Plan</Link>
        <Link className="u-btn u-btn-outline" to="/acm/locations"><Layers size={15} />View ACM Records</Link>
        {open && (reschedule ? (
          <div className="cd-reschedule">
            <input type="date" className="u-input" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} aria-label="New inspection date" />
            <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={busy || !date}
              onClick={() => run('reschedule', { date }, () => `Rescheduled to ${fmtDay(date)}.`)}>Save</button>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { setReschedule(false); setDate(i.scheduledDate); setError(null) }}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="u-btn u-btn-outline" onClick={() => setReschedule(true)}><CalendarClock size={15} />Reschedule Inspection</button>
        ))}
        {open && (
          <button type="button" className={`u-btn ${confirmComplete ? 'c-btn-success-solid' : 'c-btn-success'}`} disabled={busy}
            onClick={() => (confirmComplete
              ? run('complete', {}, (r) => (r.next ? `Completed. Next surveillance booked for ${fmtDay(r.next.scheduledDate)}.` : 'Inspection marked as completed.'))
              : setConfirmComplete(true))}>
            <CircleCheck size={15} />{confirmComplete ? 'Click again to confirm' : 'Mark as Completed'}
          </button>
        )}
      </div>
      {error && <p className="uf-error">{error}</p>}
    </>
  )
}

function SchoolView({ school: s, onSelectInspection }) {
  const open = s.inspections.filter((i) => !i.completedAt).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
  const done = s.inspections.filter((i) => i.completedAt)
  return (
    <>
      <div className="cd-title">
        <span className="cd-icon"><School size={16} /></span>
        <strong>{s.name}</strong>
        <SchoolStatusBadge status={s.status} />
      </div>
      <dl className="cd-facts">
        <Row label="School Type">{s.type}</Row>
        <Row label="Buildings">{s.buildings}</Row>
        <Row label="ACM Locations">{s.acmLocations} <small className="u-muted">(sample)</small></Row>
        <Row label="Last Inspection">{fmtDate(s.lastInspection)}</Row>
        <Row label="Next Due">{fmtDay(s.nextDue)}</Row>
        <Row label="Completed">{done.length} inspection{done.length === 1 ? '' : 's'} on record</Row>
      </dl>

      <h3 className="cd-h">Open Inspections ({open.length})</h3>
      {open.length === 0 && <p className="u-muted u-small">Nothing scheduled.</p>}
      <ul className="cd-list">
        {open.map((i) => (
          <li key={i.id}>
            <button type="button" className={`c-event c-ev-${i.status}`} onClick={() => onSelectInspection(i.id)}>
              <span className="c-ev-text"><strong>{i.type}</strong><small>{fmtDay(i.scheduledDate)} · {i.buildingName}</small></span>
              <InspectionStatusBadge status={i.status} />
              <ChevronRight size={14} className="c-ev-arrow" />
            </button>
          </li>
        ))}
      </ul>
      <div className="cd-actions">
        <Link className="u-btn u-btn-outline" to="/acm/locations"><Layers size={15} />View ACM Records</Link>
        <Link className="u-btn u-btn-outline" to="/schools/rooms"><MapIcon size={15} />View Floor Plans</Link>
      </div>
    </>
  )
}

// Right-hand panel: shows whichever was clicked last — an inspection (calendar/events) or a school (table/map)
export default function ComplianceDetails({ selection, refreshKey, onClose, onSelect, onChanged, notify }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!selection) return
    let cancelled = false
    const path = selection.kind === 'inspection'
      ? `/compliance/inspections/${selection.id}`
      : `/compliance/schools/${selection.id}`
    request(path).then((d) => { if (!cancelled) setData({ key: `${selection.kind}:${selection.id}`, d }) }).catch(() => {})
    return () => { cancelled = true }
  }, [selection, refreshKey])

  const current = selection && data?.key === `${selection.kind}:${selection.id}` ? data.d : null

  return (
    <aside className="u-card c-details" aria-label="Details">
      <header className="u-card-head">
        <h2>{selection?.kind === 'school' ? 'School Compliance' : 'Inspection Details'}</h2>
        {selection && <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>}
      </header>
      {!selection && <p className="c-details-empty">Click a calendar event, a school in the table, or a school on the map to see its details here.</p>}
      {selection && !current && <p className="c-details-empty">Loading…</p>}
      {current && selection.kind === 'inspection' && (
        <InspectionView key={current.id + current.scheduledDate + current.status} inspection={current}
          onChanged={onChanged} notify={notify} onOpenSchool={(id) => onSelect({ kind: 'school', id })} />
      )}
      {current && selection.kind === 'school' && (
        <SchoolView school={current} onSelectInspection={(id) => onSelect({ kind: 'inspection', id })} />
      )}
    </aside>
  )
}
