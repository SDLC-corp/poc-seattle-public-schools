import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Search, RotateCcw, ArrowDown, ArrowUp, ShieldCheck, CircleCheck } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import LocationFilters from '../Surveillance/LocationFilters'
import Pager from '../Surveillance/Pager'
import { fmtDay, toQs } from '../Surveillance/survMeta'
import { CONDITION_TONE, PRIORITY_TONE } from './inspMeta'
import { request } from '../../lib/api'

const NO_LOCATION = { school: '', building: '', floor: '' }
const COLUMNS = [
  { key: 'id', label: 'Inspection ID' }, { key: 'type', label: 'Inspection Type' }, { key: 'facility', label: 'Facility' },
  { label: 'Room / ACM' }, { key: 'assignedTo', label: 'Inspector' }, { key: 'date', label: 'Inspection Date' },
  { key: 'submitted', label: 'Submitted' }, { key: 'condition', label: 'Condition' }, { key: 'priority', label: 'Priority' },
]
const daysSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(`${iso}T00:00:00`)) / 86400000)) : null)

/**
 * Inspections submitted and waiting for review, oldest first. "Review" opens the inspection at its reviewer section,
 * where the reviewer verifies it, signs, dates and approves it (or returns it with notes), then comes back here.
 */
export default function ReviewTab({ meta }) {
  const [tree, setTree] = useState(null)
  const [location, setLocation] = useState(NO_LOCATION)
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  // Latest submitted first
  const [sort, setSort] = useState({ key: 'submitted', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { request('/acm-inventory/tree').then(setTree).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const qs = `${toQs({ ...location, type, state: 'submitted', q: debouncedQ })}&${toQs({ sort: sort.key, dir: sort.dir, page, pageSize })}`
  useEffect(() => {
    let cancelled = false
    request(`/inspection-records?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs])

  const active = Boolean(type || q) || JSON.stringify(location) !== JSON.stringify(NO_LOCATION)
  const reset = () => { setLocation(NO_LOCATION); setType(''); setQ(''); setDebouncedQ(''); setPage(1) }
  const toggleSort = (key) => {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }
  const reviewLink = (id) => `/inspections/records/${id}?review=1`

  return (
    <>
      <div className="ai-filters in-filters in-filters-4">
        <LocationFilters tree={tree} value={location} onChange={(v) => { setLocation(v); setPage(1) }} />
        <div className="a-field">
          <span>Inspection Type</span>
          <SearchSelect variant="field" label="Inspection type" value={type} onChange={(v) => { setType(v); setPage(1) }} searchable={false}
            options={[{ value: '', label: 'All Types' }, ...(meta?.types ?? []).map((t) => ({ value: t, label: t }))]} />
        </div>
        <div className="a-field ai-search-field">
          <span>Search</span>
          <div className="ai-search-row">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Inspection ID, ACM ID, room or inspector…" value={q}
                onChange={(e) => setQ(e.target.value)} aria-label="Search inspections in review" />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!active} aria-label="Reset filters" title="Reset filters" onClick={reset}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">In Review{data ? ` (${data.total.toLocaleString('en-US')})` : ''}</h2>
          <span className="u-muted">Submitted inspections waiting for a reviewer to verify, sign and approve – latest submitted first</span>
        </header>
        {error && <div className="u-banner">Couldn&apos;t load inspections ({error}).</div>}
        {data && !data.total && !active ? (
          <div className="in-review-empty"><CircleCheck size={28} /><strong>Nothing waiting for review</strong><span>Inspections appear here as soon as they&apos;re submitted.</span></div>
        ) : (
          <div className="u-table-wrap">
            <table className="u-table ai-table in-table in-review-list">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.label} aria-sort={c.key && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {c.key ? (
                        <button type="button" className="a-sort" onClick={() => toggleSort(c.key)}>
                          {c.label}{sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                  <th className="in-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.records.map((r) => {
                  const waited = daysSince(r.submittedOn)
                  return (
                    <tr key={r.id}>
                      <td className="u-nowrap">
                        <Link to={reviewLink(r.id)} className="sv-id">{r.id}</Link>
                        {r.parentId && <small className="in-child-of">Follow-up of <Link to={`/inspections/records/${r.parentId}?tab=followUp`}>{r.parentId}</Link></small>}
                      </td>
                      <td className="in-type">{r.type}</td>
                      <td className="ai-room"><strong className="in-plain">{r.schoolName}</strong><small>{r.buildingName} · {r.floorName}</small></td>
                      <td className="ai-room"><strong>{r.roomNumber ? `${r.roomNumber} – ${r.roomName}` : r.roomName}</strong><small>{r.materialName}</small></td>
                      <td className="u-nowrap">{r.assignedTo ?? '—'}</td>
                      <td className="u-nowrap">{fmtDay(r.date)}</td>
                      <td className="ai-room">
                        <strong className="in-plain">{fmtDay(r.submittedOn)}</strong>
                        {waited != null && <small className={`in-review-wait${waited > 7 ? ' long' : ''}`}>{waited === 0 ? 'Today' : `Waiting ${waited} day${waited === 1 ? '' : 's'}`}</small>}
                      </td>
                      <td>{r.condition ? <Badge tone={CONDITION_TONE[r.condition]}>{r.condition}</Badge> : '—'}</td>
                      <td>{r.priority ? <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge> : '—'}</td>
                      <td className="in-col-actions">
                        <Link to={reviewLink(r.id)} className="u-btn u-btn-primary u-btn-sm"><ShieldCheck size={13} />Review</Link>
                      </td>
                    </tr>
                  )
                })}
                {data && !data.records.length && <tr><td colSpan={COLUMNS.length + 1} className="u-empty">No inspections in review match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && <Pager data={data} noun="inspections" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
    </>
  )
}
