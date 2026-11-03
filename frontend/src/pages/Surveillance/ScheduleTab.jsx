import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search, ClipboardList, OctagonAlert, CalendarClock, CalendarCheck, Plus, MapPin, RotateCcw } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import LocationFilters from './LocationFilters'
import RowMenu from './RowMenu'
import Pager from './Pager'
import { CONDITION_TONE, SCHEDULE_STATUS, fmtDay, shortAcm, floorLink, toQs } from './survMeta'
import { request } from '../../lib/api'

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{value?.toLocaleString('en-US') ?? '—'}</strong><span className="kpi-label">{label}</span></span>
    </button>
  )
}

const dueText = (d) => (d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'Due today' : `In ${d} day${d === 1 ? '' : 's'}`)

// Every known/assumed ACM with its last surveillance and the next one due (6-month AHERA cycle)
export default function ScheduleTab({ tree, location, setLocation }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const qs = toQs({ ...location, status, q: debouncedQ, page, pageSize })
  useEffect(() => {
    let cancelled = false
    request(`/surveillance/schedule?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs])

  const pickStatus = (v) => { setStatus(status === v ? '' : v); setPage(1) }
  const s = data?.stats

  return (
    <>
      <div className="ai-filters sv-filters sv-filters-short">
        <LocationFilters tree={tree} value={location} onChange={(v) => { setLocation(v); setPage(1) }} />
        <div className="a-field ai-search-field">
          <span>Search</span>
          <div className="ai-search-row">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="ACM ID, material or room…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search schedule" />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" aria-label="Reset filters" title="Reset filters"
              disabled={!status && !q && !location.school}
              onClick={() => { setStatus(''); setQ(''); setDebouncedQ(''); setLocation({ school: '', building: '', floor: '' }); setPage(1) }}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="a-kpis sv-kpis-4">
        <Kpi icon={ClipboardList} value={s?.total} label="ACM Under Surveillance" tone="primary" active={!status} onClick={() => pickStatus('')} />
        <Kpi icon={OctagonAlert} value={s?.overdue} label="Overdue" tone="critical" active={status === 'overdue'} onClick={() => pickStatus('overdue')} />
        <Kpi icon={CalendarClock} value={s?.dueSoon} label="Due in Next 30 Days" tone="warning" active={status === 'dueSoon'} onClick={() => pickStatus('dueSoon')} />
        <Kpi icon={CalendarCheck} value={s?.scheduled} label="Scheduled Later" tone="good" active={status === 'scheduled'} onClick={() => pickStatus('scheduled')} />
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Surveillance Schedule</h2>
          <span className="u-muted sv-note">AHERA requires surveillance of known and assumed ACM at least every 6 months.</span>
        </header>
        {error && <div className="u-banner">Couldn't load the schedule ({error}).</div>}
        <div className="u-table-wrap">
          <table className="u-table ai-table">
            <thead>
              <tr>
                <th>Next Due</th><th>ACM ID</th><th>Material</th><th>Facility</th><th>Floor / Room</th>
                <th>Last Surveillance</th><th>Current Condition</th><th>Status</th>
                <th className="ai-col-actions"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={r.materialId}>
                  <td className="ai-room"><strong>{fmtDay(r.nextDue)}</strong><small className={r.daysUntil < 0 ? 'sv-late' : undefined}>{dueText(r.daysUntil)}</small></td>
                  <td className="ai-id" title={r.materialId}>{shortAcm(r.materialId, r.schoolId)}</td>
                  <td className="ai-material"><strong>{r.materialName}</strong><small>{r.acmStatus}</small></td>
                  <td className="ai-room"><strong>{r.schoolName}</strong><small>{r.buildingName}</small></td>
                  <td className="ai-room"><strong>{r.roomNumber ? `${r.roomNumber} – ${r.roomName}` : r.roomName}</strong><small>{r.floorName}</small></td>
                  <td className="ai-room">
                    {r.lastId ? <><Link to={`/surveillance/records/${r.lastId}`} className="sv-id">{fmtDay(r.lastDate)}</Link><small>{r.lastInspector}</small></>
                      : <span className="u-muted">Never surveyed</span>}
                  </td>
                  <td><Badge tone={CONDITION_TONE[r.condition]}>{r.condition}</Badge></td>
                  <td><Badge tone={SCHEDULE_STATUS[r.status].tone}>{SCHEDULE_STATUS[r.status].label}</Badge></td>
                  <td className="ai-col-actions">
                    <RowMenu label={`Actions for ${r.materialId}`} items={[
                      { icon: Plus, label: 'Record surveillance', onClick: () => navigate(`/surveillance/new?material=${encodeURIComponent(r.materialId)}`) },
                      { icon: MapPin, label: 'Open room on floor plan', onClick: () => navigate(floorLink(r)) },
                    ]} />
                  </td>
                </tr>
              ))}
              {data && !data.items.length && <tr><td colSpan={9} className="u-empty">Nothing on the schedule matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="materials" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
    </>
  )
}
