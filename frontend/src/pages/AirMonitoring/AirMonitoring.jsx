import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  Wind, CircleCheck, Download, Search, ChevronLeft, ChevronRight, RotateCcw,
  CircleAlert, Eye, Pencil,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import DonutChart from '../../components/charts/DonutChart'
import AirTrendChart from './AirTrendChart'
import AirEventForm from './AirEventForm'
import SampleResultDialog from '../LabSamples/SampleResultDialog'
import { AirStatusBadge } from './airMeta'
import { request, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './air.css'

// One view (the overview); older tab links (/air-monitoring/events etc.) come back here
const TABS = [{ slug: '', label: 'Overview' }]
const RANGES = [
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '180', label: 'Last 6 months', days: 180 },
  { value: '365', label: 'Last 12 months', days: 365 },
  { value: '', label: 'All time', days: null },
]
const DEFAULTS = { school: '', building: '', range: '180', type: '', status: '' }
const DAY = 86400000
const localDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}


export default function AirMonitoring() {
  const { tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)
  // ?event=<id> (older links) → that event's details page
  const [params] = useSearchParams()
  const linkedEvent = params.get('event')
  const openEvent = (eventId) => navigate(`/air-monitoring/events/${encodeURIComponent(eventId)}`)

  const [meta, setMeta] = useState(null)
  const [schools, setSchools] = useState([])
  const [buildings, setBuildings] = useState([])
  const [filters, setFilters] = useState(DEFAULTS)
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [trend, setTrend] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [form, setForm] = useState(null) // { event? }
  const [enteringResult, setEnteringResult] = useState(null) // { inspectionId, materialId } of an inspection's air sample
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [now] = useState(() => Date.now())

  const [pageFor, setPageFor] = useState(tabSlug)
  if (pageFor !== tabSlug) { setPageFor(tabSlug); setPage(1) }

  useEffect(() => {
    Promise.all([request('/air-monitoring/meta'), request('/schools'), request('/buildings')])
      .then(([m, s, b]) => { setMeta(m); setSchools(s.schools); setBuildings(b.buildings) })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Shared filter params; the Exceedances tab pins status
  const baseParams = useMemo(() => {
    const p = new URLSearchParams({
      q: debouncedQ, school: filters.school, building: filters.building, type: filters.type,
      status: tabSlug === 'exceedances' ? 'exceedance' : filters.status,
    })
    const range = RANGES.find((r) => r.value === filters.range)
    if (range?.days) { p.set('from', localDay(now - (range.days - 1) * DAY)); p.set('to', localDay(now)) }
    return p
  }, [debouncedQ, filters, tabSlug, now])

  const listQs = `${baseParams}&page=${page}&pageSize=${pageSize}`
  useEffect(() => {
    let cancelled = false
    request(`/air-monitoring?${listQs}`).then((d) => {
      if (cancelled) return
      setData(d)
      setError(null)
    }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [listQs, refreshKey])

  const trendQs = baseParams.toString()
  useEffect(() => {
    if (tabSlug !== '') return
    let cancelled = false
    request(`/air-monitoring/trend?${trendQs}`).then((d) => { if (!cancelled) setTrend(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [trendQs, refreshKey, tabSlug])

  const notify = useCallback((kind, text) => setToast({ kind, text }), [])

  if (linkedEvent) return <Navigate to={`/air-monitoring/events/${encodeURIComponent(linkedEvent)}`} replace />
  if (!tab) return <Navigate to="/air-monitoring" replace />

  const setFilter = (k) => (v) => {
    setFilters((f) => ({ ...f, [k]: v, ...(k === 'school' ? { building: '' } : {}) }))
    setPage(1)
  }
  const filtersActive = query || JSON.stringify(filters) !== JSON.stringify(DEFAULTS)
  const schoolBuildings = buildings.filter((b) => b.schoolId === filters.school)
  const stats = data?.stats
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <div className="air-page">
      <div className="air-main">
        <div className="c-head">
          <div>
            <h1><Wind size={22} />Air Monitoring</h1>
            <p>Manage air monitoring activities, results and compliance for asbestos projects.</p>
          </div>
        </div>

          <>
            {/* Filters on one line (the status split is in the Results by Status chart) */}
            <div className="air-filters">
              <div className="a-field"><span>School</span>
                <SearchSelect variant="field" label="School" value={filters.school} onChange={setFilter('school')} searchPlaceholder="Search schools…"
                  options={[{ value: '', label: 'All Schools' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
              </div>
              <div className="a-field"><span>Building</span>
                <SearchSelect variant="field" label="Building" value={filters.building} onChange={setFilter('building')} searchable={false}
                  options={[{ value: '', label: 'All Buildings' }, ...schoolBuildings.map((b) => ({ value: b.id, label: b.name }))]} />
              </div>
              <div className="a-field"><span>Date Range</span>
                <SearchSelect variant="field" label="Date range" value={filters.range} onChange={setFilter('range')} searchable={false}
                  options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
              </div>
              <div className="a-field"><span>Monitoring Type</span>
                <SearchSelect variant="field" label="Monitoring type" value={filters.type} onChange={setFilter('type')} searchable={false}
                  options={[{ value: '', label: 'All Types' }, ...(meta?.types ?? []).map((t) => ({ value: t, label: t }))]} />
              </div>
              <div className="a-field"><span>Status</span>
                <SearchSelect variant="field" label="Status" value={tabSlug === 'exceedances' ? 'exceedance' : filters.status} onChange={setFilter('status')} searchable={false}
                  options={[{ value: '', label: 'All Status' }, { value: 'compliant', label: 'Compliant' }, { value: 'exceedance', label: 'Exceedance' }, { value: 'pending', label: 'Pending' }]} />
              </div>
              <button type="button" className="u-btn u-btn-outline air-reset" disabled={!filtersActive}
                onClick={() => { setFilters(DEFAULTS); setQuery(''); setPage(1) }}>
                <RotateCcw size={14} />Reset
              </button>
            </div>

            {error && <div className="u-banner">Couldn't load air monitoring data ({error}).</div>}

            {tabSlug === '' && (
              <div className="air-charts">
                <section className="u-card">
                  <header className="u-card-head air-chart-head">
                    <h2>Monitoring Results Trend</h2>
                    <ul className="air-legend">
                      <li><i className="sw avg" />Average</li>
                      <li><i className="sw min" />Min</li>
                      <li><i className="sw max" />Max</li>
                      <li><i className="sw action" />Action Level ({trend?.actionLevel ?? 0.01} f/cc)</li>
                    </ul>
                  </header>
                  <AirTrendChart months={trend?.months} actionLevel={trend?.actionLevel ?? 0.01} />
                  <p className="u-muted air-note">PCM area, clearance and background samples. Personal and TEM samples use different limits/units and are excluded.</p>
                </section>
                <section className="u-card card-chart">
                  <header className="u-card-head"><h2>Results by Status</h2></header>
                  <DonutChart
                    data={stats ? [
                      { label: 'Compliant', value: stats.compliant, color: 'var(--status-good)' },
                      { label: 'Exceedance', value: stats.exceedance, color: 'var(--status-critical)' },
                      { label: 'Pending', value: stats.pending, color: 'var(--status-warning)' },
                    ] : []}
                    centerValue={stats?.total ?? '—'} centerLabel="Total Events" showCounts ariaLabel="Monitoring events by result status" />
                </section>
              </div>
            )}

            <section className="u-card">
              <header className="u-card-head air-table-head">
                <h2>{tabSlug === 'exceedances' ? 'Exceedances' : 'Air Monitoring Events'} {data && <span>({data.total})</span>}</h2>
                <div className="c-table-tools">
                  <label className="u-search">
                    <Search size={15} />
                    <input type="search" placeholder="Search by school, room, sample or inspection ID…" value={query}
                      onChange={(e) => setQuery(e.target.value)} aria-label="Search monitoring events" />
                  </label>
                  <a className="u-btn u-btn-outline" href={`${API_BASE}/air-monitoring/export.csv?${baseParams}`} download><Download size={15} />Export</a>
                </div>
              </header>
              <div className="u-table-wrap">
                <table className="u-table c-table air-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Inspection ID</th><th>Sample ID</th><th>School</th><th className="air-col-building">Building</th><th>Location / Room</th><th>Type</th>
                      <th className="air-col-method">Method</th><th className="air-num">Result (Fibre Count)</th><th>Status</th><th className="u-col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.events.map((e) => (
                      <tr key={e.id} className="air-row" onClick={() => openEvent(e.id)}
                        tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') openEvent(e.id) }}>
                        <td className="u-nowrap">{fmtDate(e.sampledAt)}</td>
                        {/* Air sample taken during an inspection, or a logged event's related inspection at the school */}
                        <td className="u-nowrap">
                          {e.inspectionId || e.relatedInspectionId
                            ? <Link to={`/inspections/records/${e.inspectionId ?? e.relatedInspectionId}${e.inspectionId ? '?tab=lab' : ''}`} className="sv-id"
                              title={e.inspectionId ? undefined : 'Related inspection at this school'} onClick={(ev) => ev.stopPropagation()}>{e.inspectionId ?? e.relatedInspectionId}</Link>
                            : <span className="u-muted" title="Logged in Air Monitoring – no inspection at this school">Logged here</span>}
                        </td>
                        <td className="u-nowrap air-sample-cell">
                          {e.sampleId ? <span className="a-mono">{e.sampleId}</span> : <span className="u-muted">—</span>}
                          {e.labSampleId && <small title="Laboratory sample ID">{e.labSampleId}</small>}
                        </td>
                        <td>{e.schoolName}</td>
                        <td className="air-col-building">{e.buildingName}</td>
                        <td>{e.location}</td>
                        <td>{e.type}</td>
                        <td className="air-col-method">{e.method}</td>
                        <td className="air-num u-nowrap">{e.result === null ? <span className="u-muted">Pending</span> : <><strong>{e.result}</strong> <small>{e.limit.unit}</small></>}</td>
                        <td><AirStatusBadge status={e.status} /></td>
                        <td className="u-col-actions" onClick={(ev) => ev.stopPropagation()}>
                          {/* Edit: a pending logged event's fibre count, or an inspection air sample's lab result until its review
                              approves it; anything else is read only. View always opens the event. */}
                          {(() => {
                            const editable = e.inspectionId ? e.resultsEditable : e.result === null
                            const label = e.result === null ? 'Enter results' : 'Update results'
                            return (
                              <span className="air-acts">
                                <button type="button" className="n-more" disabled={!editable} aria-label={`${label} for ${e.id}`}
                                  title={editable ? label : 'Submitted – read only'}
                                  onClick={() => (e.inspectionId ? setEnteringResult({ inspectionId: e.inspectionId, materialId: e.materialId }) : setForm({ event: e }))}>
                                  <Pencil size={16} />
                                </button>
                                <button type="button" className="n-more" aria-label={`View ${e.id}`} title="View details" onClick={() => openEvent(e.id)}><Eye size={17} /></button>
                              </span>
                            )
                          })()}
                        </td>
                      </tr>
                    ))}
                    {data && !data.events.length && <tr><td colSpan={11} className="u-empty">No monitoring events match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
              {data && (
                <footer className="u-pager">
                  <span className="u-muted">Showing {from} to {to} of {data.total} events</span>
                  <nav className="u-pages" aria-label="Pagination">
                    <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
                    {pageList(data.page, data.pages).map((p, i) => (p === '…'
                      ? <span key={`gap${i}`} className="u-gap">…</span>
                      : <button key={p} type="button" className={p === data.page ? 'active' : ''} aria-current={p === data.page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
                    <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
                  </nav>
                  <div className="u-page-size">
                    <SearchSelect variant="field" label="Rows per page" value={pageSize} searchable={false}
                      onChange={(v) => { setPageSize(v); setPage(1) }} options={[10, 25, 50].map((x) => ({ value: x, label: `${x} / page` }))} />
                  </div>
                </footer>
              )}
            </section>
          </>
      </div>

      {enteringResult && (
        <SampleResultDialog {...enteringResult} onClose={() => setEnteringResult(null)}
          onSaved={(text, warn) => { setEnteringResult(null); setRefreshKey((k) => k + 1); notify(warn ? 'error' : 'success', text) }} />
      )}
      {form && meta && (
        <AirEventForm event={form.event} meta={meta} schools={schools} buildings={buildings} onClose={() => setForm(null)}
          onSaved={(saved, isNew) => {
            setForm(null)
            setRefreshKey((k) => k + 1)
            notify(saved.status === 'exceedance' ? 'error' : 'success',
              saved.result === null ? `${isNew ? 'Logged' : 'Saved'} ${saved.id} – pending until the fibre count is entered.`
                : `${saved.id} submitted${saved.status === 'exceedance' ? ' — exceedance recorded and a notification was raised.' : '.'}`)
          }} />
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
