import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import {
  History, Download, Search, ChevronLeft, ChevronRight, ArrowDown, ArrowUp, UsersRound, FilePlus2,
  FilePen, Trash2, RotateCcw,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import AuditDetails from './AuditDetails'
import { ActionBadge } from './ActionBadge'
import { request, initials, fmtDateTime, API_BASE } from '../../lib/api'
import './audit.css'

// URL tab → server-side action group
const TABS = [
  { id: 'activity', path: '/audit', label: 'Activity Logs', group: '' },
  { id: 'changes', path: '/audit/changes', label: 'Data Change History', group: 'data' },
  { id: 'logins', path: '/audit/logins', label: 'Login History', group: 'login' },
  { id: 'exports', path: '/audit/exports', label: 'Export History', group: 'export' },
]

const DAY = 86400000
const isoDate = (d) => new Date(d - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const RANGES = [
  { value: '1', label: 'Today', days: 1 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: 'all', label: 'All time', days: null },
]
const ACTION_LABEL = {
  create: 'Create', update: 'Update', delete: 'Delete', login: 'Sign in', logout: 'Sign out',
  login_failed: 'Failed sign-in', export: 'Export',
}
const DEFAULTS = { range: '90', user: '', module: '', action: '', q: '' }

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

function Kpi({ icon: Icon, value, label, sub, tone }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <div className="kpi-text">
        <strong>{value?.toLocaleString('en-US') ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

export default function AuditLogs() {
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => (tabParam ? t.path === `/audit/${tabParam}` : t.id === 'activity'))

  const [filters, setFilters] = useState(DEFAULTS)
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sort, setSort] = useState('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [facets, setFacets] = useState({ users: [], modules: [] })
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // "Today" is fixed when the page opens so date ranges stay stable across renders
  const [now] = useState(() => Date.now())

  const setFilter = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  useEffect(() => {
    request('/audit/facets').then(setFacets).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(filters.q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [filters.q])

  const range = RANGES.find((r) => r.value === filters.range)
  const query = useMemo(() => {
    const p = new URLSearchParams({
      group: tab?.group ?? '', user: filters.user, module: filters.module, action: filters.action,
      q: debouncedQ, sort, page, pageSize,
    })
    if (range?.days) {
      p.set('from', isoDate(now - (range.days - 1) * DAY))
      p.set('to', isoDate(now))
    }
    return p
  }, [tab, filters.user, filters.module, filters.action, debouncedQ, sort, page, pageSize, range, now])
  const qs = query.toString()

  useEffect(() => {
    let cancelled = false
    request(`/audit?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [qs, refreshKey])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    request(`/audit/${selectedId}`).then((e) => { if (!cancelled) setDetail(e) }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedId])
  const selected = detail?.id === selectedId ? detail : null

  if (!tab) return <Navigate to="/audit" replace />

  const exportParams = new URLSearchParams(query)
  ;['page', 'pageSize', 'sort'].forEach((k) => exportParams.delete(k))
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULTS)
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0
  const rangeLabel = range?.days ? range.label : 'All time'

  return (
    <div className={`audit-page${selected ? ' with-details' : ''}`}>
      <div className="a-main">
        <div className="a-head">
          <div>
            <h1><History size={22} />Audit Logs</h1>
            <p>Track system activities, data changes, and user actions for compliance and security.</p>
          </div>
          {/* The export is itself audited, so refresh shortly after to show its entry */}
          <a className="u-btn u-btn-outline" href={`${API_BASE}/audit/export.csv?${exportParams}`} download
            onClick={() => setTimeout(() => setRefreshKey((k) => k + 1), 800)}>
            <Download size={15} />Export
          </a>
        </div>

        <div className="a-kpis">
          <Kpi icon={UsersRound} value={data?.stats.total} label="Total Activities" sub={rangeLabel} tone="primary" />
          <Kpi icon={FilePlus2} value={data?.stats.create} label="Create Actions" tone="good" />
          <Kpi icon={FilePen} value={data?.stats.update} label="Update Actions" tone="warning" />
          <Kpi icon={Trash2} value={data?.stats.delete} label="Delete Actions" tone="critical" />
        </div>

        <nav className="u-tabs" role="tablist" aria-label="Audit log views">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab.id === t.id}
              className={`u-tab${tab.id === t.id ? ' active' : ''}`}
              onClick={() => { navigate(t.path); setPage(1) }}>
              {t.label}
            </button>
          ))}
        </nav>

        <section className="u-card">
          <div className="a-filters">
            <div className="a-field">
              <span>Date Range</span>
              <SearchSelect variant="field" label="Date range" value={filters.range} onChange={setFilter('range')} searchable={false}
                options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            </div>
            <div className="a-field">
              <span>User</span>
              <SearchSelect variant="field" label="User" value={filters.user} onChange={setFilter('user')} searchPlaceholder="Search users…"
                options={[{ value: '', label: 'All Users' }, ...facets.users.map((u) => ({ value: u.id, label: u.name }))]} />
            </div>
            <div className="a-field">
              <span>Module</span>
              <SearchSelect variant="field" label="Module" value={filters.module} onChange={setFilter('module')}
                options={[{ value: '', label: 'All Modules' }, ...facets.modules.map((m) => ({ value: m, label: m }))]} />
            </div>
            <div className="a-field">
              <span>Action</span>
              <SearchSelect variant="field" label="Action" value={filters.action} onChange={setFilter('action')} searchable={false}
                options={[{ value: '', label: 'All Actions' }, ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))]} />
            </div>
            <div className="a-field a-search-field">
              <span>Search</span>
              <label className="u-search">
                <Search size={15} />
                <input type="search" placeholder="Search by details, record ID…" value={filters.q}
                  onChange={(e) => setFilter('q')(e.target.value)} aria-label="Search audit logs" />
              </label>
            </div>
            <button type="button" className="u-btn u-btn-outline a-reset" disabled={!filtersActive}
              onClick={() => { setFilters(DEFAULTS); setDebouncedQ(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>

          {error && <div className="u-banner">Couldn't load audit logs ({error}).</div>}

          <div className="u-table-wrap">
            <table className="u-table a-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="a-sort" onClick={() => { setSort((s) => (s === 'desc' ? 'asc' : 'desc')); setPage(1) }}
                      aria-label={`Sort by date ${sort === 'desc' ? 'oldest first' : 'newest first'}`}>
                      Date &amp; Time {sort === 'desc' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                    </button>
                  </th>
                  <th>User</th><th>Action</th><th>Module</th><th>Record / Reference</th><th>Details</th>
                  <th className="a-col-ip">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((e) => (
                  <tr key={e.id} className={e.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(e.id)}
                    tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') setSelectedId(e.id) }}>
                    <td className="u-nowrap">{fmtDateTime(e.at)}</td>
                    <td>
                      <span className="u-person">
                        <span className="u-avatar">{initials(e.user.name)}</span>
                        <span className="a-user">{e.user.name}</span>
                      </span>
                    </td>
                    <td><ActionBadge action={e.action} /></td>
                    <td className="u-nowrap">{e.module}</td>
                    <td className="u-nowrap a-mono">{e.recordId}</td>
                    <td className="a-details-cell">{e.summary}</td>
                    <td className="u-nowrap a-mono a-col-ip">{e.ip}</td>
                  </tr>
                ))}
                {data && !data.entries.length && (
                  <tr><td colSpan={7} className="u-empty">No activity matches these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <footer className="u-pager">
              <span className="u-muted">Showing {from} to {to} of {data.total.toLocaleString('en-US')} logs</span>
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

      {selected && <AuditDetails entry={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
