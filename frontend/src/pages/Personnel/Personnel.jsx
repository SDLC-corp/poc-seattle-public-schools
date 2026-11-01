import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import {
  UsersRound, CircleCheck, CalendarClock, TriangleAlert, GraduationCap, Plus, Search, RotateCcw, Eye, Pencil,
  ChevronLeft, ChevronRight, CircleAlert, BadgeCheck,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import PersonDrawer from './PersonDrawer'
import PersonForm from './PersonForm'
import HelpLearning from '../Help/HelpLearning'
import { TrainingStatus, CategoryBadge } from './personnelMeta'
import { request } from '../../lib/api'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './personnel.css'

const TABS = [
  { slug: '', label: 'People (Personnel)' },
  { slug: 'programs', label: 'Training Programs' },
  { slug: 'records', label: 'Training Records' },
  { slug: 'certifications', label: 'Certifications' },
  { slug: 'summary', label: 'Compliance Summary' },
]
const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')

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

function Pager({ page, pages, total, from, to, onPage, label }) {
  return (
    <footer className="u-pager">
      <span className="u-muted">{total ? `Showing ${from} to ${to} of ${total} ${label}` : `No ${label}`}</span>
      <nav className="u-pages" aria-label="Pagination">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
        <span className="u-gap">Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
      </nav>
    </footer>
  )
}

// Training Records / Certifications tabs: flat list of records (client-side paging)
function RecordsTab({ meta, accredited, refreshKey, onOpenPerson }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [programId, setProgramId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    request(`/personnel/records${accredited ? '?accredited=true' : ''}`).then((d) => { if (!cancelled) setRows(d.records) }).catch(() => {})
    return () => { cancelled = true }
  }, [accredited, refreshKey])

  const term = q.trim().toLowerCase()
  const filtered = (rows ?? []).filter((r) => (!programId || r.programId === programId) && (!status || r.status === status)
    && (!term || [r.personName, r.programName, r.certificateNo, r.organization].some((v) => v?.toLowerCase().includes(term))))
  const pageSize = 12
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize)
  const programs = meta.programs.filter((p) => !accredited || p.accredited)

  return (
    <section className="u-card">
      <div className="p-filters p-filters-3">
        <label className="u-search"><Search size={15} />
          <input type="search" placeholder="Search person, program or certificate…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} aria-label="Search records" />
        </label>
        <SearchSelect variant="field" label="Program" value={programId} onChange={(v) => { setProgramId(v); setPage(1) }} searchable={false}
          options={[{ value: '', label: 'All Programs' }, ...programs.map((p) => ({ value: p.id, label: p.name }))]} />
        <SearchSelect variant="field" label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1) }} searchable={false}
          options={[{ value: '', label: 'All Status' }, { value: 'valid', label: 'Valid' }, { value: 'dueSoon', label: 'Due Soon' }, { value: 'expired', label: 'Expired' }]} />
      </div>
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead><tr><th>Person</th><th>Program</th><th>Completed</th><th>Expires</th>{accredited && <th>Certificate No.</th>}<th className="p-col-provider">Provider</th><th>Status</th></tr></thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={`${r.personId}${r.programId}${r.completedOn}${i}`} onClick={() => onOpenPerson(r.personId)}>
                <td><strong className="p-name">{r.personName}</strong><small className="p-sub">{r.categoryLabel}</small></td>
                <td>{r.programName}</td>
                <td className="u-nowrap">{fmt(r.completedOn)}</td>
                <td className="u-nowrap">{r.expiresOn ? fmt(r.expiresOn) : 'No expiry'}</td>
                {accredited && <td className="a-mono">{r.certificateNo ?? '—'}</td>}
                <td className="p-col-provider">{r.provider ?? '—'}</td>
                <td><TrainingStatus status={r.status} /></td>
              </tr>
            ))}
            {rows && !visible.length && <tr><td colSpan={7} className="u-empty">No records match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={current} pages={pages} total={filtered.length} from={(current - 1) * pageSize + 1} to={Math.min(filtered.length, current * pageSize)} onPage={setPage} label="records" />
    </section>
  )
}

