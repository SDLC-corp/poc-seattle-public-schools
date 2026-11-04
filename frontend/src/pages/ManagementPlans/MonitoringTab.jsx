import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  CalendarDays, CalendarCheck, CalendarClock, Clock, RefreshCw, Plus, List, Eye, Pencil, Ellipsis, ExternalLink, CircleCheck,
  CircleAlert, Trash2, ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { useConfirm } from '../../components/ui/useConfirm'
import { fmtDay } from '../Surveillance/survMeta'
import { request } from '../../lib/api'
import { Tile } from './RegisterTab'

const STATUS = {
  overdue: { label: 'Overdue', tone: 'critical', icon: CircleAlert },
  dueSoon: { label: 'Due soon', tone: 'warning', icon: CalendarClock },
  completed: { label: 'Completed', tone: 'good', icon: CircleCheck },
  upcoming: { label: 'Upcoming', tone: 'primary', icon: CalendarDays },
  asRequired: { label: 'As required', tone: 'neutral' },
  notScheduled: { label: 'Not scheduled', tone: 'neutral' },
}
const KIND_LABEL = { surveillance: 'Surveillance', inspection: 'Inspection', reinspection: 'Re-inspection', plan: 'Plan review', air: 'Air monitoring', clearance: 'Clearance', custom: 'Other' }
const FREQS = [
  { value: 'once', label: 'One-off' }, { value: 'asRequired', label: 'As required' },
  ...[1, 3, 6, 12, 24, 36].map((m) => ({ value: String(m), label: `Every ${m} month${m === 1 ? '' : 's'}` })),
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (n) => String(n).padStart(2, '0')
const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

function StatusCell({ item }) {
  const s = STATUS[item.status] ?? STATUS.notScheduled
  const sub = item.status === 'completed' ? `on ${fmtDay(item.lastDone)}`
    : item.status === 'overdue' ? (item.detail ?? `Due on ${fmtDay(item.planned)}`)
      : item.detail ?? (item.lastDone ? `Last done ${fmtDay(item.lastDone)}` : null)
  return (
    <div className="ms-status">
      <Badge tone={s.tone}>{s.icon && <s.icon size={13} />}{s.label}</Badge>
      {sub && <small className={item.status === 'overdue' ? 'late' : undefined}>{sub}</small>}
    </div>
  )
}

function ItemMenu({ item, onEdit, onDone, onRemove }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const act = (fn) => () => { setOpen(false); fn() }
  return (
    <div className="ai-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${item.title}`} onClick={() => setOpen((o) => !o)}><Ellipsis size={16} /></button>
      {open && (
        <div className="ai-menu" role="menu">
          {item.custom ? (
            <>
              <button type="button" role="menuitem" onClick={act(onDone)}><CircleCheck size={14} />Record as done today</button>
              <button type="button" role="menuitem" onClick={act(onEdit)}><Pencil size={14} />Edit activity</button>
              <button type="button" role="menuitem" className="danger" onClick={act(onRemove)}><Trash2 size={14} />Remove activity</button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={act(onEdit)}><Pencil size={14} />Edit schedule</button>
              <button type="button" role="menuitem" onClick={act(() => navigate(item.link))}><ExternalLink size={14} />Open {item.module} records</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Standard activities: frequency (when it has one), wording and an optional planned date; dates otherwise
// come from the surveillance / inspection / plan records
function StandardDialog({ schoolId, item, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    title: item.title, description: item.description ?? '', scope: item.scope ?? '',
    months: item.months ? String(item.months) : '', planned: item.edited && item.planned !== item.defaults.planned ? item.planned : '',
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: typeof v === 'string' ? v : v.target.value }))
  const send = async (body) => {
    setBusy(true)
    setErrors({})
    try {
      await request(`/management-plans/${schoolId}/monitoring/${item.id}`, { method: 'PUT', body })
      onSaved()
    } catch (err) {
      setErrors({ ...(err.fields ?? {}), form: err.fields ? null : err.message })
      setBusy(false)
    }
  }
  const d = item.defaults
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal rl-dialog" role="dialog" aria-modal="true" aria-labelledby="ms-std-title">
        <header className="u-modal-head">
          <h2 id="ms-std-title">Edit {item.title}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          <label className="a-field"><span>Activity / Inspection</span><input value={f.title} maxLength={80} onChange={set('title')} placeholder={d.title} /></label>
          <label className="a-field"><span>Description</span><input value={f.description} maxLength={160} onChange={set('description')} placeholder={d.description} /></label>
          <div className="rl-grid">
            <label className="a-field"><span>Area / Scope</span><input value={f.scope} maxLength={80} onChange={set('scope')} placeholder={d.scope} /></label>
            <div className={`a-field${errors.months ? ' invalid' : ''}`}><span>Frequency</span>
              {d.months ? (
                <SearchSelect variant="field" label="Frequency" value={f.months} onChange={set('months')} searchable={false}
                  options={[1, 3, 6, 12, 24, 36].map((m) => ({ value: String(m), label: `${m % 12 === 0 ? `Every ${m / 12} year${m === 12 ? '' : 's'}` : `Every ${m} month${m === 1 ? '' : 's'}`}${m === d.months ? ' (standard)' : ''}` }))} />
              ) : <input value={item.frequency} disabled />}
              {errors.months && <em>{errors.months}</em>}
            </div>
            <label className={`a-field${errors.planned ? ' invalid' : ''}`}><span>Planned date</span>
              <input type="date" value={f.planned} onChange={set('planned')} />
              <small>{d.planned ? `Leave empty to use ${fmtDay(d.planned)}, worked out from the records` : 'Optional – set when the next one is booked'}</small>
              {errors.planned && <em>{errors.planned}</em>}
            </label>
            <div className="a-field"><span>Last done</span><input value={item.lastDone ? fmtDay(item.lastDone) : 'No record yet'} disabled /><small>From the {item.module} records</small></div>
          </div>
          {item.detail && <p className="ms-dialog-note">{item.detail}. Manage the individual records in <button type="button" className="ai-link" onClick={() => { onClose(); onSaved(item.link) }}>{item.module}</button>.</p>}
          {errors.form && <p className="u-banner">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          {item.edited && <button type="button" className="u-btn u-btn-ghost ms-reset" disabled={busy} onClick={() => send({ reset: true })}>Reset to standard</button>}
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={busy} onClick={() => send({ ...f, months: f.months || null, planned: f.planned || null })}>{busy ? 'Saving…' : 'Save Changes'}</button>
        </footer>
      </div>
    </div>
  )
}

function ScheduleDialog({ schoolId, item, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    title: item?.title ?? '', description: item?.description ?? '', scope: item?.scope ?? '',
    freq: item ? (item.months ? String(item.months) : item.repeat ?? 'asRequired') : '6',
    planned: item?.planned ?? '', lastDone: item?.lastDone ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: typeof v === 'string' ? v : v.target.value }))
  const save = async () => {
    setBusy(true)
    setErrors({})
    const months = Number(f.freq) || 0
    const body = { title: f.title, description: f.description, scope: f.scope, months, repeat: months ? 'every' : f.freq, planned: f.planned || null, lastDone: f.lastDone || null }
    try {
      await request(item ? `/management-plans/${schoolId}/monitoring/${item.id}` : `/management-plans/${schoolId}/monitoring`, { method: item ? 'PUT' : 'POST', body })
      onSaved()
    } catch (err) {
      setErrors({ ...(err.fields ?? {}), form: err.fields ? null : err.message })
      setBusy(false)
    }
  }
  const field = (key, label, input) => (
    <label className={`a-field${errors[key] ? ' invalid' : ''}`}><span>{label}</span>{input}{errors[key] && <em>{errors[key]}</em>}</label>
  )
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal rl-dialog" role="dialog" aria-modal="true" aria-labelledby="ms-dialog-title">
        <header className="u-modal-head">
          <h2 id="ms-dialog-title">{item ? `Edit ${item.title}` : 'Add Schedule'}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          {field('title', 'Activity / Inspection *', <input value={f.title} maxLength={80} onChange={set('title')} placeholder="e.g. Roof void condition check" />)}
          {field('description', 'Description', <input value={f.description} maxLength={160} onChange={set('description')} placeholder="e.g. Visual check of boiler room lagging" />)}
          <div className="rl-grid">
            {field('scope', 'Area / Scope', <input value={f.scope} maxLength={80} onChange={set('scope')} placeholder="e.g. Building B – Plant Room" />)}
            <div className={`a-field${errors.months ? ' invalid' : ''}`}><span>Frequency</span>
              <SearchSelect variant="field" label="Frequency" value={f.freq} onChange={set('freq')} searchable={false} options={FREQS} />
              {errors.months && <em>{errors.months}</em>}
            </div>
            {field('planned', `Planned date${f.freq === 'asRequired' ? '' : ' *'}`, <input type="date" value={f.planned} onChange={set('planned')} />)}
            {field('lastDone', 'Last done', <input type="date" value={f.lastDone} onChange={set('lastDone')} />)}
          </div>
          {errors.form && <p className="u-banner">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : item ? 'Save Changes' : 'Add Schedule'}</button>
        </footer>
      </div>
    </div>
  )
}

function Calendar({ events, today }) {
  const navigate = useNavigate()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const byDay = useMemo(() => {
    const map = new Map()
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date).push(e)
    }
    return map
  }, [events])
  const first = new Date(ym.y, ym.m, 1)
  const lead = (first.getDay() + 6) % 7 // Monday first
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => {
    const d = i - lead + 1
    return d >= 1 && d <= days ? `${ym.y}-${pad(ym.m + 1)}-${pad(d)}` : null
  })
  const shift = (n) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }))
  const monthEvents = events.filter((e) => e.date.startsWith(`${ym.y}-${pad(ym.m + 1)}`)).length
  return (
    <div className="ms-cal">
      <div className="ms-cal-head">
        <button type="button" className="u-btn u-btn-outline ms-cal-nav" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <strong>{monthLabel(ym.y, ym.m)}</strong>
        <button type="button" className="u-btn u-btn-outline ms-cal-nav" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
        <button type="button" className="u-btn u-btn-outline" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>Today</button>
        <span className="u-muted">{monthEvents} item{monthEvents === 1 ? '' : 's'} this month</span>
        <ul className="ms-cal-legend">{Object.entries(KIND_LABEL).map(([k, l]) => <li key={k}><span className={`k-${k}`} />{l}</li>)}</ul>
      </div>
      <div className="ms-cal-grid" role="grid" aria-label={monthLabel(ym.y, ym.m)}>
        {WEEKDAYS.map((d) => <div key={d} className="ms-cal-wd" role="columnheader">{d}</div>)}
        {cells.map((iso, i) => {
          const list = iso ? byDay.get(iso) ?? [] : []
          return (
            <div key={i} role="gridcell" className={`ms-cal-day${!iso ? ' empty' : ''}${iso === today ? ' today' : ''}`}>
              {iso && <span className="ms-cal-n">{Number(iso.slice(8))}</span>}
              {list.slice(0, 3).map((e, j) => (
                <button key={j} type="button" className={`ms-cal-ev k-${e.kind}${e.overdue ? ' late' : ''}${e.done ? ' done' : ''}`} title={`${e.title}${e.detail ? ` · ${e.detail}` : ''}${e.overdue ? ' · overdue' : ''}`}
                  onClick={() => navigate(e.link)}>{e.title}</button>
              ))}
              {list.length > 3 && <span className="ms-cal-more" title={list.slice(3).map((e) => e.title).join('\n')}>+{list.length - 3} more</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Management plan › Monitoring Schedule: inspections, condition checks and plan reviews
export default function MonitoringTab({ schoolId }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('list')
  const [dialog, setDialog] = useState(null) // { item } (null item = add)
  const [notice, setNotice] = useState(null)
  const [confirm, confirmDialog] = useConfirm()

  const load = () => request(`/management-plans/${schoolId}/monitoring`).then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    request(`/management-plans/${schoolId}/monitoring`).then(setData).catch((e) => setError(e.message))
  }, [schoolId])

  if (error) return <div className="u-banner">Couldn't load the monitoring schedule ({error}).</div>
  if (!data) return <div className="mp-loading">Loading monitoring schedule…</div>
  const s = data.stats
  const upcoming = data.items.filter((x) => x.planned && x.status !== 'completed').sort((a, b) => a.planned.localeCompare(b.planned)).slice(0, 4)

  const markDone = async (item) => {
    try {
      await request(`/management-plans/${schoolId}/monitoring/${item.id}`, { method: 'PUT', body: { done: true } })
      load()
    } catch (err) {
      setNotice(err.message)
    }
  }
  const remove = async (item) => {
    if (!(await confirm({ title: `Remove ${item.title}?`, message: 'The activity will be removed from this school’s monitoring schedule.', confirmLabel: 'Remove Activity', tone: 'danger' }))) return
    try {
      await request(`/management-plans/${schoolId}/monitoring/${item.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setNotice(err.message)
    }
  }

  return (
    <section className="mp-card ms">
      <header className="mp-reg-head">
        <div>
          <h2>Monitoring &amp; Inspection Schedule</h2>
          <p>Plan, track, and manage asbestos inspections, condition checks, and management plan reviews.</p>
        </div>
        <button type="button" className="u-btn u-btn-primary" onClick={() => setDialog({ item: null })}><Plus size={15} />Add Schedule</button>
      </header>
      {notice && <p className="u-banner">{notice}</p>}

      <div className="rk-tiles">
        <Tile icon={CalendarDays} value={s.total} label="Total Activities" tone="blue" />
        <Tile icon={CalendarCheck} value={s.completed} label="Completed" tone="green" />
        <Tile icon={CalendarClock} value={s.upcoming} label="Upcoming" tone="sky" />
        <Tile icon={Clock} value={s.overdue} label="Overdue" tone="amber" />
        <div className="mp-tile purple rk-next"><span className="mp-tile-icon"><RefreshCw size={24} strokeWidth={1.8} /></span>
          <span className="mp-tile-text"><strong>{fmtDay(s.nextPlanReview)}</strong><span>Next Plan Review</span></span></div>
      </div>

      <div className="ms-layout">
        <div className="ms-main">
          <div className="ms-views" role="tablist" aria-label="Schedule view">
            <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : undefined} onClick={() => setView('list')}><List size={16} />Schedule List</button>
            <button type="button" role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : undefined} onClick={() => setView('calendar')}><CalendarDays size={16} />Calendar View</button>
          </div>

          {view === 'list' ? (
            <div className="mp-reg-scroll">
              <table className="mp-table ms-table">
                <colgroup>
                  <col className="ms-col-num" /><col className="ms-col-activity" /><col className="ms-col-scope" /><col className="ms-col-freq" />
                  <col className="ms-col-date" /><col className="ms-col-status" /><col className="ms-col-actions" />
                </colgroup>
                <thead><tr><th className="num">#</th><th>Activity / Inspection</th><th>Area / Scope</th><th>Frequency</th><th>Planned Date</th><th>Status</th><th className="ms-actions">Actions</th></tr></thead>
                <tbody>
                  {data.items.map((x, i) => (
                    <tr key={x.id}>
                      <td className="num">{i + 1}</td>
                      <td><strong className="mp-reg-room">{x.title}{x.edited && <span className="ms-edited" title="Changed in this plan">Edited</span>}</strong><small>{x.description}</small></td>
                      <td>{x.scope || '—'}</td>
                      <td className="u-nowrap">{x.frequency}</td>
                      <td className={`u-nowrap${x.status === 'overdue' && x.planned ? ' mp-late' : ''}`}>{x.planned ? fmtDay(x.planned) : '—'}</td>
                      <td><StatusCell item={x} /></td>
                      <td className="ms-actions"><div>
                        <button type="button" className="u-row-btn" title={x.custom ? 'View on calendar' : `Open ${x.module}`} aria-label={x.custom ? `View ${x.title} on the calendar` : `Open ${x.module}`}
                          onClick={() => (x.custom ? setView('calendar') : navigate(x.link))}><Eye size={16} /></button>
                        <button type="button" className="u-row-btn" title="Edit schedule" aria-label={`Edit ${x.title}`} onClick={() => setDialog({ item: x })}><Pencil size={15} /></button>
                        <ItemMenu item={x} onEdit={() => setDialog({ item: x })} onDone={() => markDone(x)} onRemove={() => remove(x)} />
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Calendar events={data.events} today={data.today} />}
        </div>

        <aside className="ms-side">
          <section className="ms-panel">
            <h3><CalendarDays size={18} />Upcoming Activities</h3>
            {upcoming.length ? (
              <ul className="ms-upcoming">
                {upcoming.map((x) => {
                  const d = new Date(`${x.planned}T00:00:00`)
                  return (
                    <li key={x.id}>
                      <span className={`ms-date${x.status === 'overdue' ? ' late' : ''}`}><strong>{d.getDate()}</strong>{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="ms-up-text"><strong>{x.title}</strong><small>{x.scope}</small></span>
                      <Badge tone={STATUS[x.status]?.tone ?? 'neutral'}>{STATUS[x.status]?.label ?? x.status}</Badge>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="u-muted ms-empty">Nothing due.</p>}
          </section>
          <section className="ms-panel">
            <h3><CalendarDays size={18} />Monitoring Frequency (Guide)</h3>
            <table className="mp-table ms-guide">
              <thead><tr><th>Activity</th><th>Recommended Frequency</th></tr></thead>
              <tbody>{data.frequencies.map((f) => <tr key={f.activity}><td>{f.activity}</td><td>{f.every}</td></tr>)}</tbody>
            </table>
          </section>
        </aside>
      </div>

      {dialog && (dialog.item && !dialog.item.custom
        ? <StandardDialog schoolId={schoolId} item={dialog.item} onClose={() => setDialog(null)} onSaved={(goTo) => { setDialog(null); if (goTo) navigate(goTo); else load() }} />
        : <ScheduleDialog schoolId={schoolId} item={dialog.item} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />)}
      {confirmDialog}
    </section>
  )
}
