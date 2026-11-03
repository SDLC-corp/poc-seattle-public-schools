import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, CalendarPlus, ExternalLink, MapPin, RefreshCw, Check, ClipboardCheck } from 'lucide-react'
import { useGraph } from '../../auth/useGraph'
import { graphTime } from '../../auth/graph'
import { request, fmtDate } from '../../lib/api'
import ConnectGate from './ConnectGate'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const pad = (n) => String(n).padStart(2, '0')
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const timeLabel = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const blank = () => ({ subject: '', date: isoDay(new Date()), start: '09:00', end: '10:00', location: '', attendees: '', notes: '' })

export default function CalendarTab({ onToast }) {
  const g = useGraph('outlook')
  const { call } = g
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const [form, setForm] = useState(blank)
  const [formErr, setFormErr] = useState({})
  const [saving, setSaving] = useState(false)
  const [inspections, setInspections] = useState(null)
  const [added, setAdded] = useState(() => new Set())

  useEffect(() => {
    if (g.status !== 'connected') return undefined
    let cancelled = false
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 30 * 86400000)
    call(`/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,webLink,isAllDay,organizer`)
      .then((d) => { if (!cancelled) { setEvents(d.value); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [g.status, call, reload])

  useEffect(() => {
    request('/inspection-records?status=scheduled&sort=date&dir=asc&pageSize=15').then((d) => setInspections(d.records)).catch(() => setInspections([]))
  }, [])

  const create = async (event, transactionId) => call('/me/events', { method: 'POST', body: { ...event, ...(transactionId ? { transactionId } : {}) } })

  const save = async () => {
    const errs = {}
    if (!form.subject.trim()) errs.subject = 'Add a title'
    if (!form.date) errs.date = 'Pick a date'
    if (form.end <= form.start) errs.end = 'End must be after start'
    const attendees = form.attendees.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    if (attendees.some((a) => !EMAIL.test(a))) errs.attendees = 'Check the email addresses'
    if (Object.keys(errs).length) { setFormErr(errs); return }
    setSaving(true)
    try {
      await create({
        subject: form.subject.trim(),
        start: { dateTime: `${form.date}T${form.start}:00`, timeZone: TZ },
        end: { dateTime: `${form.date}T${form.end}:00`, timeZone: TZ },
        location: form.location ? { displayName: form.location } : undefined,
        body: { contentType: 'Text', content: form.notes },
        attendees: attendees.map((address) => ({ emailAddress: { address }, type: 'required' })),
      })
      onToast({ kind: 'success', text: `Added “${form.subject.trim()}” to your calendar${attendees.length ? ' and sent invitations' : ''}` })
      setForm(blank())
      setReload((n) => n + 1)
    } catch (e) {
      setFormErr({ form: e.message })
    } finally {
      setSaving(false)
    }
  }

  // A scheduled inspection becomes a 2-hour event; transactionId stops a double click creating it twice
  const addInspection = async (r) => {
    try {
      await create({
        subject: `Asbestos ${r.type} – ${r.schoolName}`,
        start: { dateTime: `${r.scheduledDate}T09:00:00`, timeZone: TZ },
        end: { dateTime: `${r.scheduledDate}T11:00:00`, timeZone: TZ },
        location: { displayName: `${r.schoolName}, ${r.buildingName}, ${r.floorName}, Room ${r.roomNumber}` },
        body: {
          contentType: 'Text',
          content: `${r.type} of ${r.materialName} (${r.id}).\nAssigned to: ${r.assignedTo ?? '—'}\nOpen the inspection: ${window.location.origin}/inspections/records/${r.id}`,
        },
        categories: ['Asbestos Inspection'],
      }, `sps-inspection-${r.id}`)
      setAdded((s) => new Set(s).add(r.id))
      onToast({ kind: 'success', text: `${r.id} added to your Outlook calendar` })
      setReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setFormErr((x) => ({ ...x, [k]: undefined })) }

  // Group upcoming events by day
  const days = []
  for (const ev of events ?? []) {
    const start = graphTime(ev.start)
    const key = ev.isAllDay ? ev.start.dateTime.slice(0, 10) : isoDay(start)
    if (days.at(-1)?.key !== key) days.push({ key, date: ev.isAllDay ? new Date(`${key}T00:00:00`) : start, items: [] })
    days.at(-1).items.push({ ...ev, startAt: start, endAt: graphTime(ev.end) })
  }

  return (
    <ConnectGate g={g} name="Outlook" what="See your upcoming events and add scheduled inspections to your Outlook calendar.">
      <div className="m365-cal">
        <section className="u-card">
          <header className="m365-pane-head">
            <h3><CalendarDays size={16} />Next 30 Days</h3>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setReload((n) => n + 1)}><RefreshCw size={13} />Refresh</button>
          </header>
          {error && <div className="u-banner">Couldn't load your calendar ({error}).</div>}
          {!events && !error && <p className="u-muted sv-empty-line">Loading…</p>}
          {events && !events.length && <p className="u-muted sv-empty-line">Nothing on your calendar in the next 30 days.</p>}
          <div className="m365-agenda">
            {days.map((d) => (
              <div key={d.key} className="m365-day">
                <h4>{dayLabel(d.date)}</h4>
                <ul>
                  {d.items.map((ev) => (
                    <li key={ev.id}>
                      <span className="m365-time">{ev.isAllDay ? 'All day' : `${timeLabel(ev.startAt)} – ${timeLabel(ev.endAt)}`}</span>
                      <span className="m365-ev">
                        <strong>{ev.subject || '(no title)'}</strong>
                        {ev.location?.displayName && <small><MapPin size={11} />{ev.location.displayName}</small>}
                      </span>
                      <a href={ev.webLink} target="_blank" rel="noreferrer" className="u-row-btn" aria-label={`Open ${ev.subject} in Outlook`}><ExternalLink size={13} /></a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="m365-cal-side">
          <section className="u-card">
            <h3 className="m365-side-title"><ClipboardCheck size={16} />Scheduled Inspections</h3>
            {!inspections && <p className="u-muted sv-empty-line">Loading…</p>}
            {inspections && !inspections.length && <p className="u-muted sv-empty-line">No scheduled inspections.</p>}
            <ul className="m365-insp">
              {inspections?.map((r) => (
                <li key={r.id}>
                  <div>
                    <Link to={`/inspections/records/${r.id}`} className="sv-id">{r.id}</Link>
                    <strong>{fmtDate(`${r.scheduledDate}T00:00:00`)} · {r.type}</strong>
                    <small>{r.schoolName} · {r.roomNumber} {r.roomName}{r.assignedTo ? ` · ${r.assignedTo}` : ''}</small>
                  </div>
                  {added.has(r.id)
                    ? <span className="m365-added"><Check size={13} />Added</span>
                    : <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => addInspection(r)}><CalendarPlus size={13} />Add to Outlook</button>}
                </li>
              ))}
            </ul>
          </section>

          <section className="u-card m365-new-event">
            <h3 className="m365-side-title"><CalendarPlus size={16} />New Event</h3>
            <label className="uf-field"><span>Title</span><input className={`u-input${formErr.subject ? ' invalid' : ''}`} value={form.subject} onChange={set('subject')} maxLength={255} />{formErr.subject && <em className="uf-error">{formErr.subject}</em>}</label>
            <div className="m365-row3">
              <label className="uf-field"><span>Date</span><input type="date" className="u-input" value={form.date} onChange={set('date')} /></label>
              <label className="uf-field"><span>Start</span><input type="time" className="u-input" value={form.start} onChange={set('start')} /></label>
              <label className="uf-field"><span>End</span><input type="time" className={`u-input${formErr.end ? ' invalid' : ''}`} value={form.end} onChange={set('end')} /></label>
            </div>
            {formErr.end && <em className="uf-error">{formErr.end}</em>}
            <label className="uf-field"><span>Location</span><input className="u-input" value={form.location} onChange={set('location')} /></label>
            <label className="uf-field"><span>Invite (emails)</span><input className={`u-input${formErr.attendees ? ' invalid' : ''}`} value={form.attendees} onChange={set('attendees')} placeholder="Optional; invitations are sent" />{formErr.attendees && <em className="uf-error">{formErr.attendees}</em>}</label>
            <label className="uf-field"><span>Notes</span><textarea className="u-input sv-textarea" rows={2} value={form.notes} onChange={set('notes')} /></label>
            {formErr.form && <p className="uf-error">{formErr.form}</p>}
            <button type="button" className="u-btn u-btn-primary" onClick={save} disabled={saving}><CalendarPlus size={14} />{saving ? 'Adding…' : 'Add to Calendar'}</button>
            <small className="u-muted">Times are in {TZ}.</small>
          </section>
        </div>
      </div>
    </ConnectGate>
  )
}
