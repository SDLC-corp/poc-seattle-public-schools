import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  School, Search, RotateCcw, ChevronLeft, ChevronRight, X, Phone, Printer, Mail, Globe, ExternalLink,
  MapPin, Building2, ShieldCheck, CalendarDays, Info, Download,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { SchoolStatusBadge, InspectionStatusBadge } from '../Compliance/complianceMeta'
import { request, fmtDate } from '../../lib/api'
import { AcmBadge } from './BuildingParts'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'

const TYPES = [
  { value: 'Elementary', label: 'Elementary', tone: 'primary' },
  { value: 'K-8', label: 'K-8', tone: 'violet' },
  { value: 'Middle', label: 'Middle', tone: 'teal' },
  { value: 'High', label: 'High', tone: 'warning' },
  { value: 'Other', label: 'Other Programs', tone: 'good' },
]
const DEFAULTS = { type: '', category: '', board: '', status: '' }
const PAGE_SIZE = 12

// Some scraped names repeat their label ("Principal: Jane Doe")
const cleanPrincipal = (p) => (p ? p.replace(/^(interim\s+)?principal\s*:?\s*/i, '').trim() : '')
const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')

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

function SchoolDetails({ school: s, onClose }) {
  const [extra, setExtra] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([request(`/compliance/schools/${s.id}`), request(`/schools/${s.id}/buildings`)])
      .then(([c, b]) => { if (!cancelled) setExtra({ id: s.id, compliance: c, buildings: b.buildings }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [s.id])

  const data = extra?.id === s.id ? extra : null
  const nextOpen = data?.compliance.inspections.filter((i) => !i.completedAt).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
  const principal = cleanPrincipal(s.principal)

  return (
    <aside className="u-card sch-details" aria-label="School details">
      <header className="u-card-head">
        <h2>School Details</h2>
        <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </header>

      <div className="sch-hero">
        <span className="cd-icon"><School size={18} /></span>
        <div>
          <strong>{s.name}</strong>
          <span>{s.type}{s.category ? ` · ${s.category}` : ''}</span>
        </div>
        <SchoolStatusBadge status={s.complianceStatus} />
      </div>

      <dl className="cd-facts">
        <div className="cd-row"><dt><MapPin size={13} /> Address</dt><dd>{s.address.full}</dd></div>
        <div className="cd-row"><dt><Phone size={13} /> Main Office</dt><dd>{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : '—'}</dd></div>
        {s.fax && <div className="cd-row"><dt><Printer size={13} /> Fax</dt><dd>{s.fax}</dd></div>}
        <div className="cd-row"><dt>{s.principalTitle ?? 'Principal'}</dt><dd>{principal || '—'}</dd></div>
        {s.principalEmail && <div className="cd-row"><dt><Mail size={13} /> Email</dt><dd><a href={`mailto:${s.principalEmail}`}>{s.principalEmail}</a></dd></div>}
        <div className="cd-row"><dt>School Board</dt><dd>{s.boardDistrict ? (s.boardDistrictUrl ? <a href={s.boardDistrictUrl} target="_blank" rel="noopener noreferrer">District {s.boardDistrict}</a> : `District ${s.boardDistrict}`) : '—'}</dd></div>
      </dl>

      <div className="sch-links">
        {s.website && <a className="u-btn u-btn-outline u-btn-sm" href={s.website} target="_blank" rel="noopener noreferrer"><Globe size={13} />Website<ExternalLink size={11} /></a>}
        {s.profileUrl && <a className="u-btn u-btn-outline u-btn-sm" href={s.profileUrl} target="_blank" rel="noopener noreferrer">SPS Profile<ExternalLink size={11} /></a>}
      </div>

      <h3 className="cd-h"><ShieldCheck size={15} /> Compliance</h3>
      {!data ? <p className="u-muted u-small">Loading…</p> : (
        <dl className="cd-facts">
          <div className="cd-row"><dt>Last Inspection</dt><dd>{fmtDate(data.compliance.lastInspection)}</dd></div>
          <div className="cd-row"><dt>Next Due</dt><dd>{nextOpen ? <>{fmtDay(nextOpen.scheduledDate)} <InspectionStatusBadge status={nextOpen.status} /></> : '—'}</dd></div>
          <div className="cd-row"><dt>Next Inspection</dt><dd>{nextOpen?.type ?? '—'}</dd></div>
        </dl>
      )}

      <h3 className="cd-h"><Building2 size={15} /> Buildings ({data?.buildings.length ?? s.buildingCount})</h3>
      {data && (
        <ul className="sch-buildings">
          {data.buildings.map((b) => (
            <li key={b.id}>
              <div>
                <strong>{b.name}</strong>
                <small>Built {b.yearBuilt} · {b.floors} floor{b.floors > 1 ? 's' : ''} · {b.rooms} rooms</small>
              </div>
              <AcmBadge status={b.acmStatus} />
            </li>
          ))}
        </ul>
      )}
      <p className="ad-sample"><Info size={13} />School details are from seattleschools.org; buildings are sample data.</p>

      <div className="sch-actions">
        <Link className="u-btn u-btn-primary" to={`/schools/${s.id}/buildings`}><Building2 size={15} />View Buildings</Link>
        <Link className="u-btn u-btn-outline" to={`/schools/${s.id}/compliance`}><CalendarDays size={15} />Compliance &amp; Inspections</Link>
        <Link className="u-btn u-btn-outline" to={`/schools/${s.id}/documents`}><ExternalLink size={14} />Documents</Link>
      </div>
    </aside>
  )
}

export default function Schools() {
  const [schools, setSchools] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState(DEFAULTS)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(() => !window.matchMedia('(max-width: 1100px)').matches)

  useEffect(() => {
    request('/schools').then((d) => setSchools(d.schools)).catch((err) => setError(err.message))
  }, [])

  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: f[k] === v ? '' : v })); setPage(1) }
  const setFilterExact = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (schools ?? []).filter((s) =>
      (!filters.type || s.type === filters.type)
      && (!filters.category || s.category === filters.category)
      && (!filters.board || String(s.boardDistrict) === filters.board)
      && (!filters.status || s.complianceStatus === filters.status)
      && (!term || [s.name, s.address.full, cleanPrincipal(s.principal), s.phone].some((v) => v?.toLowerCase().includes(term))))
  }, [schools, filters, query])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const selected = schools?.find((s) => s.id === (selectedId ?? visible[0]?.id)) ?? null
  const count = (pred) => schools?.filter(pred).length
  const categories = [...new Set((schools ?? []).map((s) => s.category).filter(Boolean))].sort()
  const boards = [...new Set((schools ?? []).map((s) => s.boardDistrict).filter(Boolean))].sort((a, b) => a - b)
  const filtersActive = query || JSON.stringify(filters) !== JSON.stringify(DEFAULTS)

  const exportCsv = () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['School', 'Type', 'Category', 'Address', 'Phone', 'Principal', 'Principal Email', 'Board District', 'Buildings', 'Compliance'],
      ...filtered.map((s) => [s.name, s.type, s.category, s.address.full, s.phone, cleanPrincipal(s.principal), s.principalEmail, s.boardDistrict, s.buildingCount, s.complianceStatus])]
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'schools.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`schools-page${detailsOpen && selected ? ' details-open' : ''}`}>
      <div className="sch-main">
        <div className="c-head">
          <div>
            <h1><School size={22} />Schools</h1>
            <p>All Seattle Public Schools with contacts, buildings and asbestos compliance status.</p>
          </div>
          <button type="button" className="u-btn u-btn-outline" onClick={exportCsv} disabled={!schools}><Download size={15} />Export</button>
        </div>

        {error && <div className="u-banner">Couldn't load schools ({error}).</div>}

        <div className="sch-kpis">
          <Kpi icon={School} value={schools?.length} label="All Schools" tone="primary" active={!filters.type} onClick={() => setFilterExact('type')('')} />
          {TYPES.map((t) => (
            <Kpi key={t.value} icon={School} value={count((s) => s.type === t.value)} label={t.label} tone={t.tone}
              active={filters.type === t.value} onClick={() => setFilter('type')(t.value)} />
          ))}
        </div>

        <section className="u-card">
          <div className="sch-filters">
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder="Search name, address, principal or phone…" value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Search schools" />
            </label>
            <SearchSelect variant="field" label="School type" value={filters.type} onChange={setFilterExact('type')} searchable={false}
              options={[{ value: '', label: 'All Types' }, ...TYPES.map((t) => ({ value: t.value, label: t.label }))]} />
            <SearchSelect variant="field" label="Category" value={filters.category} onChange={setFilterExact('category')} searchable={false}
              options={[{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
            <SearchSelect variant="field" label="Board district" value={filters.board} onChange={setFilterExact('board')} searchable={false}
              options={[{ value: '', label: 'All Districts' }, ...boards.map((b) => ({ value: String(b), label: `Board District ${b}` }))]} />
            <SearchSelect variant="field" label="Compliance" value={filters.status} onChange={setFilterExact('status')} searchable={false}
              options={[{ value: '', label: 'All Statuses' }, { value: 'compliant', label: 'Compliant' }, { value: 'dueSoon', label: 'Due Soon' }, { value: 'overdue', label: 'Non-Compliant' }]} />
            <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive} onClick={() => { setFilters(DEFAULTS); setQuery(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>

          <div className="u-table-wrap">
            <table className="u-table c-table sch-table">
              <thead>
                <tr>
                  <th>School</th><th>Type</th><th className="sch-col-address">Address</th><th className="sch-col-phone">Phone</th>
                  <th className="sch-col-principal">Principal</th><th className="c-num sch-col-board">Board Dist.</th><th className="c-num">Buildings</th><th>Compliance</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id} className={s.id === selected?.id ? 'selected' : ''} tabIndex={0}
                    onClick={() => { setSelectedId(s.id); setDetailsOpen(true) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedId(s.id); setDetailsOpen(true) } }}>
                    <td><Link className="sch-name" to={`/schools/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link>{s.category && <small className="p-sub">{s.category}</small>}</td>
                    <td className="u-nowrap">{s.type}</td>
                    <td className="sch-col-address">{s.address.street}<small className="p-sub">{s.address.city}, {s.address.state} {s.address.zip}</small></td>
                    <td className="u-nowrap sch-col-phone">{s.phone ?? '—'}</td>
                    <td className="sch-col-principal">{cleanPrincipal(s.principal) || '—'}</td>
                    <td className="c-num sch-col-board">{s.boardDistrict ?? '—'}</td>
                    <td className="c-num">{s.buildingCount}</td>
                    <td><SchoolStatusBadge status={s.complianceStatus} /></td>
                  </tr>
                ))}
                {schools && !visible.length && <tr><td colSpan={8} className="u-empty">No schools match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="u-pager">
            <span className="u-muted">{filtered.length ? `Showing ${(current - 1) * PAGE_SIZE + 1} to ${Math.min(filtered.length, current * PAGE_SIZE)} of ${filtered.length} schools` : 'No schools'}</span>
            <nav className="u-pages" aria-label="Pagination">
              <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span className="u-gap">Page {current} of {pages}</span>
              <button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          </footer>
        </section>
      </div>

      {selected && (
        <>
          <div className="u-drawer-backdrop" onClick={() => setDetailsOpen(false)} />
          <SchoolDetails key={selected.id} school={selected} onClose={() => setDetailsOpen(false)} />
        </>
      )}
    </div>
  )
}
