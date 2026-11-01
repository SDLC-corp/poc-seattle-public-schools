import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  School, ChevronRight, ArrowLeft, Plus, Search, MapPin, Phone, Mail, Globe, ExternalLink, ShieldCheck,
  CalendarDays, CircleCheck, CircleAlert, Info, SearchX,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { SchoolStatusBadge, InspectionStatusBadge } from '../Compliance/complianceMeta'
import { request, fmtDate } from '../../lib/api'
import { AcmBadge, BuildingKpis, BuildingsTable, BuildingDetails } from './BuildingParts'
import BuildingForm from './BuildingForm'
import { InspectionTable, DocumentsCard } from './FacilityTabs'
import { ACM_FILTERS, buildingTotals, fmtNum, PRESUMED_ACM_BEFORE } from './buildingUtils'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'

const TABS = [
  { slug: '', label: 'Overview' },
  { slug: 'buildings', label: 'Buildings' },
  { slug: 'acm', label: 'ACM Summary' },
  { slug: 'inspections', label: 'Inspections' },
  { slug: 'surveillance', label: 'Surveillance' },
  { slug: 'compliance', label: 'Compliance' },
  { slug: 'documents', label: 'Documents' },
]
const SURVEILLANCE = '6-Month Surveillance'

const cleanPrincipal = (p) => (p ? p.replace(/^(interim\s+)?principal\s*:?\s*/i, '').trim() : '')
const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')

function Overview({ school: s, buildings, compliance, nextOpen }) {
  const t = buildingTotals(buildings)
  return (
    <div className="sd-grid">
      <section className="u-card">
        <header className="u-card-head"><h2>School Information</h2></header>
        <dl className="cd-facts sd-facts">
          <div className="cd-row"><dt>Type</dt><dd>{s.type}{s.category ? ` · ${s.category}` : ''}</dd></div>
          <div className="cd-row"><dt><MapPin size={13} /> Address</dt><dd>{s.address.full}</dd></div>
          <div className="cd-row"><dt><Phone size={13} /> Main Office</dt><dd>{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : '—'}</dd></div>
          <div className="cd-row"><dt>{s.principalTitle ?? 'Principal'}</dt><dd>{cleanPrincipal(s.principal) || '—'}</dd></div>
          {s.principalEmail && <div className="cd-row"><dt><Mail size={13} /> Email</dt><dd><a href={`mailto:${s.principalEmail}`}>{s.principalEmail}</a></dd></div>}
          <div className="cd-row"><dt>School Board</dt><dd>{s.boardDistrict ? `District ${s.boardDistrict}` : '—'}</dd></div>
        </dl>
        <div className="sch-links">
          {s.website && <a className="u-btn u-btn-outline u-btn-sm" href={s.website} target="_blank" rel="noopener noreferrer"><Globe size={13} />Website<ExternalLink size={11} /></a>}
          {s.profileUrl && <a className="u-btn u-btn-outline u-btn-sm" href={s.profileUrl} target="_blank" rel="noopener noreferrer">SPS Profile<ExternalLink size={11} /></a>}
        </div>
      </section>

      <section className="u-card">
        <header className="u-card-head"><h2><ShieldCheck size={16} /> Compliance Snapshot</h2>{compliance && <SchoolStatusBadge status={compliance.status} />}</header>
        {!compliance ? <p className="u-muted u-small">Loading…</p> : (
          <dl className="cd-facts sd-facts">
            <div className="cd-row"><dt>Last Inspection</dt><dd>{fmtDate(compliance.lastInspection)}</dd></div>
            <div className="cd-row"><dt>Next Due</dt><dd>{nextOpen ? <>{fmtDay(nextOpen.scheduledDate)} <InspectionStatusBadge status={nextOpen.status} /></> : '—'}</dd></div>
            <div className="cd-row"><dt>Next Inspection</dt><dd>{nextOpen?.type ?? '—'}</dd></div>
            <div className="cd-row"><dt>Pre-{PRESUMED_ACM_BEFORE} Buildings</dt><dd>{buildings.filter((b) => b.presumedAcm).length} of {buildings.length}</dd></div>
            <div className="cd-row"><dt>Rooms with ACM</dt><dd>{fmtNum(t.withAcm)} of {fmtNum(t.rooms)}</dd></div>
          </dl>
        )}
        <div className="sch-links">
          <Link className="u-btn u-btn-outline u-btn-sm" to={`/schools/${s.id}/buildings`}>View Buildings</Link>
          <Link className="u-btn u-btn-outline u-btn-sm" to="/compliance"><CalendarDays size={13} />Compliance Calendar</Link>
        </div>
      </section>
    </div>
  )
}

