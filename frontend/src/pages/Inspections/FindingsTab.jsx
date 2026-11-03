import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Search, ListChecks, CircleDot, Loader, OctagonAlert, CircleCheck } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import Pager from '../Surveillance/Pager'
import { fmtDay, toQs } from '../Surveillance/survMeta'
import { CONDITION_TONE, PRIORITY_TONE } from './inspMeta'
import { request } from '../../lib/api'

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{value?.toLocaleString('en-US') ?? '—'}</strong><span className="kpi-label">{label}</span></span>
    </button>
  )
}

const STATUSES = ['Pending', 'In Progress', 'Completed']

// Action items raised by submitted/approved inspections; status can be updated in place
export default function FindingsTab({ onToast }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])
  const qs = toQs({ status, q: debouncedQ, page, pageSize })
  useEffect(() => {
    let cancelled = false
    request(`/inspection-records/findings?${qs}`).then((d) => { if (!cancelled) setData(d) }).catch((e) => onToast({ kind: 'error', text: e.message }))
    return () => { cancelled = true }
  }, [qs, reload, onToast])

  const pick = (v) => { setStatus(status === v ? '' : v); setPage(1) }
  const change = async (x, next) => {
    try {
      await request(`/inspection-records/records/${x.inspectionId}/actions/${x.id}`, { method: 'PATCH', body: { status: next } })
      onToast({ kind: 'success', text: `“${x.action}” set to ${next}` })
      setReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }
  const s = data?.stats

  return (
    <>
      <div className="a-kpis ai-kpis">
        <Kpi icon={ListChecks} value={s?.total} label="Action Items" tone="primary" active={!status} onClick={() => pick('')} />
        <Kpi icon={CircleDot} value={s?.pending} label="Pending" tone="warning" active={status === 'Pending'} onClick={() => pick('Pending')} />
        <Kpi icon={Loader} value={s?.inProgress} label="In Progress" tone="violet" active={status === 'In Progress'} onClick={() => pick('In Progress')} />
        <Kpi icon={OctagonAlert} value={s?.overdue} label="Past Due" tone="critical" active={status === 'overdue'} onClick={() => pick('overdue')} />
        <Kpi icon={CircleCheck} value={s?.completed} label="Completed" tone="good" active={status === 'Completed'} onClick={() => pick('Completed')} />
      </div>
      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Findings &amp; Action Items</h2>
          <label className="u-search in-findings-search"><Search size={15} /><input type="search" placeholder="Action, inspection, material or team…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search findings" /></label>
        </header>
        <div className="u-table-wrap">
          <table className="u-table ai-table">
            <thead><tr><th>Due Date</th><th>Action</th><th>Priority</th><th>Inspection</th><th>Material / Location</th><th>Condition</th><th>Assigned To</th><th>Status</th></tr></thead>
            <tbody>
              {data?.items.map((x) => (
                <tr key={`${x.inspectionId}-${x.id}`}>
                  <td className="ai-room"><strong className="in-plain">{fmtDay(x.dueDate)}</strong>{x.overdue && <small className="sv-late">Past due</small>}</td>
                  <td className="sv-action-text">{x.action}</td>
                  <td><Badge tone={PRIORITY_TONE[x.priority]}>{x.priority}</Badge></td>
                  <td className="ai-room"><Link to={`/inspections/records/${x.inspectionId}`} className="sv-id">{x.inspectionId}</Link><small>{x.inspectionType}</small></td>
                  <td className="ai-room"><strong>{x.materialName}</strong><small>{x.schoolName} · {x.roomNumber} {x.roomName}</small></td>
                  <td>{x.condition ? <Badge tone={CONDITION_TONE[x.condition]}>{x.condition}</Badge> : '—'}</td>
                  <td className="u-nowrap">{x.assignedTo}</td>
                  <td className="sv-status-cell">
                    <SearchSelect variant="field" label={`Status of ${x.action}`} value={x.status} searchable={false}
                      onChange={(v) => { if (v !== x.status) change(x, v) }} options={STATUSES.map((v) => ({ value: v, label: v }))} />
                  </td>
                </tr>
              ))}
              {data && !data.items.length && <tr><td colSpan={8} className="u-empty">No action items match.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="action items" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
    </>
  )
}
