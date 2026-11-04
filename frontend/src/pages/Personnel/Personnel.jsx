import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { UsersRound, CircleCheck, Search, RotateCcw, Eye, Award, CircleAlert } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import PersonDrawer from './PersonDrawer'
import { TrainingStatus, CategoryBadge, personStatus } from './personnelMeta'
import { Pager, TrainingTab, SchoolComplianceTab } from './PersonnelTabs'
import { request } from '../../lib/api'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './personnel.css'

const TABS = [
  { slug: '', label: 'Training' },
  { slug: 'people', label: 'People (Personnel)' },
  { slug: 'schools', label: 'School Compliance' },
]
// Earlier tab links still land on the matching tab
const OLD_TABS = { training: '', programs: '', records: 'people', certifications: 'people', summary: 'schools' }
const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')

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
  const [drawerUpdate, setDrawerUpdate] = useState(false) // open on the certificate form: true, or the record to update
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
  const openPerson = (id, update = false) => { setDrawerUpdate(update); setDrawerId(id) }

  if (!tab) return <Navigate to={OLD_TABS[tabSlug] ? `/personnel/${OLD_TABS[tabSlug]}` : '/personnel'} replace />

  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }
  const filtersActive = query || viewSchool || filters.kind || filters.status
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <div className="personnel-page">
      <div className="c-head p-head">
        <div>
          <h1><UsersRound size={24} />Personnel, Training &amp; Certifications</h1>
          <p>Manage district employees, contractors, and inspectors, along with their training records and certifications.</p>
        </div>
      </div>

      {error && <div className="u-banner">Couldn't load personnel ({error}).</div>}

      <nav className="u-tabs" role="tablist" aria-label="Personnel views">
        {TABS.map((t) => (
          <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
            className={`u-tab${t.slug === tabSlug ? ' active' : ''}`} onClick={() => navigate(t.slug ? `/personnel/${t.slug}` : '/personnel')}>{t.label}</button>
        ))}
      </nav>

      {tabSlug === 'people' && (
        <section className="u-card">
          <div className="p-filters p-filters-people">
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder="Search by name, ID or organization" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search personnel" />
            </label>
            <label className="p-inline"><span>School:</span>
              <SearchSelect variant="field" label="School" value={viewSchool} onChange={(v) => { setViewSchool(v); setPage(1) }} searchPlaceholder="Search schools…"
                options={[{ value: '', label: 'All Schools' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
            </label>
            <label className="p-inline"><span>Role:</span>
              <SearchSelect variant="field" label="Role" value={filters.kind} onChange={setFilter('kind')} searchable={false}
                options={[{ value: '', label: 'All Roles' }, { value: 'Employee', label: 'Employees' }, { value: 'Contractor', label: 'Contractors' }, { value: 'Inspector', label: 'Inspectors' }]} />
            </label>
            <label className="p-inline"><span>Status:</span>
              <SearchSelect variant="field" label="Status" value={filters.status} onChange={setFilter('status')} searchable={false}
                options={[
                  { value: '', label: 'All Statuses' }, { value: 'certified', label: 'Compliant' },
                  { value: 'dueSoon', label: 'Due Soon' }, { value: 'notCertified', label: 'Not Certified' }, { value: 'overdue', label: 'Overdue' },
                ]} />
            </label>
            <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive} onClick={() => { setFilters({ kind: '', status: '' }); setViewSchool(''); setQuery(''); setPage(1) }}>
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
                    <tr key={p.id} onClick={() => openPerson(p.id)}>
                      <td><strong className="p-name">{p.name}</strong><small className="p-sub">{p.id}{p.schoolName ? ` · ${p.schoolName}` : ''}</small></td>
                      <td><CategoryBadge person={p} /></td>
                      <td className="p-col-org">{p.organization}</td>
                      <td>{p.requiredTraining}</td>
                      <td className="u-nowrap p-col-last">{fmt(p.lastTraining)}</td>
                      <td className="u-nowrap">{fmt(p.nextExpiry)}</td>
                      <td title={gaps.join('\n') || 'All required training is current'}><TrainingStatus status={personStatus(p)} />
                        {gaps.length > 0 && <small className="p-gap">{gaps[0]}{gaps.length > 1 ? ` +${gaps.length - 1}` : ''}</small>}
                      </td>
                      <td className="p-col-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="u-row-btn" aria-label={`View ${p.name}`} title="View" onClick={() => openPerson(p.id)}><Eye size={15} /></button>
                        <button type="button" className="u-row-btn" aria-label={`Update certificate for ${p.name}`} title="Update certificate" onClick={() => openPerson(p.id, true)}><Award size={15} /></button>
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

      {tabSlug === '' && meta && <TrainingTab meta={meta} summary={summary} notify={notify} />}
      {tabSlug === 'schools' && <SchoolComplianceTab refreshKey={refreshKey} onOpenPerson={openPerson} />}

      {drawerId && meta && (
        <PersonDrawer key={drawerId} personId={drawerId} meta={meta} startOnForm={drawerUpdate} onClose={() => setDrawerId(null)} onChanged={refresh} notify={notify} />
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
