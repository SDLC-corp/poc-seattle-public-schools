import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import {
  Wind, CircleCheck, TriangleAlert, Clock, Plus, Download, Search, ChevronLeft, ChevronRight, RotateCcw,
  Ellipsis, CircleAlert, Construction,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import DonutChart from '../../components/charts/DonutChart'
import AirTrendChart from './AirTrendChart'
import AirEventForm from './AirEventForm'
import AirDetails from './AirDetails'
import { AirStatusBadge } from './airMeta'
import { request } from '../../lib/api'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './air.css'

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'events', label: 'Monitoring Events' },
  { slug: 'exceedances', label: 'Exceedances' },
  { slug: 'contractors', label: 'Contractors' },
  { slug: 'reports', label: 'Reports' },
]
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

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
      </span>
    </button>
  )
}

export default function AirMonitoring() {
  const { tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)

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
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [form, setForm] = useState(null) // { event? }
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
      setSelectedId((id) => (d.events.some((e) => e.id === id) ? id : d.events[0]?.id ?? null))
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

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    request(`/air-monitoring/${selectedId}`).then((d) => { if (!cancelled) setDetail(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedId, refreshKey])
  const selected = detail?.id === selectedId ? detail : null

  const notify = useCallback((kind, text) => setToast({ kind, text }), [])

  if (!tab) return <Navigate to="/air-monitoring" replace />

  const setFilter = (k) => (v) => {
    setFilters((f) => ({ ...f, [k]: v, ...(k === 'school' ? { building: '' } : {}) }))
    setPage(1)
  }
  const statusKpi = (s) => ({
    active: tabSlug !== 'exceedances' && filters.status === s,
    onClick: () => { if (tabSlug === 'exceedances') navigate('/air-monitoring'); setFilter('status')(filters.status === s ? '' : s) },
  })
  const filtersActive = query || JSON.stringify(filters) !== JSON.stringify(DEFAULTS)
  const schoolBuildings = buildings.filter((b) => b.schoolId === filters.school)
  const stats = data?.stats
  const pct = (n) => (stats?.total ? ` (${Math.round((n / stats.total) * 100)}%)` : '')
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0
  const placeholder = tabSlug === 'contractors' || tabSlug === 'reports'

  return (
    <div className={`air-page${detailsOpen ? ' details-open' : ''}`}>
      <div className="air-main">
        <div className="c-head">
          <div>
            <h1><Wind size={22} />Air Monitoring</h1>
            <p>Manage air monitoring activities, results and compliance for asbestos projects.</p>
          </div>
          <button type="button" className="u-btn u-btn-primary" disabled={!meta} onClick={() => setForm({})}>
            <Plus size={16} />Log Air Monitoring
          </button>
        </div>

        <nav className="u-tabs" role="tablist" aria-label="Air monitoring views">
          {TABS.map((t) => (
            <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
              className={`u-tab${t.slug === tabSlug ? ' active' : ''}`}
              onClick={() => navigate(t.slug ? `/air-monitoring/${t.slug}` : '/air-monitoring')}>{t.label}</button>
          ))}
        </nav>

        {placeholder ? (
          <div className="u-card u-placeholder">
            <Construction size={28} />
            <strong>{tab.label}</strong>
            <span>This view hasn't been built yet. Monitoring events and exceedances are available now.</span>
          </div>
        ) : (
          <>
            <div className="air-kpis">
              <Kpi icon={Wind} value={stats?.total} label="Total Monitoring Events" tone="primary"
                active={!filters.status && tabSlug !== 'exceedances'} onClick={() => { setFilter('status')(''); if (tabSlug === 'exceedances') navigate('/air-monitoring') }} />
              <Kpi icon={CircleCheck} value={stats?.compliant} label={`Compliant Results${pct(stats?.compliant ?? 0)}`} tone="good" {...statusKpi('compliant')} />
              <Kpi icon={TriangleAlert} value={stats?.exceedance} label={`Exceedance / Action${pct(stats?.exceedance ?? 0)}`} tone="critical"
                active={tabSlug === 'exceedances' || filters.status === 'exceedance'}
                onClick={() => (tabSlug === 'exceedances' ? navigate('/air-monitoring') : setFilter('status')(filters.status === 'exceedance' ? '' : 'exceedance'))} />
              <Kpi icon={Clock} value={stats?.pending} label={`Pending Results${pct(stats?.pending ?? 0)}`} tone="warning" {...statusKpi('pending')} />
            </div>

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
                    <input type="search" placeholder="Search by school, building, room or project…" value={query}
                      onChange={(e) => setQuery(e.target.value)} aria-label="Search monitoring events" />
                  </label>
                  <a className="u-btn u-btn-outline" href={`/api/air-monitoring/export.csv?${baseParams}`} download><Download size={15} />Export</a>
                </div>
              </header>
              <div className="u-table-wrap">
                <table className="u-table c-table air-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>School</th><th className="air-col-building">Building</th><th>Location / Room</th><th>Type</th>
                      <th className="air-col-method">Method</th><th className="air-num">Result</th><th>Status</th><th className="u-col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.events.map((e) => (
                      <tr key={e.id} className={e.id === selectedId ? 'selected' : ''} onClick={() => { setSelectedId(e.id); setDetailsOpen(true) }}
                        tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') { setSelectedId(e.id); setDetailsOpen(true) } }}>
                        <td className="u-nowrap">{fmtDate(e.sampledAt)}</td>
                        <td>{e.schoolName}</td>
                        <td className="air-col-building">{e.buildingName}</td>
                        <td>{e.location}</td>
                        <td>{e.type}</td>
                        <td className="air-col-method">{e.method}</td>
                        <td className="air-num u-nowrap">{e.result === null ? '—' : <>{e.result} <small>{e.limit.unit}</small></>}</td>
                        <td><AirStatusBadge status={e.status} /></td>
                        <td className="u-col-actions" onClick={(ev) => ev.stopPropagation()}>
                          <button type="button" className="n-more" aria-label={`Edit ${e.id}`} title={e.result === null ? 'Enter result' : 'Edit'}
                            onClick={() => setForm({ event: e })}><Ellipsis size={18} /></button>
                        </td>
                      </tr>
                    ))}
                    {data && !data.events.length && <tr><td colSpan={9} className="u-empty">No monitoring events match these filters.</td></tr>}
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
        )}
      </div>

      {!placeholder && (
        <>
          <div className="u-drawer-backdrop" onClick={() => setDetailsOpen(false)} />
          <AirDetails event={selected} onEdit={() => selected && setForm({ event: selected })} onClose={() => setDetailsOpen(false)} />
        </>
      )}

      {form && meta && (
        <AirEventForm event={form.event} meta={meta} schools={schools} buildings={buildings} onClose={() => setForm(null)}
          onSaved={(saved, isNew) => {
            setForm(null)
            setSelectedId(saved.id)
            setRefreshKey((k) => k + 1)
            notify(saved.status === 'exceedance' ? 'error' : 'success',
              `${isNew ? 'Logged' : 'Updated'} ${saved.id}${saved.status === 'exceedance' ? ' — exceedance recorded and a notification was raised.' : '.'}`)
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