function AcmSummary({ buildings }) {
  const t = buildingTotals(buildings)
  const count = (s) => buildings.filter((b) => b.acmStatus === s).length
  return (
    <section className="u-card">
      <header className="u-card-head">
        <h2>ACM by Building</h2>
        <span className="u-muted u-small">{count('ACM Present')} ACM present · {count('Assumed ACM')} assumed · {count('No ACM')} no ACM</span>
      </header>
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead><tr><th>Building</th><th className="c-num">Year Built</th><th>ACM Status</th><th className="c-num">Rooms</th><th className="c-num">Rooms with ACM</th><th className="sd-share-col">Share of Rooms</th></tr></thead>
          <tbody>
            {buildings.map((b) => {
              const pct = b.rooms ? Math.round((b.roomsWithAcm / b.rooms) * 100) : 0
              return (
                <tr key={b.id}>
                  <td><strong>{b.name}</strong><small className="p-sub">{b.code}</small></td>
                  <td className="c-num">{b.yearBuilt}</td>
                  <td><AcmBadge status={b.acmStatus} /></td>
                  <td className="c-num">{fmtNum(b.rooms)}</td>
                  <td className="c-num">{fmtNum(b.roomsWithAcm)}</td>
                  <td className="sd-share-col">
                    <span className="sd-share"><span className="b-bar"><span className="b-bar-acm" style={{ width: `${pct}%` }} /><span className="b-bar-none" /></span><b>{pct}%</b></span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td /><td /><td className="c-num">{fmtNum(t.rooms)}</td><td className="c-num">{fmtNum(t.withAcm)}</td>
              <td className="sd-share-col">{t.rooms ? Math.round((t.withAcm / t.rooms) * 100) : 0}% of rooms</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="ad-sample"><Info size={13} />“Assumed ACM” means suspect material in a pre-{PRESUMED_ACM_BEFORE} building that hasn't been sampled yet; AHERA treats it as ACM until lab results show otherwise.</p>
    </section>
  )
}


export default function SchoolDetail() {
  const { schoolId, tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)

  const [data, setData] = useState(null) // { id, school, buildings }
  const [compliance, setCompliance] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [acmFilter, setAcmFilter] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(null) // {} = add, { building } = edit
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let cancelled = false
    request(`/schools/${schoolId}`)
      .then((s) => { if (!cancelled) { const { buildings, ...school } = s; setData({ id: schoolId, school, buildings }); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.status === 404 ? 'notFound' : err.message) })
    request(`/compliance/schools/${schoolId}`).then((c) => { if (!cancelled) setCompliance({ id: schoolId, ...c }) }).catch(() => {})
    return () => { cancelled = true }
  }, [schoolId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const current = data?.id === schoolId ? data : null
  const comp = compliance?.id === schoolId ? compliance : null
  const buildings = useMemo(() => current?.buildings ?? [], [current])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const test = ACM_FILTERS[acmFilter]?.test
    return buildings.filter((b) => (!test || test(b))
      && (!term || [b.name, b.code, b.construction, String(b.yearBuilt)].some((v) => v.toLowerCase().includes(term))))
  }, [buildings, query, acmFilter])

  const closeForm = useCallback(() => setForm(null), [])

  if (!tab) return <Navigate to={`/schools/${schoolId}`} replace />
  if (error === 'notFound') {
    return (
      <div className="coming-soon">
        <SearchX size={30} />
        <strong>School not found</strong>
        <span>There's no school with ID <code>{schoolId}</code>. <Link to="/schools/list">Back to Schools</Link></span>
      </div>
    )
  }

  const s = current?.school
  const selected = tabSlug === 'buildings' ? buildings.find((b) => b.id === selectedId) ?? null : null
  const inspections = comp?.inspections ?? []
  const nextOpen = inspections.filter((i) => !i.completedAt).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]

  const onSaved = (saved, isNew) => {
    setData((d) => ({ ...d, buildings: isNew ? [...d.buildings, saved] : d.buildings.map((b) => (b.id === saved.id ? saved : b)) }))
    setForm(null)
    setSelectedId(saved.id)
    setToast({ kind: 'success', text: isNew ? `Added ${saved.name}` : `Saved ${saved.name}` })
  }
  const onAcmFilter = (key) => { setAcmFilter(key); if (tabSlug !== 'buildings') navigate(`/schools/${schoolId}/buildings`) }

  return (
    <div className={`schools-page school-detail${selected ? ' details-open' : ''}`}>
      <div className="sch-main">
        <nav className="sd-crumbs" aria-label="Breadcrumb">
          <Link to="/dashboard">Home</Link><ChevronRight size={13} />
          <Link to="/schools/list">Schools</Link><ChevronRight size={13} />
          {tabSlug ? <Link to={`/schools/${schoolId}`}>{s?.name ?? '…'}</Link> : <span aria-current="page">{s?.name ?? '…'}</span>}
          {tabSlug && <><ChevronRight size={13} /><span aria-current="page">{tab.label}</span></>}
        </nav>

        <div className="c-head">
          <div className="sd-title">
            <span className="sd-icon"><School size={22} /></span>
            <div>
              <h1>{s?.name ?? 'Loading…'}{comp && <SchoolStatusBadge status={comp.status} />}</h1>
              {s && <p><span>School ID: <b>{s.id.toUpperCase()}</b></span><span className="sd-sep">|</span><span>{s.type}</span><span className="sd-sep">|</span><span>Address: {s.address.full}</span></p>}
            </div>
          </div>
          <Link className="u-btn u-btn-outline" to="/schools/list"><ArrowLeft size={15} />Back to Schools</Link>
        </div>

        {error && error !== 'notFound' && <div className="u-banner">Couldn't load this school ({error}).</div>}

        <nav className="u-tabs" role="tablist" aria-label="School sections">
          {TABS.map((t) => (
            <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
              className={`u-tab${t.slug === tabSlug ? ' active' : ''}`}
              onClick={() => navigate(t.slug ? `/schools/${schoolId}/${t.slug}` : `/schools/${schoolId}`)}>{t.label}</button>
          ))}
        </nav>

        <BuildingKpis buildings={current ? buildings : null} filter={tabSlug === 'buildings' ? acmFilter : null} onFilter={onAcmFilter} />

        {s && tabSlug === '' && <Overview school={s} buildings={buildings} compliance={comp} nextOpen={nextOpen} />}

        {s && tabSlug === 'buildings' && (
          <section className="u-card">
            <header className="u-card-head b-head">
              <h2>Buildings ({filtered.length === buildings.length ? buildings.length : `${filtered.length} of ${buildings.length}`})</h2>
              <div className="b-tools">
                <label className="u-search"><Search size={15} />
                  <input type="search" placeholder="Search buildings…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search buildings" />
                </label>
                <SearchSelect variant="field" label="ACM status" value={acmFilter} onChange={setAcmFilter} searchable={false}
                  options={[{ value: '', label: 'All ACM Statuses' }, ...Object.entries(ACM_FILTERS).map(([value, f]) => ({ value, label: f.label }))]} />
                <button type="button" className="u-btn u-btn-primary" onClick={() => setForm({})}><Plus size={16} />Add Building</button>
              </div>
            </header>
            <BuildingsTable buildings={filtered} selectedId={selected?.id} onView={(b) => setSelectedId(b.id)} onEdit={(b) => setForm({ building: b })}
              emptyText={buildings.length ? 'No buildings match this search.' : 'No buildings yet — add the first one.'} />
          </section>
        )}

        {s && tabSlug === 'acm' && <AcmSummary buildings={buildings} />}

        {s && (tabSlug === 'inspections' || tabSlug === 'surveillance') && (
          <section className="u-card">
            <header className="u-card-head">
              <h2>{tabSlug === 'surveillance' ? 'Periodic Surveillance (every 6 months)' : 'Inspections & Reinspections (every 3 years)'}</h2>
              <Link className="u-btn u-btn-outline u-btn-sm" to="/compliance"><CalendarDays size={13} />Compliance Calendar</Link>
            </header>
            {!comp ? <p className="u-muted u-small">Loading…</p> : (
              <InspectionTable
                inspections={inspections.filter((i) => (tabSlug === 'surveillance') === (i.type === SURVEILLANCE))}
                empty={tabSlug === 'surveillance' ? 'No surveillance recorded for this school.' : 'No inspections recorded for this school.'} />
            )}
          </section>
        )}

        {s && tabSlug === 'compliance' && (
          <section className="u-card">
            <header className="u-card-head"><h2><ShieldCheck size={16} /> AHERA Compliance</h2>{comp && <SchoolStatusBadge status={comp.status} />}</header>
            {!comp ? <p className="u-muted u-small">Loading…</p> : (
              <>
                <dl className="cd-facts sd-facts">
                  <div className="cd-row"><dt>Last Inspection</dt><dd>{fmtDate(comp.lastInspection)}</dd></div>
                  <div className="cd-row"><dt>Next Due</dt><dd>{nextOpen ? <>{fmtDay(nextOpen.scheduledDate)} · {nextOpen.type} <InspectionStatusBadge status={nextOpen.status} /></> : '—'}</dd></div>
                  <div className="cd-row"><dt>Open Inspections</dt><dd>{inspections.filter((i) => !i.completedAt).length}</dd></div>
                  <div className="cd-row"><dt>Overdue</dt><dd>{inspections.filter((i) => i.status === 'overdue').length}</dd></div>
                  <div className="cd-row"><dt>Completed</dt><dd>{inspections.filter((i) => i.completedAt).length}</dd></div>
                </dl>
                <p className="ad-sample"><Info size={13} />AHERA requires periodic surveillance every 6 months and a reinspection every 3 years. A school is Non-Compliant when either is overdue, and Due Soon within 30 days.</p>
              </>
            )}
          </section>
        )}

        {s && tabSlug === 'documents' && <DocumentsCard filter={{ school: schoolId }} emptyText="No documents for this school yet." />}
      </div>

      {selected && (
        <>
          <div className="u-drawer-backdrop" onClick={() => setSelectedId(null)} />
          <BuildingDetails key={selected.id} building={selected} onClose={() => setSelectedId(null)} onEdit={(b) => setForm({ building: b })} />
        </>
      )}

      {form && s && (
        <BuildingForm school={s} building={form.building} existing={buildings} onClose={closeForm} onSaved={onSaved} />
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
