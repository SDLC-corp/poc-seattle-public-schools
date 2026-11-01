import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, ChevronRight as Arrow } from 'lucide-react'
import { request } from '../../lib/api'
import { isoDay, fmtLongDay } from './complianceUtils'

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DOT_ORDER = ['overdue', 'dueSoon', 'scheduled', 'completed']
const STATUS_TEXT = { overdue: 'Overdue', dueSoon: 'Upcoming', scheduled: 'Scheduled', completed: 'Completed' }

// Month calendar of inspections. Clicking a day lists its events; clicking an event opens it.
export default function ComplianceCalendar({ refreshKey, selectedInspectionId, onSelectInspection }) {
  const [today] = useState(() => isoDay(new Date()))
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selectedDay, setSelectedDay] = useState(today)
  const [events, setEvents] = useState([])

  const first = isoDay(month)
  const last = isoDay(new Date(month.getFullYear(), month.getMonth() + 1, 0))

  useEffect(() => {
    let cancelled = false
    request(`/compliance/inspections?from=${first}&to=${last}`)
      .then((d) => { if (!cancelled) setEvents(d.inspections) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [first, last, refreshKey])

  const byDay = useMemo(() => {
    const m = {}
    for (const e of events) (m[e.scheduledDate] ??= []).push(e)
    return m
  }, [events])

  const cells = useMemo(() => {
    const lead = month.getDay()
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => isoDay(new Date(month.getFullYear(), month.getMonth(), i + 1))),
    ]
  }, [month])

  const shiftMonth = (delta) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1)
    setMonth(next)
    setSelectedDay(isoDay(next.getMonth() === new Date().getMonth() && next.getFullYear() === new Date().getFullYear() ? new Date() : next))
  }
  const dayEvents = (byDay[selectedDay] ?? []).slice().sort((a, b) => DOT_ORDER.indexOf(a.status) - DOT_ORDER.indexOf(b.status))

  return (
    <section className="u-card c-cal">
      <header className="c-cal-head">
        <button type="button" className="u-row-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
        <h2>{month.toLocaleDateString('en-US', { month: 'long' })}<small>{month.getFullYear()}</small></h2>
        <button type="button" className="u-row-btn" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={15} /></button>
        <button type="button" className="c-today" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDay(today) }}>
          Today
        </button>
      </header>

      {/* Key for the dots, shown above the grid so it's read first */}
      <ul className="c-legend" aria-label="Dot colours">
        <li><i className="c-dot c-dot-completed" />Completed</li>
        <li><i className="c-dot c-dot-scheduled" />Scheduled</li>
        <li><i className="c-dot c-dot-dueSoon" />Due Soon</li>
        <li><i className="c-dot c-dot-overdue" />Overdue</li>
      </ul>

      <div className="c-grid" role="grid" aria-label="Inspection calendar">
        {WEEKDAYS.map((w, i) => <span key={w} className={`c-wd${i === 0 ? ' sun' : ''}`}>{w}</span>)}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`blank${i}`} />
          const evs = byDay[iso] ?? []
          const statuses = DOT_ORDER.filter((s) => evs.some((e) => e.status === s))
          const weekend = [0, 6].includes(new Date(`${iso}T00:00:00`).getDay())
          return (
            <button key={iso} type="button" role="gridcell"
              className={`c-day${weekend ? ' weekend' : ''}${iso === today ? ' today' : ''}${iso === selectedDay ? ' selected' : ''}`}
              aria-label={`${fmtLongDay(iso)}: ${evs.length} inspection${evs.length === 1 ? '' : 's'}`}
              aria-selected={iso === selectedDay}
              onClick={() => { setSelectedDay(iso); if (evs.length === 1) onSelectInspection(evs[0].id) }}>
              <span>{Number(iso.slice(8))}</span>
              {statuses.length > 0 && (
                <span className="c-dots">
                  {statuses.slice(0, 3).map((s) => <i key={s} className={`c-dot c-dot-${s}`} />)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="c-events">
        <h3><CalendarDays size={14} />Events on {fmtLongDay(selectedDay)} ({dayEvents.length})</h3>
        {dayEvents.length === 0 && <p className="u-muted u-small">No inspections on this day.</p>}
        <ul>
          {dayEvents.map((e) => (
            <li key={e.id}>
              <button type="button" className={`c-event c-ev-${e.status}${e.id === selectedInspectionId ? ' active' : ''}`} onClick={() => onSelectInspection(e.id)}>
                {/* Status as text (not just the coloured edge) so it reads without colour */}
                <span className="c-ev-text">
                  <strong>{e.schoolName}</strong>
                  <small>{e.type} · <span className={`c-ev-status c-evs-${e.status}`}>{STATUS_TEXT[e.status]}</span></small>
                </span>
                <Arrow size={14} className="c-ev-arrow" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
