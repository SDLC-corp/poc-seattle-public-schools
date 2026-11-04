import { useEffect, useMemo, useState } from 'react'
import {
  FlaskConical, TriangleAlert, CircleCheck, ShieldQuestion, Search, ChevronLeft, ChevronRight,
  ArrowDown, ArrowUp, ArrowDownUp, RotateCcw, Eye, Hourglass, Pencil, CircleAlert,
} from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import SearchSelect from '../../components/ui/SearchSelect'
import { ResultChip } from './labMeta'
import SampleResultDialog from './SampleResultDialog'
import { request } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import './labSamples.css'

const DEFAULTS = { result: '', site: '', building: '', room: '', source: '', q: '' }

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

function Kpi({ icon: Icon, value, label, sub, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value?.toLocaleString('en-US') ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
}

export default function LabSamples() {
  // ?sample=<id> (older links) opens that sample's page; ?site= (from a sample page) filters by school
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const linkedSample = params.get('sample')
  const [filters, setFilters] = useState(() => ({ ...DEFAULTS, q: params.get('q') ?? '', site: params.get('site') ?? '' }))
  const [debouncedQ, setDebouncedQ] = useState(() => params.get('q') ?? '')
  const [sort, setSort] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [facets, setFacets] = useState({ sites: [], results: [], sources: [] })
  const [places, setPlaces] = useState({ buildings: [], rooms: [] }) // the chosen school's buildings and rooms
  const [error, setError] = useState(null)
  const [entering, setEntering] = useState(null) // { inspectionId, materialId } of the sample whose result is being entered
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState(null)

  // A new school clears building and room; a new building clears room
  const CLEARS = { site: { building: '', room: '' }, building: { room: '' } }
  const setFilter = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value, ...CLEARS[key] }))
    setPage(1)
  }
  // KPI tiles toggle the result filter
  const toggleResult = (value) => setFilter('result')(filters.result === value ? '' : value)

  useEffect(() => {
    request('/lab-samples/facets').then(setFacets).catch(() => {})
  }, [])

  useEffect(() => {
    if (!filters.site) return
    let cancelled = false
    request(`/lab-samples/facets?${new URLSearchParams({ site: filters.site, building: filters.building })}`)
      .then((d) => { if (!cancelled) setPlaces({ buildings: d.buildings ?? [], rooms: d.rooms ?? [] }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [filters.site, filters.building])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(filters.q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [filters.q])

  const qs = useMemo(() => new URLSearchParams({
    result: filters.result, site: filters.site, building: filters.building, room: filters.room, source: filters.source, q: debouncedQ, sort, page, pageSize,
  }).toString(), [filters.result, filters.site, filters.building, filters.room, filters.source, debouncedQ, sort, page, pageSize])

  useEffect(() => {
    let cancelled = false
    request(`/lab-samples?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [qs, refreshKey])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (linkedSample) return <Navigate to={`/sampling/samples/${encodeURIComponent(linkedSample)}`} replace />
  const open = (id) => navigate(`/sampling/samples/${encodeURIComponent(id)}`)

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULTS)
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0
  const stats = data?.stats
  const { buildings, rooms } = filters.site ? places : { buildings: [], rooms: [] }
  const nextSort = { '': 'asc', asc: 'desc', desc: '' }[sort]
  const SortIcon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ArrowDownUp

  return (
    <div className="audit-page lr-page">
      <div className="a-main">
        <div className="a-head">
          <div>
            <h1><FlaskConical size={22} />Lab &amp; Sampling Results</h1>
            <p>Bulk sample records and laboratory results for asbestos analysis, including samples sent from inspections.</p>
          </div>
          {data?.source && (
            <span className="lr-source" title={`${data.source.file} · ${data.source.worksheet}`}>
              {data.source.fromInspections.toLocaleString('en-US')} from inspections · {data.source.worksheet} · {data.source.records.toLocaleString('en-US')} imported records
            </span>
          )}
        </div>

        <div className="a-kpis">
          <Kpi icon={FlaskConical} value={stats?.total} label="Total Samples" tone="primary"
            sub={[filters.site || 'All schools', filters.building, filters.room && `Rm ${filters.room}`].filter(Boolean).join(' · ')} active={!filters.result} onClick={() => setFilter('result')('')} />
          <Kpi icon={TriangleAlert} value={stats?.detected} label="Asbestos Detected" tone="critical"
            active={filters.result === 'detected'} onClick={() => toggleResult('detected')} />
          <Kpi icon={CircleCheck} value={stats?.none} label="No Asbestos Detected" tone="good"
            active={filters.result === 'none'} onClick={() => toggleResult('none')} />
          <Kpi icon={ShieldQuestion} value={stats && stats.assumed + stats.inconclusive} label="Assumed / Not Analyzed" tone="warning"
            sub={stats && `${stats.assumed} assumed · ${stats.inconclusive} not analyzed`}
            active={filters.result === 'assumed' || filters.result === 'inconclusive'} onClick={() => toggleResult('assumed')} />
          <Kpi icon={Hourglass} value={stats?.pending} label="Pending at Lab" tone="violet"
            sub={stats && `${stats.fromInspections} from inspections`} active={filters.result === 'pending'} onClick={() => toggleResult('pending')} />
        </div>

        <section className="u-card">
          <div className="lr-filters">
            <label className="u-search lr-search">
              <Search size={15} />
              <input type="search" placeholder="Search sample no., material, room…" value={filters.q}
                onChange={(e) => setFilter('q')(e.target.value)} aria-label="Search samples" />
            </label>
            <SearchSelect variant="field" label="School" value={filters.site} onChange={setFilter('site')} searchPlaceholder="Search schools…"
              options={[{ value: '', label: 'All Schools' }, ...facets.sites.map((s) => ({ value: s.name, label: `${s.name} (${s.count})` }))]} />
            {/* Building and room follow the chosen school (imported samples record a room but no building) */}
            <SearchSelect variant="field" label="Building" value={filters.building} onChange={setFilter('building')} searchPlaceholder="Search buildings…"
              disabled={!filters.site || !buildings.length}
              options={[{ value: '', label: !filters.site ? 'Select a school first' : buildings.length ? 'All Buildings' : 'No buildings recorded' }, ...buildings.map((b) => ({ value: b.name, label: `${b.name} (${b.count})` }))]} />
            <SearchSelect variant="field" label="Room" value={filters.room} onChange={setFilter('room')} searchPlaceholder="Search rooms…"
              disabled={!filters.site || !rooms.length}
              options={[{ value: '', label: !filters.site ? 'Select a school first' : rooms.length ? 'All Rooms' : 'No rooms recorded' }, ...rooms.map((r) => ({ value: r.name, label: `Rm ${r.name} (${r.count})` }))]} />
            <SearchSelect variant="field" label="Result" value={filters.result} onChange={setFilter('result')} searchable={false}
              options={[{ value: '', label: 'All Results' }, ...facets.results.map((r) => ({ value: r.value, label: r.label }))]} />
            <SearchSelect variant="field" label="Source" value={filters.source} onChange={setFilter('source')} searchable={false}
              options={[{ value: '', label: 'All Sources' }, ...facets.sources.map((s) => ({ value: s.value, label: `${s.label} (${s.count})` }))]} />
            <button type="button" className="u-btn u-btn-outline a-reset" disabled={!filtersActive}
              onClick={() => { setFilters(DEFAULTS); setDebouncedQ(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>

          {error && <div className="u-banner">Couldn't load lab samples ({error}).</div>}

          <div className="u-table-wrap">
            <table className="u-table a-table lr-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="a-sort" onClick={() => { setSort(nextSort); setPage(1) }}
                      aria-label={`Sort by sample number${nextSort ? ` ${nextSort === 'asc' ? 'ascending' : 'descending'}` : ', original order'}`}>
                      Sample No. <SortIcon size={13} />
                    </button>
                  </th>
                  <th>Inspection ID</th><th>School / Location</th><th>Description</th><th>Result</th>
                  <th className="lr-col-action"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data?.samples.map((s) => (
                  <tr key={s.id} onClick={() => open(s.id)} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') open(s.id) }}>
                    <td className="u-nowrap lr-no">
                      <span className="a-mono">{s.sampleNo}</span>
                    </td>
                    {/* Sample taken during an inspection (imported spreadsheet samples have none) */}
                    <td className="u-nowrap">
                      {s.inspectionId
                        ? <Link to={`/inspections/records/${s.inspectionId}?tab=lab`} className="sv-id" onClick={(ev) => ev.stopPropagation()}>{s.inspectionId}</Link>
                        : <span className="u-muted">—</span>}
                    </td>
                    <td className="lr-site">
                      <strong>{s.site}</strong>
                      {(s.building || s.room) && <small>{[s.building, s.room && `Rm ${s.room}`].filter(Boolean).join(' · ')}</small>}
                    </td>
                    <td className="lr-desc" title={s.description}>
                      {s.homogeneousArea && <span className="lr-ha">{s.homogeneousArea}</span>}
                      {s.description || <span className="u-muted">—</span>}
                    </td>
                    <td className="u-nowrap">
                      <ResultChip resultClass={s.resultClass} label={s.resultLabel} />
                      {s.components.length > 1 && <small className="lr-more">+{s.components.length - 1}</small>}
                    </td>
                    <td className="lr-col-action">
                      {s.resultsEditable && (
                        <button type="button" className="u-row-btn" title={s.resultClass === 'pending' ? 'Enter lab results' : 'Update lab results'}
                          aria-label={`${s.resultClass === 'pending' ? 'Enter' : 'Update'} lab results for ${s.sampleNo}`}
                          onClick={(ev) => { ev.stopPropagation(); setEntering({ inspectionId: s.inspectionId, materialId: s.materialId }) }}>
                          <Pencil size={14} />
                        </button>
                      )}
                      <button type="button" className="u-row-btn" title="View" aria-label={`View sample ${s.sampleNo}`}
                        onClick={(ev) => { ev.stopPropagation(); open(s.id) }}>
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {data && !data.samples.length && (
                  <tr><td colSpan={6} className="u-empty">No samples match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <footer className="u-pager">
              <span className="u-muted">Showing {from.toLocaleString('en-US')} – {to.toLocaleString('en-US')} of {data.total.toLocaleString('en-US')} samples</span>
              <nav className="u-pages" aria-label="Pagination">
                <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
                {pageList(data.page, data.pages).map((p, i) => (p === '…'
                  ? <span key={`gap${i}`} className="u-gap">…</span>
                  : <button key={p} type="button" className={p === data.page ? 'active' : ''} aria-current={p === data.page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
                <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
              </nav>
              <div className="u-page-size">
                <SearchSelect variant="field" label="Rows per page" value={pageSize} searchable={false}
                  onChange={(v) => { setPageSize(v); setPage(1) }}
                  options={[10, 25, 50, 100].map((n) => ({ value: n, label: `${n} / page` }))} />
              </div>
            </footer>
          )}
        </section>
      </div>

      {entering && (
        <SampleResultDialog {...entering} onClose={() => setEntering(null)}
          onSaved={(text, warn) => { setEntering(null); setToast({ kind: warn ? 'error' : 'success', text }); setRefreshKey((k) => k + 1) }} />
      )}
      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
