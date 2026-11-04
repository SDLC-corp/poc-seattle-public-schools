import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Search, RotateCcw, ChevronLeft, ChevronRight, CircleCheck, CircleAlert, Plus } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { BuildingKpis, BuildingsTable, BuildingDetails } from './BuildingParts'
import BuildingForm from './BuildingForm'
import { ACM_FILTERS } from './buildingUtils'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './schools.css'

const PAGE_SIZE = 15
const DEFAULTS = { acm: '', floors: '', school: '' }

// District-wide building list; each row links to its school's Buildings tab
export default function Buildings() {
  const [buildings, setBuildings] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState(DEFAULTS)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [schools, setSchools] = useState(null) // for the Add Building school picker (includes schools without buildings)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    request('/buildings').then((d) => setBuildings(d.buildings)).catch((err) => setError(err.message))
    request('/schools').then((d) => setSchools([...d.schools].sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setSchools([]))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1) }
  const closeForm = useCallback(() => setEditing(null), [])
  const closeAdd = useCallback(() => setAdding(false), [])

  const schoolOptions = useMemo(() => {
    const names = new Map((buildings ?? []).map((b) => [b.schoolId, b.schoolName]))
    return [...names].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))
  }, [buildings])

  // Floor-count filter options come from the data (buildings can have any number of floors)
  const floorCounts = useMemo(() => [...new Set((buildings ?? []).map((b) => b.floors))].sort((a, b) => a - b), [buildings])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const test = ACM_FILTERS[filters.acm]?.test
    return (buildings ?? []).filter((b) => (!test || test(b))
      && (!filters.floors || b.floors === Number(filters.floors))
      && (!filters.school || b.schoolId === filters.school)
      && (!term || [b.name, b.code, b.schoolName].some((v) => v.toLowerCase().includes(term))))
  }, [buildings, filters, query])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const selected = buildings?.find((b) => b.id === selectedId) ?? null
  const filtersActive = query || JSON.stringify(filters) !== JSON.stringify(DEFAULTS)
  // KPIs follow the school filter so they can be read per school
  const kpiBase = filters.school ? (buildings ?? []).filter((b) => b.schoolId === filters.school) : buildings

  const onSaved = (saved) => {
    setBuildings((list) => list.map((b) => (b.id === saved.id ? saved : b)))
    setEditing(null)
    setToast({ kind: 'success', text: `Saved ${saved.name}` })
  }
  // New building: first in the list (filters cleared so it shows) and opened in the details panel
  const onAdded = (saved) => {
    setBuildings((list) => [saved, ...list])
    setAdding(false)
    setFilters(DEFAULTS); setQuery(''); setPage(1)
    setSelectedId(saved.id)
    setToast({ kind: 'success', text: `Added ${saved.name} – ${saved.schoolName}` })
  }

  return (
    <div className={`schools-page${selected ? ' details-open' : ''}`}>
      <div className="sch-main">
        <div className="c-head">
          <div>
            <h1><Building2 size={22} />Buildings</h1>
            <p>Every school building with floors, rooms and asbestos (ACM) status.</p>
          </div>
          <button type="button" className="u-btn u-btn-primary" onClick={() => setAdding(true)} disabled={!buildings || !schools}><Plus size={15} />Add Building</button>
        </div>

        {error && <div className="u-banner">Couldn't load buildings ({error}).</div>}

        <BuildingKpis buildings={kpiBase} filter={filters.acm} onFilter={setFilter('acm')} />

        <section className="u-card">
          <div className="b-filters">
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder="Search building, code or school…" value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Search buildings" />
            </label>
            <SearchSelect variant="field" label="School" value={filters.school} onChange={setFilter('school')} searchPlaceholder="Search schools…"
              options={[{ value: '', label: 'All Schools' }, ...schoolOptions]} />
            <SearchSelect variant="field" label="ACM status" value={filters.acm} onChange={setFilter('acm')} searchable={false}
              options={[{ value: '', label: 'All ACM Statuses' }, ...Object.entries(ACM_FILTERS).map(([value, f]) => ({ value, label: f.label }))]} />
            <SearchSelect variant="field" label="Floors" value={filters.floors} onChange={setFilter('floors')} searchable={false}
              options={[{ value: '', label: 'All Floors' }, ...floorCounts.map((n) => ({ value: String(n), label: `${n} floor${n === 1 ? '' : 's'}` }))]} />
            <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive} onClick={() => { setFilters(DEFAULTS); setQuery(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>

          <BuildingsTable buildings={visible} showSchool selectedId={selected?.id} onView={(b) => setSelectedId(b.id)} onEdit={setEditing}
            emptyText={buildings ? 'No buildings match these filters.' : 'Loading…'} />

          <footer className="u-pager">
            <span className="u-muted">{filtered.length ? `Showing ${(current - 1) * PAGE_SIZE + 1} to ${Math.min(filtered.length, current * PAGE_SIZE)} of ${filtered.length} buildings` : 'No buildings'}</span>
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
          <div className="u-drawer-backdrop" onClick={() => setSelectedId(null)} />
          <BuildingDetails key={selected.id} building={selected} showSchoolLink onClose={() => setSelectedId(null)} onEdit={setEditing} />
        </>
      )}
      {editing && (
        <BuildingForm school={{ id: editing.schoolId, name: editing.schoolName }} building={editing}
          existing={buildings.filter((b) => b.schoolId === editing.schoolId)} onClose={closeForm} onSaved={onSaved} />
      )}
      {adding && (
        <BuildingForm schools={schools} allBuildings={buildings} defaultSchoolId={filters.school} onClose={closeAdd} onSaved={onAdded} />
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
