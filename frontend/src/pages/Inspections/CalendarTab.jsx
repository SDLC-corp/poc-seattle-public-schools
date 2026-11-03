import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import { fmtDay, isoToday } from '../Surveillance/survMeta'
import { STATUS_TONE } from './inspMeta'
import { request } from '../../lib/api'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const LEGEND = [['scheduled', 'Scheduled'], ['inProgress', 'In Progress'], ['pendingReview', 'Pending Review'], ['actionRequired', 'Action Required'], ['completed', 'Completed']]
const MAX_CHIPS = 3

// Month view: inspections on their inspection date (or scheduled date if not started). Pick a day for the full list.
export default function CalendarTab() {
  const today = isoToday()
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [day, setDay] = useState(today)
  const [data, setData] = useState({ key: '', items: [] })

  const from = iso(month)
  const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  useEffect(() => {
    let cancelled = false
    request(`/inspection-records/calendar?from=${from}&to=${to}`).then((d) => { if (!cancelled) setData({ key: from, items: d.items }) }).catch(() => {})
    return () => { cancelled = true }
  }, [from, to])

  const byDay = useMemo(() => {
    const m = {}
    for (const e of data.key === from ? data.items : []) (m[e.date] ??= []).push(e)
    return m
  }, [data, from])

  const cells = [
    ...Array.from({ length: month.getDay() }, () => null),
    ...Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ]
  const shift = (n) => { const m = new Date(month.getFullYear(), month.getMonth() + n, 1); setMonth(m); setDay(n === 0 ? today : iso(m)) }
  const dayItems = byDay[day] ?? []
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="in-cal-layout">
      <section className="u-card in-cal">
        <header className="in-cal-head">
          <div className="in-cal-nav">
            <button type="button" className="u-row-btn" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <h2>{label}</h2>
            <button type="button" className="u-row-btn" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setDay(today) }}>Today</button>
          </div>
          <ul className="ai-legend">
            {LEGEND.map(([k, l]) => <li key={k}><i className={`tone-${STATUS_TONE[k]}`} />{l}</li>)}
          </ul>
        </header>
        <div className="in-cal-grid" role="grid" aria-label={`Inspections in ${label}`}>
          {WEEKDAYS.map((w) => <div key={w} className="in-cal-wd" role="columnheader">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} className="in-cal-cell blank" />
            const items = byDay[d] ?? []
            return (
              <button key={d} type="button" role="gridcell" aria-selected={d === day}
                className={`in-cal-cell${d === day ? ' selected' : ''}${d === today ? ' today' : ''}`} onClick={() => setDay(d)}
                aria-label={`${fmtDay(d)}: ${items.length} inspection${items.length === 1 ? '' : 's'}`}>
                <span className="in-cal-date">{Number(d.slice(8))}</span>
                {items.slice(0, MAX_CHIPS).map((e) => (
                  <span key={e.id} className={`in-cal-chip tone-${STATUS_TONE[e.status]}`} title={`${e.id} · ${e.type} · ${e.schoolName}`}>{e.schoolName}</span>
                ))}
                {items.length > MAX_CHIPS && <span className="in-cal-more">+{items.length - MAX_CHIPS} more</span>}
              </button>
            )
          })}
        </div>
      </section>

      <aside className="u-card sv-side-card in-cal-day">
        <h3>{fmtDay(day)}</h3>
        {!dayItems.length && <p className="u-muted sv-empty-line">No inspections on this day.</p>}
        <ul>
          {dayItems.map((e) => (
            <li key={e.id}>
              <div className="in-cal-day-top"><Link to={`/inspections/records/${e.id}`} className="sv-id">{e.id}</Link><Badge tone={STATUS_TONE[e.status]}>{e.statusText}</Badge></div>
              <strong>{e.type}</strong>
              <small>{e.schoolName} · {e.buildingName} · {e.roomNumber} {e.roomName}</small>
              <small>{e.materialName}{e.assignedTo ? ` · ${e.assignedTo}` : ''}</small>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
