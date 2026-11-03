import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarDays, Clock3, Undo2, OctagonAlert, Hourglass, CircleCheck, Play, ClipboardCheck, MapPin } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { fmtDay, isoToday, floorLink } from '../Surveillance/survMeta'
import { STATUS_TONE } from './inspMeta'
import { request } from '../../lib/api'

function Tile({ icon: Icon, value, label, tone }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{value ?? '—'}</strong><span className="kpi-label">{label}</span></span>
    </div>
  )
}

const daysFrom = (iso) => Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${isoToday()}T00:00:00`)) / 86400000)
const when = (d) => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`)

/**
 * An inspector's open work. There's no sign-in in this demo, so the inspector is picked at the top;
 * with sign-in it would be the signed-in user.
 */
export default function AssignmentsTab({ meta }) {
  const navigate = useNavigate()
  const [inspectorId, setInspectorId] = useState('')
  const [data, setData] = useState(null)
  const chosen = inspectorId || meta?.inspectors[0]?.id || ''

  useEffect(() => {
    if (!chosen) return
    let cancelled = false
    request(`/inspection-records/assignments?inspector=${chosen}`).then((d) => { if (!cancelled) setData({ id: chosen, ...d }) }).catch(() => {})
    return () => { cancelled = true }
  }, [chosen])

  const current = data?.id === chosen ? data : null
  const s = current?.stats
  const person = meta?.inspectors.find((u) => u.id === chosen)

  return (
    <>
      <div className="in-who">
        <div className="a-field">
          <span>Viewing assignments for</span>
          <SearchSelect variant="field" label="Inspector" value={chosen} onChange={setInspectorId} searchable={false}
            options={(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name }))} />
        </div>
        {person?.certification && <span className="u-muted in-who-cert">{person.certification.name} · {person.certification.number} · valid to {fmtDay(person.certification.expiresOn)}</span>}
      </div>

      <div className="a-kpis in-kpis">
        <Tile icon={CalendarDays} value={s?.scheduled} label="Scheduled" tone="teal" />
        <Tile icon={Clock3} value={s?.inProgress} label="In Progress" tone="warning" />
        <Tile icon={Undo2} value={s?.returned} label="Returned to Fix" tone="warning" />
        <Tile icon={OctagonAlert} value={s?.overdue} label="Overdue to Start" tone="critical" />
        <Tile icon={Hourglass} value={s?.pendingReview} label="Waiting for Review" tone="violet" />
        <Tile icon={CircleCheck} value={s?.completed30} label="Approved (30 days)" tone="good" />
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head"><h2 className="ai-records-title">Open Assignments</h2></header>
        {current && !current.items.length && <p className="u-muted sv-empty-line">Nothing assigned — all caught up.</p>}
        <ul className="in-cards">
          {current?.items.map((r) => {
            const d = daysFrom(r.scheduledDate ?? r.shownDate)
            return (
              <li key={r.id} className={`in-card${r.state === 'returned' ? ' returned' : r.overdue ? ' late' : ''}`}>
                <div className="in-card-when">
                  <strong>{fmtDay(r.scheduledDate ?? r.shownDate)}</strong>
                  <small className={d < 0 && r.state === 'scheduled' ? 'sv-late' : undefined}>{r.state === 'scheduled' ? when(d) : r.state === 'returned' ? 'Returned' : 'Started'}</small>
                </div>
                <div className="in-card-body">
                  <div className="in-card-top">
                    <Link to={`/inspections/records/${r.id}`} className="sv-id">{r.id}</Link>
                    <span>{r.type}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{r.state === 'returned' ? 'Returned for Changes' : r.statusText}</Badge>
                  </div>
                  <strong>{r.materialName}</strong>
                  <small>{r.schoolName} · {r.buildingName} · {r.floorName} · {r.roomNumber} {r.roomName}</small>
                </div>
                <div className="in-card-actions">
                  <button type="button" className="u-row-btn" onClick={() => navigate(floorLink(r))} aria-label="Open room on floor plan" title="Floor plan"><MapPin size={15} /></button>
                  <button type="button" className={`u-btn u-btn-sm ${r.state === 'scheduled' ? 'u-btn-primary' : 'u-btn-outline'}`} onClick={() => navigate(`/inspections/records/${r.id}`)}>
                    {r.state === 'scheduled' ? <><Play size={13} />Start</> : <><ClipboardCheck size={13} />{r.state === 'returned' ? 'Fix & Resubmit' : 'Continue'}</>}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
