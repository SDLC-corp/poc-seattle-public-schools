import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import {
  ShieldCheck, Download, School, CircleCheck, Clock, TriangleAlert, Search, ChevronLeft, ChevronRight,
  Ellipsis, CircleAlert, Construction, Building2, X,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import DonutChart from '../../components/charts/DonutChart'
import ComplianceByType from './ComplianceByType'
import ComplianceCalendar from './ComplianceCalendar'
import ComplianceDetails from './ComplianceDetails'
import InspectionsTab from './InspectionsTab'
import { SchoolStatusBadge } from './complianceMeta'
import { request, fmtDate } from '../../lib/api'
import { fmtDay } from './complianceUtils'
import '../Users/users.css'
import './compliance.css'

const TABS = [
  { slug: '', label: 'Compliance Overview' },
  { slug: 'inspections', label: 'Inspection Tracking' },
  { slug: 'corrective-actions', label: 'Corrective Actions' },
  { slug: 'deadlines', label: 'Regulatory Deadlines' },
  { slug: 'history', label: 'Compliance History' },
]

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
        <strong>{value ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
}

export default function Compliance() {
  const { tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)

  const [summary, setSummary] = useState(null)
  const [schoolType, setSchoolType] = useState('')
  const [table, setTable] = useState(null)
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selection, setSelection] = useState(null) // { kind: 'inspection' | 'school', id }
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  const notify = useCallback((kind, text) => setToast({ kind, text }), [])
  const select = useCallback((sel) => { setSelection(sel); setDetailsOpen(true) }, [])
  const refreshAll = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Summary refreshes after completing/rescheduling, since statuses can change
  useEffect(() => {
    let cancelled = false
    request('/compliance/summary')
      .then((s) => { if (!cancelled) { setSummary(s); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [refreshKey])

  const tableQs = new URLSearchParams({ q: debouncedQ, status, type: schoolType, page, pageSize }).toString()
  useEffect(() => {
    let cancelled = false
    request(`/compliance/schools?${tableQs}`).then((d) => { if (!cancelled) setTable(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [tableQs, refreshKey])

  if (!tab) return <Navigate to="/compliance" replace />

  const setStatusFilter = (s) => { setStatus((cur) => (cur === s ? '' : s)); setPage(1) }
  const setTypeFilter = (t) => { setSchoolType((cur) => (cur === t ? '' : t)); setPage(1) }
  const donutData = summary ? [
    { label: 'Compliant', value: summary.compliant, color: 'var(--status-good)' },
    { label: 'Due Soon', value: summary.dueSoon, color: 'var(--status-warning)' },
    { label: 'Non-Compliant', value: summary.overdue, color: 'var(--status-critical)' },
  ] : []
  const pct = (n) => (summary?.total ? `${Math.round((n / summary.total) * 100)}%` : '')
  const from = table?.total ? (table.page - 1) * table.pageSize + 1 : 0
  const to = table ? Math.min(table.total, table.page * table.pageSize) : 0
  const selectedSchoolId = selection?.kind === 'school' ? selection.id : null

  return (
    <div className={`compliance-page${detailsOpen ? ' details-open' : ''}`}>
      <div className="c-main">
        <div className="c-head">
          <div>
            <h1><ShieldCheck size={24} />Compliance &amp; Tracking</h1>
            <p>Monitor asbestos compliance status, track inspections, corrective actions, and regulatory deadlines.</p>
          </div>
          <a className="u-btn u-btn-outline" href={`/api/compliance/schools/export.csv?${new URLSearchParams({ q: debouncedQ, status, type: schoolType })}`} download>
            <Download size={15} />Export
          </a>
        </div>

        {error && <div className="u-banner">Couldn't load compliance data ({error}).</div>}

        <div className="c-kpis">
          <Kpi icon={ShieldCheck} value={summary && `${summary.compliancePct}%`} label="Compliance" sub="Overall" tone="good"
            active={false} onClick={() => setStatusFilter('')} />
          <Kpi icon={School} value={summary?.total} label="Total Schools" tone="primary" active={!status && !schoolType && tabSlug === ''}
            onClick={() => { setStatus(''); setSchoolType(''); setPage(1) }} />
          <Kpi icon={CircleCheck} value={summary?.compliant} label="Compliant" sub={pct(summary?.compliant)} tone="good"
            active={status === 'compliant'} onClick={() => setStatusFilter('compliant')} />
          <Kpi icon={Clock} value={summary?.dueSoon} label="Due Soon" sub={pct(summary?.dueSoon)} tone="warning"
            active={status === 'dueSoon'} onClick={() => setStatusFilter('dueSoon')} />
          <Kpi icon={TriangleAlert} value={summary?.overdue} label="Non-Compliant" sub={pct(summary?.overdue)} tone="critical"
            active={status === 'overdue'} onClick={() => setStatusFilter('overdue')} />
        </div>

        <nav className="u-tabs" role="tablist" aria-label="Compliance views">
          {TABS.map((t) => (
            <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
              className={`u-tab${t.slug === tabSlug ? ' active' : ''}`}
              onClick={() => navigate(t.slug ? `/compliance/${t.slug}` : '/compliance')}>
              {t.label}
            </button>
          ))}
        </nav>

        {tabSlug === '' && (
          <>
            <div className="c-overview">
              <ComplianceByType byType={summary?.byType} activeType={schoolType} onSelectType={setTypeFilter} />
              <section className="u-card card-chart c-donut-card">
                <header className="u-card-head"><h2>Compliance Status</h2></header>
                <DonutChart data={donutData} centerValue={summary ? `${summary.compliancePct}%` : '—'} centerLabel="Compliant" showCounts
                  ariaLabel="Schools by compliance status" />
              </section>
            </div>

            <section className="u-card">
              <header className="u-card-head c-table-head">
                <h2>
                  School Compliance Tracking {table && <span>({table.total})</span>}
                  {schoolType && (
                    <button type="button" className="c-chip" onClick={() => setTypeFilter(schoolType)} aria-label={`Remove ${schoolType} filter`}>
                      {schoolType} <X size={12} />
                    </button>
                  )}
                </h2>
                <div className="c-table-tools">
                  <label className="u-search">
                    <Search size={15} />
                    <input type="search" placeholder="Search school or ID…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search schools" />
                  </label>
                  <div className="c-status-select">
                    <SearchSelect variant="field" label="Compliance status" value={status} onChange={(v) => { setStatus(v); setPage(1) }} searchable={false}
                      options={[{ value: '', label: 'All Statuses' }, { value: 'compliant', label: 'Compliant' }, { value: 'dueSoon', label: 'Due Soon' }, { value: 'overdue', label: 'Non-Compliant' }]} />
                  </div>
                </div>
              </header>
              <div className="u-table-wrap">
                <table className="u-table c-table">
                  <thead>
                    <tr>
                      <th>School / Facility</th><th className="c-num">Buildings</th><th className="c-num c-col-acm">ACM Locations</th>
                      <th className="c-col-last">Last Inspection</th><th>Next Due</th><th>Compliance Status</th><th className="u-col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table?.schools.map((s) => (
                      <tr key={s.id} className={s.id === selectedSchoolId ? 'selected' : ''} onClick={() => select({ kind: 'school', id: s.id })}
                        tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') select({ kind: 'school', id: s.id }) }}>
                        <td><span className="c-school"><Building2 size={16} />{s.name}</span></td>
                        <td className="c-num">{s.buildings}</td>
                        <td className="c-num c-col-acm">{s.acmLocations}</td>
                        <td className="u-nowrap c-col-last">{fmtDate(s.lastInspection)}</td>
                        <td className="u-nowrap">{fmtDay(s.nextDue)}</td>
                        <td><SchoolStatusBadge status={s.status} /></td>
                        <td className="u-col-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="n-more" title={s.nextInspectionId ? 'Open next inspection' : 'Open school details'}
                            aria-label={`Open next inspection for ${s.name}`}
                            onClick={() => select(s.nextInspectionId ? { kind: 'inspection', id: s.nextInspectionId } : { kind: 'school', id: s.id })}>
                            <Ellipsis size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {table && !table.schools.length && <tr><td colSpan={7} className="u-empty">No schools match.</td></tr>}
                  </tbody>
                </table>
              </div>
              {table && (
                <footer className="u-pager">
                  <span className="u-muted">Showing {from} to {to} of {table.total} schools</span>
                  <nav className="u-pages" aria-label="Pagination">
                    <button type="button" disabled={table.page <= 1} onClick={() => setPage(table.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
                    {pageList(table.page, table.pages).map((p, i) => (p === '…'
                      ? <span key={`gap${i}`} className="u-gap">…</span>
                      : <button key={p} type="button" className={p === table.page ? 'active' : ''} aria-current={p === table.page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
                    <button type="button" disabled={table.page >= table.pages} onClick={() => setPage(table.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
                  </nav>
                  <div className="u-page-size">
                    <SearchSelect variant="field" label="Rows per page" value={pageSize} searchable={false}
                      onChange={(v) => { setPageSize(v); setPage(1) }} options={[5, 10, 25].map((x) => ({ value: x, label: `${x} / page` }))} />
                  </div>
                </footer>
              )}
            </section>
          </>
        )}

        {tabSlug === 'inspections' && <InspectionsTab preset="tracking" refreshKey={refreshKey} selectedId={selection?.id} onSelect={(id) => select({ kind: 'inspection', id })} />}
        {tabSlug === 'deadlines' && <InspectionsTab preset="deadlines" refreshKey={refreshKey} selectedId={selection?.id} onSelect={(id) => select({ kind: 'inspection', id })} />}
        {tabSlug === 'history' && <InspectionsTab preset="history" refreshKey={refreshKey} selectedId={selection?.id} onSelect={(id) => select({ kind: 'inspection', id })} />}
        {tabSlug === 'corrective-actions' && (
          <div className="u-card u-placeholder">
            <Construction size={28} />
            <strong>Corrective Actions</strong>
            <span>Corrective actions come from the Response Actions module, which hasn't been built yet.</span>
          </div>
        )}
      </div>

      <ComplianceCalendar refreshKey={refreshKey} selectedInspectionId={selection?.kind === 'inspection' ? selection.id : null}
        onSelectInspection={(id) => select({ kind: 'inspection', id })} />

      <div className="u-drawer-backdrop" onClick={() => setDetailsOpen(false)} />
      <ComplianceDetails selection={selection} refreshKey={refreshKey} onSelect={select}
        onClose={() => { setSelection(null); setDetailsOpen(false) }} onChanged={refreshAll} notify={notify} />

      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
