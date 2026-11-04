import { useEffect, useMemo, useState } from 'react'
import { Navigate, Link, useLocation, useNavigate, useParams } from 'react-router'
import { Layers, Plus, Search, CircleCheck, TriangleAlert, OctagonAlert, School, RotateCcw } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import ExportMenu from '../Reports/ExportMenu'
import FacilityTree from './FacilityTree'
import InventoryTable from './InventoryTable'
import GroupTab from './GroupTab'
import HistoryTab from './HistoryTab'
import AddAcmDialog from './AddAcmDialog'
import { TABS, EMPTY_FILTERS } from './acmInventoryMeta'
import { request, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Audit/audit.css'
import '../Reports/reports.css'
import './acmInventory.css'

const pct = (v) => (v == null ? null : `${v}%`)

function Kpi({ icon: Icon, value, label, sub, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value?.toLocaleString('en-US') ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
        {sub && <small title={sub}>{sub}</small>}
      </span>
    </button>
  )
}

const toQs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => { if (v) p.set(k, v) })
  return p.toString()
}

export default function AcmInventory() {
  const { tab: tabParam } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.id === (tabParam ?? 'inventory'))

  // A link can open the inventory on one school / building (state.place, e.g. from the map)
  const startAt = useLocation().state?.place
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, school: startAt?.school ?? '', building: startAt?.building ?? '' }))
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sort, setSort] = useState({ key: '', dir: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [tree, setTree] = useState(null)
  const [meta, setMeta] = useState({ types: [], conditions: [], statuses: [] })
  const [error, setError] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { request('/acm-inventory/meta').then(setMeta).catch(() => {}) }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(filters.q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [filters.q])

  const filterQs = toQs({ ...filters, q: debouncedQ })
  // The tree shows where the matching records are, so it ignores the location filters
  const treeQs = toQs({ type: filters.type, condition: filters.condition, status: filters.status, q: debouncedQ })

  useEffect(() => {
    let cancelled = false
    request(`/acm-inventory/tree?${treeQs}`).then((t) => { if (!cancelled) setTree(t) }).catch(() => {})
    return () => { cancelled = true }
  }, [treeQs])

  const listQs = useMemo(() => `${filterQs}&${toQs({ sort: sort.key, dir: sort.dir, page, pageSize })}`, [filterQs, sort, page, pageSize])
  useEffect(() => {
    let cancelled = false
    request(`/acm-inventory?${listQs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [listQs])

  if (!tab) return <Navigate to="/acm" replace />

  const setFilter = (key) => (value) => {
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === 'school' ? { building: '', floor: '' } : {}),
      ...(key === 'building' ? { floor: '' } : {}),
    }))
    setPage(1)
  }
  const pickLocation = ({ school = '', building = '', floor = '' }) => {
    setFilters((f) => ({ ...f, school, building, floor }))
    setPage(1)
  }
  // A summary row (or tile) narrows the inventory and switches to it
  const openFiltered = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
    navigate('/acm')
  }
  const toggleCondition = (c) => setFilter('condition')(filters.condition === c ? '' : c)

  const school = tree?.find((s) => s.id === filters.school)
  const building = school?.buildings.find((b) => b.id === filters.building)
  const floor = building?.floors.find((f) => f.id === filters.floor)
  const place = [school?.name, building?.name, floor?.name].filter(Boolean).join(' / ') || 'All Facilities'
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)
  const s = data?.stats

  const toggleSort = (key) => {
    setSort((cur) => {
      const active = cur.key || data?.sort
      const dir = cur.dir || data?.dir
      return active === key ? { key, dir: dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    })
    setPage(1)
  }

  return (
    <div className="ai-page">
      <div className="ai-head">
        <h1><Layers size={24} />ACM Inventory</h1>
        <div className="ai-head-actions">
          <button type="button" className="u-btn u-btn-primary" onClick={() => setAdding(true)}><Plus size={15} />Add ACM</button>
          <ExportMenu csvHref={`${API_BASE}/acm-inventory/export.csv?${filterQs}&${toQs({ sort: sort.key, dir: sort.dir })}`} title="ACM inventory" />
        </div>
      </div>

      {tab.id !== 'history' && (
        <div className="ai-filters">
          <div className="a-field">
            <span>Facility</span>
            <SearchSelect variant="field" label="Facility" value={filters.school} onChange={setFilter('school')} searchPlaceholder="Search facilities…"
              options={[{ value: '', label: 'All Facilities' }, ...(tree ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
          </div>
          <div className="a-field">
            <span>Building</span>
            <SearchSelect variant="field" label="Building" value={filters.building} onChange={setFilter('building')}
              options={[{ value: '', label: school ? 'All Buildings' : 'Select a facility first' }, ...(school?.buildings ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
          </div>
          <div className="a-field">
            <span>Floor</span>
            <SearchSelect variant="field" label="Floor" value={filters.floor} onChange={setFilter('floor')} searchable={false}
              options={[{ value: '', label: building ? 'All Floors' : 'Select a building first' }, ...(building?.floors ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
          </div>
          <div className="a-field">
            <span>Material Type</span>
            <SearchSelect variant="field" label="Material type" value={filters.type} onChange={setFilter('type')} searchable={false}
              options={[{ value: '', label: 'All Material Types' }, ...meta.types.map((x) => ({ value: x, label: x }))]} />
          </div>
          <div className="a-field">
            <span>Condition</span>
            <SearchSelect variant="field" label="Condition" value={filters.condition} onChange={setFilter('condition')} searchable={false}
              options={[{ value: '', label: 'All Conditions' }, ...[...meta.conditions, 'Not Assessed'].filter((x, i, a) => a.indexOf(x) === i).map((x) => ({ value: x, label: x }))]} />
          </div>
          <div className="a-field">
            <span>ACM Status</span>
            <SearchSelect variant="field" label="ACM status" value={filters.status} onChange={setFilter('status')} searchable={false}
              options={[{ value: '', label: 'All Statuses' }, ...meta.statuses.map((x) => ({ value: x, label: x }))]} />
          </div>
          <div className="a-field ai-search-field">
            <span>Search</span>
            <div className="ai-search-row">
              <label className="u-search">
                <Search size={15} />
                <input type="search" placeholder="Room, material or ACM ID…" value={filters.q}
                  onChange={(e) => setFilter('q')(e.target.value)} aria-label="Search ACM inventory" />
              </label>
              <button type="button" className="u-btn u-btn-outline ai-reset" disabled={!filtersActive} aria-label="Reset filters" title="Reset filters"
                onClick={() => { setFilters(EMPTY_FILTERS); setDebouncedQ(''); setPage(1) }}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="u-tabs ai-tabs" aria-label="ACM inventory views">
        {TABS.map((t) => (
          <Link key={t.id} to={t.id === 'inventory' ? '/acm' : `/acm/${t.id}`}
            className={`u-tab${t.id === tab.id ? ' active' : ''}`} aria-current={t.id === tab.id ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab.id !== 'history' && (
        <div className="a-kpis ai-kpis">
          <Kpi icon={Layers} value={s?.total} label="Total ACM Records" tone="primary"
            sub={s && `${s.acmPresent.toLocaleString('en-US')} present · ${s.assumed.toLocaleString('en-US')} assumed`}
            active={!filters.condition} onClick={() => setFilter('condition')('')} />
          <Kpi icon={CircleCheck} value={s?.good} label="Good" sub={pct(s?.goodPct)} tone="good"
            active={filters.condition === 'Good'} onClick={() => toggleCondition('Good')} />
          <Kpi icon={TriangleAlert} value={s?.damaged} label="Damaged" sub={pct(s?.damagedPct)} tone="warning"
            active={filters.condition === 'Damaged'} onClick={() => toggleCondition('Damaged')} />
          <Kpi icon={OctagonAlert} value={s?.significantlyDamaged} label="Significantly Damaged" sub={pct(s?.significantlyDamagedPct)} tone="critical"
            active={filters.condition === 'Significantly Damaged'} onClick={() => toggleCondition('Significantly Damaged')} />
          <Kpi icon={School} value={s?.facilities} label="Facilities" tone="violet"
            sub={s && `${s.notAssessed.toLocaleString('en-US')} records not assessed`}
            active={false} onClick={() => navigate('/acm/buildings')} />
        </div>
      )}

      {tab.id === 'inventory' && (
        <div className="ai-body">
          <FacilityTree tree={tree} filters={filters} onPick={pickLocation} />
          <InventoryTable title={`ACM Inventory – ${place}`} data={data} error={error} sort={sort} onSort={toggleSort}
            onPage={setPage} pageSize={pageSize} onPageSize={(v) => { setPageSize(v); setPage(1) }} />
        </div>
      )}
      {tab.groupBy && <GroupTab tab={tab} qs={filterQs} onOpen={openFiltered} />}
      {tab.id === 'history' && <HistoryTab />}

      {adding && <AddAcmDialog initial={filters} onClose={() => setAdding(false)} />}
    </div>
  )
}
