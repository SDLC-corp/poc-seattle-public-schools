import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search, RotateCcw, ArrowDown, ArrowUp, Eye, MapPin, Plus } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import ExportMenu from '../Reports/ExportMenu'
import Badge from '../AcmInventory/Badge'
import LocationFilters from '../Surveillance/LocationFilters'
import RowMenu from '../Surveillance/RowMenu'
import Pager from '../Surveillance/Pager'
import { fmtDay, floorLink, toQs } from '../Surveillance/survMeta'
import { CONDITION_TONE, PRIORITY_TONE } from './inspMeta'
import { request, API_BASE } from '../../lib/api'
import DueDate from '../../lib/DueDate'

const NO_LOCATION = { school: '', building: '', floor: '' }
const COLUMNS = [
  { key: 'id', label: 'Inspection ID' }, { key: 'type', label: 'Inspection Type' }, { key: 'facility', label: 'Facility' },
  { label: 'Room / Location' }, { key: 'assignedTo', label: 'Inspector' }, { key: 'date', label: 'Inspection Date' },
  { label: 'Completed (Reviewed)' }, { key: 'condition', label: 'Condition' }, { key: 'priority', label: 'Priority' }, { key: 'nextDue', label: 'Next Due' },
]

// Completed inspections: verified and approved by a reviewer
export default function CompletedTab({ tabs, meta }) {
  const navigate = useNavigate()
  const [tree, setTree] = useState(null)
  const [location, setLocation] = useState(NO_LOCATION)
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { request('/acm-inventory/tree').then(setTree).catch(() => {}) }, [])
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const filterQs = toQs({ ...location, type, status: 'completed', q: debouncedQ })
  const qs = `${filterQs}&${toQs({ sort: sort.key, dir: sort.dir, page, pageSize })}`
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
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'date' || key === 'nextDue' ? 'desc' : 'asc' }))
    setPage(1)
  }

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
                onChange={(e) => setQ(e.target.value)} aria-label="Search completed inspections" />
            </label>
            <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!active} aria-label="Reset filters" title="Reset filters" onClick={reset}>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>
      {tabs}

      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">Completed Inspections{data ? ` (${data.total.toLocaleString('en-US')})` : ''}</h2>
          <ExportMenu csvHref={`${API_BASE}/inspection-records/export.csv?${filterQs}`} title="Completed inspections" />
        </header>
        {error && <div className="u-banner">Couldn't load inspections ({error}).</div>}
        <div className="u-table-wrap">
          <table className="u-table ai-table in-table">
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
              {data?.records.map((r) => (
                <tr key={r.id}>
                  <td className="u-nowrap">
                    <Link to={`/inspections/records/${r.id}`} className="sv-id">{r.id}</Link>
                    {r.parentId && <small className="in-child-of">Follow-up of <Link to={`/inspections/records/${r.parentId}?tab=followUp`}>{r.parentId}</Link></small>}
                  </td>
                  <td className="in-type">{r.type}</td>
                  <td className="ai-room"><strong className="in-plain">{r.schoolName}</strong><small>{r.buildingName} · {r.floorName}</small></td>
                  <td className="ai-room"><strong>{r.roomNumber ? `${r.roomNumber} – ${r.roomName}` : r.roomName}</strong><small>{r.materialName}</small></td>
                  <td className="u-nowrap">{r.assignedTo ?? '—'}</td>
                  <td className="u-nowrap">{fmtDay(r.date)}</td>
                  <td className="ai-room"><strong className="in-plain">{fmtDay(r.approvedOn)}</strong>{r.reviewerName && <small>{r.reviewerName}</small>}</td>
                  <td>{r.condition ? <Badge tone={CONDITION_TONE[r.condition]}>{r.condition}</Badge> : '—'}</td>
                  <td>{r.priority ? <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge> : '—'}</td>
                  <td className="u-nowrap"><DueDate date={r.nextDue}>{fmtDay(r.nextDue)}</DueDate></td>
                  <td className="in-col-actions">
                    <Link to={`/inspections/records/${r.id}`} className="u-row-btn" aria-label={`View ${r.id}`} title="View"><Eye size={15} /></Link>
                    <RowMenu label={`More actions for ${r.id}`} items={[
                      { icon: Plus, label: 'New inspection of this ACM', onClick: () => navigate(`/inspections/new?material=${encodeURIComponent(r.materialId)}`) },
                      { icon: MapPin, label: 'Open room on floor plan', onClick: () => navigate(floorLink(r)) },
                    ]} />
                  </td>
                </tr>
              ))}
              {data && !data.records.length && <tr><td colSpan={COLUMNS.length + 1} className="u-empty">No completed inspections match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        {data && <Pager data={data} noun="inspections" onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />}
      </section>
    </>
  )
}
