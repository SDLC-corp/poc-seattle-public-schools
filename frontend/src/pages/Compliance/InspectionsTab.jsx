import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { InspectionStatusBadge } from './complianceMeta'
import { request } from '../../lib/api'
import { fmtDay, isoDay } from './complianceUtils'

const DAY = 86400000

// Each tab is a preset over the inspection schedule
const PRESETS = {
  tracking: { title: 'Inspection Tracking', filter: () => true, sort: 'asc', showStatusFilter: true },
  deadlines: {
    title: 'Regulatory Deadlines (overdue + next 90 days)',
    filter: (i, today) => !i.completedAt && i.scheduledDate <= isoDay(new Date(today + 90 * DAY)),
    sort: 'asc',
  },
  history: { title: 'Compliance History (completed inspections)', filter: (i) => Boolean(i.completedAt), sort: 'desc' },
}

export default function InspectionsTab({ preset, refreshKey, selectedId, onSelect }) {
  const cfg = PRESETS[preset]
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [today] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })
  const pageSize = 10

  useEffect(() => {
    let cancelled = false
    request('/compliance/inspections').then((d) => { if (!cancelled) setAll(d.inspections) }).catch(() => {})
    return () => { cancelled = true }
  }, [refreshKey])

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (all ?? [])
      .filter((i) => cfg.filter(i, today))
      .filter((i) => (!status || i.status === status) && (!type || i.type === type))
      .filter((i) => !term || [i.schoolName, i.buildingName, i.inspectorName, i.id].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => (cfg.sort === 'asc' ? 1 : -1) * a.scheduledDate.localeCompare(b.scheduledDate))
  }, [all, cfg, today, query, status, type])

  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * pageSize, current * pageSize)
  const types = [...new Set((all ?? []).map((i) => i.type))].sort()

  return (
    <section className="u-card">
      <header className="u-card-head"><h2>{cfg.title} <span>({rows.length})</span></h2></header>
      <div className="c-ifilters">
        <label className="u-search">
          <Search size={15} />
          <input type="search" placeholder="Search school, building, inspector or ID…" value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Search inspections" />
        </label>
        {cfg.showStatusFilter && (
          <SearchSelect variant="field" label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1) }} searchable={false}
            options={[{ value: '', label: 'All Statuses' }, { value: 'overdue', label: 'Overdue' }, { value: 'dueSoon', label: 'Upcoming (14 days)' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'completed', label: 'Completed' }]} />
        )}
        <SearchSelect variant="field" label="Type" value={type} onChange={(v) => { setType(v); setPage(1) }} searchable={false}
          options={[{ value: '', label: 'All Types' }, ...types.map((t) => ({ value: t, label: t }))]} />
      </div>
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead>
            <tr><th>Date</th><th>School</th><th className="c-col-building">Building</th><th>Type</th><th className="c-col-inspector">Inspector</th><th>Status</th></tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className={i.id === selectedId ? 'selected' : ''} onClick={() => onSelect(i.id)}
                tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(i.id) }}>
                <td className="u-nowrap">{fmtDay(i.scheduledDate)}</td>
                <td>{i.schoolName}</td>
                <td className="c-col-building">{i.buildingName}</td>
                <td className="u-nowrap">{i.type}</td>
                <td className="c-col-inspector u-nowrap">{i.inspectorName}</td>
                <td><InspectionStatusBadge status={i.status} /></td>
              </tr>
            ))}
            {all && !visible.length && <tr><td colSpan={6} className="u-empty">No inspections match.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="u-pager">
        <span className="u-muted">{rows.length ? `Showing ${(current - 1) * pageSize + 1} to ${Math.min(rows.length, current * pageSize)} of ${rows.length}` : 'No results'}</span>
        <nav className="u-pages" aria-label="Pagination">
          <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
          <span className="u-gap">Page {current} of {pages}</span>
          <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
        </nav>
      </footer>
    </section>
  )
}
