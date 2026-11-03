import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Search, ListChecks, CircleDot, Loader, CircleCheck, OctagonAlert, RotateCcw } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import LocationFilters from './LocationFilters'
import Pager from './Pager'
import { CONDITION_TONE, fmtDay, toQs } from './survMeta'
import { request } from '../../lib/api'

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{value?.toLocaleString('en-US') ?? '—'}</strong><span className="kpi-label">{label}</span></span>
    </button>
  )
}

const STATUSES = ['Open', 'In Progress', 'Closed']

// Corrective action items raised by surveillance, with their status editable in place
export default function FindingsTab({ tree, location, setLocation, onToast }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const qs = toQs({ ...location, status, q: debouncedQ, page, pageSize })
  useEffect(() => {
    let cancelled = false
    request(`/surveillance/findings?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs, reload])

  const pickStatus = (v) => { setStatus(status === v ? '' : v); setPage(1) }
  const changeStatus = async (a, next) => {
    try {
      await request(`/surveillance/records/${a.recordId}/actions/${a.id}`, { method: 'PATCH', body: { status: next } })
      onToast({ kind: 'success', text: `“${a.text}” set to ${next}` })
      setReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }
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
              <input type="search" placeholder="Action, surveillance ID, material or team…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search findings" />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" aria-label="Reset filters" title="Reset filters"
              disabled={!status && !q && !location.school}
              onClick={() => { setStatus(''); setQ(''); setDebouncedQ(''); setLocation({ school: '', building: '', floor: '' }); setPage(1) }}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="a-kpis ai-kpis">
        <Kpi icon={ListChecks} value={s?.total} label="Corrective Actions" tone="primary" active={!status} onClick={() => pickStatus('')} />
        <Kpi icon={CircleDot} value={s?.open} label="Open" tone="warning" active={status === 'Open'} onClick={() => pickStatus('Open')} />
        <Kpi icon={Loader} value={s?.inProgress} label="In Progress" tone="violet" active={status === 'In Progress'} onClick={() => pickStatus('In Progress')} />
        <Kpi icon={OctagonAlert} value={s?.overdue} label="Past Due" tone="critical" active={status === 'overdue'} onClick={() => pickStatus('overdue')} />
        <Kpi icon={CircleCheck} value={s?.closed} label="Closed" tone="good" active={status === 'Closed'} onClick={() => pickStatus('Closed')} />
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Findings &amp; Corrective Actions</h2>
        </header>
        {error && <div className="u-banner">Couldn't load findings ({error}).</div>}
        <div className="u-table-wrap">
          <table className="u-table ai-table">
            <thead>
              <tr><th>Due Date</th><th>Action Item</th><th>Surveillance</th><th>Material / Location</th><th>Condition</th><th>Assigned To</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data?.items.map((a) => (
                <tr key={`${a.recordId}-${a.id}`}>
                  <td className="ai-room"><strong>{fmtDay(a.dueDate)}</strong>{a.overdue && <small className="sv-late">Past due</small>}</td>
                  <td className="sv-action-text">{a.text}</td>
                  <td className="ai-room"><Link to={`/surveillance/records/${a.recordId}`} className="sv-id">{a.recordId}</Link><small>{fmtDay(a.recordDate)}</small></td>
                  <td className="ai-room"><strong>{a.materialName}</strong><small>{a.schoolName} · {a.buildingName} · {a.roomNumber}</small></td>
                  <td><Badge tone={CONDITION_TONE[a.condition]}>{a.condition}</Badge></td>
                  <td className="u-nowrap">{a.assignedTo}</td>
                  <td className="sv-status-cell">
                    <SearchSelect variant="field" label={`Status of ${a.text}`} value={a.status} searchable={false}
                      onChange={(v) => { if (v !== a.status) changeStatus(a, v) }}
                      options={STATUSES.map((x) => ({ value: x, label: x }))} />
                  </td>
                </tr>
              ))}
              {data && !data.items.length && <tr><td colSpan={7} className="u-empty">No findings match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="action items" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
    </>
  )
}