function ProgramsTab({ meta, summary }) {
  const byProgram = Object.fromEntries((summary?.byProgram ?? []).map((p) => [p.id, p]))
  return (
    <section className="u-card">
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead><tr><th>Program</th><th className="c-num">Hours</th><th>Renewal</th><th>Required For</th><th className="c-num">Current</th><th className="c-num">Due Soon</th><th className="c-num">Lapsed / Missing</th></tr></thead>
          <tbody>
            {meta.programs.map((p) => {
              const s = byProgram[p.id]
              return (
                <tr key={p.id}>
                  <td>
                    <strong className="p-name">{p.name}{p.accredited && <BadgeCheck size={14} className="p-acc" aria-label="EPA accredited discipline" />}</strong>
                    <small className="p-sub">{p.basis}</small>
                  </td>
                  <td className="c-num">{p.hours}</td>
                  <td className="u-nowrap">{p.renewalMonths ? `Every ${p.renewalMonths} months` : 'No expiry'}</td>
                  <td>{meta.categories.filter((c) => c.required.includes(p.id)).map((c) => c.label).join(', ') || '—'}</td>
                  <td className="c-num">{s?.valid ?? '—'}</td>
                  <td className="c-num">{s?.dueSoon ?? '—'}</td>
                  <td className={`c-num${s?.lapsed ? ' p-bad' : ''}`}>{s?.lapsed ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SummaryTab({ summary }) {
  if (!summary) return <section className="u-card"><p className="u-muted">Loading…</p></section>
  return (
    <section className="u-card">
      <header className="u-card-head"><h2>Training Compliance by Category</h2></header>
      <ul className="c-bt-legend" aria-hidden="true">
        <li><i className="c-bt-swatch good" />Compliant</li><li><i className="c-bt-swatch warn" />Due Soon</li><li><i className="c-bt-swatch crit" />Expired / Missing</li>
      </ul>
      <ul className="c-bt-rows">
        {summary.byCategory.filter((c) => c.total).map((c) => (
          <li key={c.id}>
            <div className="c-bt-row p-bt-row" aria-label={`${c.label}: ${c.compliant} compliant, ${c.dueSoon} due soon, ${c.expired} expired of ${c.total}`}>
              <span className="c-bt-name">{c.label}<small>{c.total} people</small></span>
              <span className="c-bt-bar">
                {[['compliant', 'good'], ['dueSoon', 'warn'], ['expired', 'crit']].map(([k, cls]) => c[k] > 0 && (
                  <span key={k} className={`c-bt-seg ${cls}`} style={{ flexGrow: c[k] }}>{c[k]}</span>
                ))}
              </span>
              <span className="c-bt-pct">{Math.round((c.compliant / c.total) * 100)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Personnel() {
  const { tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)

  const [meta, setMeta] = useState(null)
  const [schools, setSchools] = useState([])
  const [viewSchool, setViewSchool] = useState('')
  const [filters, setFilters] = useState({ kind: '', status: '' })
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [drawerId, setDrawerId] = useState(null)
  const [form, setForm] = useState(null)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([request('/personnel/meta'), request('/schools')])
      .then(([m, s]) => { setMeta(m); setSchools(s.schools) })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const qs = new URLSearchParams({ q: debouncedQ, kind: filters.kind, status: filters.status, school: viewSchool, page, pageSize: 10 }).toString()
  useEffect(() => {
    let cancelled = false
    request(`/personnel?${qs}`).then((d) => { if (!cancelled) { setData(d); setError(null) } }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [qs, refreshKey])

  useEffect(() => {
    let cancelled = false
    request('/personnel/summary').then((d) => { if (!cancelled) setSummary(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [refreshKey])

  const notify = useCallback((kind, text) => setToast({ kind, text }), [])
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  if (!tab) return <Navigate to="/personnel" replace />

  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }
  const statusKpi = (s) => ({
    active: tabSlug === '' && filters.status === s,
    onClick: () => { navigate('/personnel'); setFilter('status')(filters.status === s ? '' : s) },
  })
  const stats = data?.stats
  const filtersActive = query || filters.kind || filters.status
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <div className="personnel-page">
      <div className="c-head p-head">
        <div>
          <h1><UsersRound size={24} />Personnel, Training &amp; Certifications</h1>
          <p>Manage district employees, contractors, and inspectors, along with their training records and certifications.</p>
        </div>
        <div className="p-head-actions">
          <label className="p-viewby">
            <span>View By:</span>
            <SearchSelect variant="field" label="View by school" value={viewSchool} onChange={(v) => { setViewSchool(v); setPage(1) }} searchPlaceholder="Search schools…"
              options={[{ value: '', label: 'District (All Schools)' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
          </label>
          <button type="button" className="u-btn u-btn-primary" disabled={!meta} onClick={() => setForm({})}><Plus size={16} />Add Person</button>
        </div>
      </div>

      {error && <div className="u-banner">Couldn't load personnel ({error}).</div>}

      <div className="p-kpis">
        <Kpi icon={UsersRound} value={stats?.total} label="Total Personnel" tone="primary" active={tabSlug === '' && !filters.status}
          onClick={() => { navigate('/personnel'); setFilter('status')('') }} />
        <Kpi icon={CircleCheck} value={stats?.compliant} label="Training Compliant" tone="good" {...statusKpi('compliant')} />
        <Kpi icon={CalendarClock} value={stats?.dueSoon} label="Due Soon" sub={`Next ${meta?.dueSoonDays ?? 60} days`} tone="warning" {...statusKpi('dueSoon')} />
        <Kpi icon={TriangleAlert} value={stats?.expired} label="Expired" sub="or missing" tone="critical" {...statusKpi('expired')} />
        <Kpi icon={GraduationCap} value={stats?.programs} label="Training Programs" tone="teal" active={tabSlug === 'programs'} onClick={() => navigate('/personnel/programs')} />
      </div>

      <nav className="u-tabs" role="tablist" aria-label="Personnel views">
        {TABS.map((t) => (
          <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
            className={`u-tab${t.slug === tabSlug ? ' active' : ''}`} onClick={() => navigate(t.slug ? `/personnel/${t.slug}` : '/personnel')}>{t.label}</button>
        ))}
      </nav>

      {tabSlug === '' && (
        <section className="u-card">
          <div className="p-filters">
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder="Search by name, ID or organization" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search personnel" />
            </label>
            <label className="p-inline"><span>Role:</span>
              <SearchSelect variant="field" label="Role" value={filters.kind} onChange={setFilter('kind')} searchable={false}
                options={[{ value: '', label: 'All Roles' }, { value: 'Employee', label: 'Employees' }, { value: 'Contractor', label: 'Contractors' }, { value: 'Inspector', label: 'Inspectors' }]} />
            </label>
            <label className="p-inline"><span>Training Status:</span>
              <SearchSelect variant="field" label="Training status" value={filters.status} onChange={setFilter('status')} searchable={false}
                options={[{ value: '', label: 'All' }, { value: 'compliant', label: 'Compliant' }, { value: 'dueSoon', label: 'Due Soon' }, { value: 'expired', label: 'Expired' }]} />
            </label>
            <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive} onClick={() => { setFilters({ kind: '', status: '' }); setQuery(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>
          <div className="u-table-wrap">
            <table className="u-table c-table p-table">
              <thead>
                <tr>
                  <th>Name</th><th>Role / Category</th><th className="p-col-org">Organization</th><th>Required Training</th>
                  <th className="p-col-last">Last Training</th><th>Expiry / Renewal</th><th>Status</th><th className="p-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.people.map((p) => {
                  const gaps = p.required.filter((r) => r.status !== 'valid').map((r) => `${r.programName}: ${r.status === 'missing' ? 'missing' : r.status === 'dueSoon' ? 'due soon' : 'expired'}`)
                  return (
                    <tr key={p.id} onClick={() => setDrawerId(p.id)}>
                      <td><strong className="p-name">{p.name}</strong><small className="p-sub">{p.id}{p.schoolName ? ` · ${p.schoolName}` : ''}</small></td>
                      <td><CategoryBadge person={p} /></td>
                      <td className="p-col-org">{p.organization}</td>
                      <td>{p.requiredTraining}</td>
                      <td className="u-nowrap p-col-last">{fmt(p.lastTraining)}</td>
                      <td className="u-nowrap">{fmt(p.nextExpiry)}</td>
                      <td title={gaps.join('\n') || 'All required training is current'}><TrainingStatus status={p.trainingStatus} />
                        {gaps.length > 0 && <small className="p-gap">{gaps[0]}{gaps.length > 1 ? ` +${gaps.length - 1}` : ''}</small>}
                      </td>
                      <td className="p-col-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="u-row-btn" aria-label={`View ${p.name}`} onClick={() => setDrawerId(p.id)}><Eye size={15} /></button>
                        <button type="button" className="u-row-btn" aria-label={`Edit ${p.name}`} onClick={() => setForm({ person: p })}><Pencil size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
                {data && !data.people.length && <tr><td colSpan={8} className="u-empty">No personnel match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {data && <Pager page={data.page} pages={data.pages} total={data.total} from={from} to={to} onPage={setPage} label="people" />}
        </section>
      )}

      {tabSlug === 'programs' && meta && <ProgramsTab meta={meta} summary={summary} />}
      {tabSlug === 'records' && meta && <RecordsTab meta={meta} refreshKey={refreshKey} onOpenPerson={setDrawerId} />}
      {tabSlug === 'certifications' && meta && <RecordsTab meta={meta} accredited refreshKey={refreshKey} onOpenPerson={setDrawerId} />}
      {tabSlug === 'summary' && <SummaryTab summary={summary} />}

      <HelpLearning />

      {drawerId && meta && (
        <PersonDrawer personId={drawerId} meta={meta} onClose={() => setDrawerId(null)} onChanged={refresh} notify={notify}
          onEdit={(p) => setForm({ person: p })} />
      )}
      {form && meta && (
        <PersonForm person={form.person} meta={meta} schools={schools} onClose={() => setForm(null)}
          onSaved={(saved, isNew) => {
            setForm(null)
            refresh()
            notify('success', isNew ? `Added ${saved.name}. Record their training to make them compliant.` : `Updated ${saved.name}.`)
            if (isNew) setDrawerId(saved.id)
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
