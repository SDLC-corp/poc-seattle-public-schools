import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ClipboardList, FileText, Download, Search, ChevronLeft, ChevronRight, ArrowDown, ArrowUp, RotateCcw,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import ExportMenu from './ExportMenu'
import { STAT_ICONS, COMMON_FILTERS, REPORT_LABELS as SUBTAB_LABELS, fmtDay } from './reportMeta'
import { request, API_BASE } from '../../lib/api'

const EMPTY = { school: '', building: '', floor: '', inspector: '', status: '', from: '', to: '' }
const DEFAULT_LABELS = { school: 'Facility', building: 'Building', floor: 'Floor', inspector: 'Inspector' }
const PLURAL = { Facility: 'Facilities', Building: 'Buildings', Floor: 'Floors', Inspector: 'Inspectors', Site: 'Sites' }

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

function Kpi({ stat, active, onClick }) {
  const Icon = STAT_ICONS[stat.icon] ?? ClipboardList
  const props = stat.status !== undefined || stat.key === 'total'
    ? { type: 'button', onClick, 'aria-pressed': active }
    : { type: 'button', disabled: true }
  return (
    <button className={`kpi-card kpi-clickable tone-${stat.tone}${active ? ' active' : ''}`} {...props}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{stat.value.toLocaleString('en-US')}</strong>
        <span className="kpi-label">{stat.label}</span>
      </span>
    </button>
  )
}

function Cell({ column, row, statuses }) {
  const v = row[column.key]
  if (column.type === 'status') {
    const s = statuses.find((x) => x.value === v)
    return <span className={`rp-badge tone-${s?.tone ?? 'neutral'}`}>{s?.label ?? v}</span>
  }
  if (column.type === 'date') return fmtDay(v)
  if (v === '' || v == null) return <span className="u-muted">—</span>
  // The record's own page (rows carry `link`)
  if (column.type === 'link' && row.link) return <Link className="rp-link" to={row.link}>{v}</Link>
  return typeof v === 'number' ? v.toLocaleString('en-US') : v
}

const toParams = (obj, keys) => {
  const p = new URLSearchParams()
  keys.forEach((k) => { if (obj[k]) p.set(k, obj[k]) })
  return p
}

export default function ReportView({ tab, reportId, onSelectReport }) {
  const [draft, setDraft] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [sort, setSort] = useState({ key: '', dir: '' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [facets, setFacets] = useState({ schools: [], buildings: [], floors: [], inspectors: [] })
  const [error, setError] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [q])

  // Options narrow as the draft selection changes (school → buildings → floors)
  const facetQs = toParams(draft, ['school', 'building']).toString()
  useEffect(() => {
    let cancelled = false
    request(`/reports/${reportId}/facets?${facetQs}`)
      .then((f) => { if (!cancelled) setFacets(f) }).catch(() => {})
    return () => { cancelled = true }
  }, [reportId, facetQs])

  const qs = useMemo(() => {
    const p = toParams({ ...applied, q: debouncedQ, sort: sort.key, dir: sort.dir }, [...Object.keys(EMPTY), 'q', 'sort', 'dir'])
    p.set('page', page)
    p.set('pageSize', pageSize)
    return p.toString()
  }, [applied, debouncedQ, sort, page, pageSize])

  useEffect(() => {
    let cancelled = false
    request(`/reports/${reportId}?${qs}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [reportId, qs])

  const setField = (key) => (value) => setDraft((d) => ({
    ...d,
    [key]: value,
    // A new school/building invalidates the narrower picks below it
    ...(key === 'school' ? { building: '', floor: '', inspector: '' } : {}),
    ...(key === 'building' ? { floor: '' } : {}),
  }))
  const apply = (next = draft) => { setApplied(next); setDraft(next); setPage(1) }
  // KPI tiles filter straight away
  const applyStatus = (status) => apply({ ...applied, status: applied.status === status ? '' : status })

  const has = (f) => data?.filters.includes(f)
  const label = (f) => data?.filterLabels[f] ?? DEFAULT_LABELS[f]
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied)
  const filtersActive = JSON.stringify(applied) !== JSON.stringify(EMPTY) || q

  const exportParams = toParams({ ...applied, q: debouncedQ, sort: sort.key, dir: sort.dir }, [...Object.keys(EMPTY), 'q', 'sort', 'dir'])
  const siblingParams = toParams(applied, COMMON_FILTERS).toString()
  const statusOptions = data ? [
    { value: '', label: 'All' },
    ...data.statuses.map((s) => ({ value: s.value, label: s.label })),
    // Tiles can select a group of statuses (e.g. Scheduled = scheduled + due soon)
    ...(applied.status && !data.statuses.some((s) => s.value === applied.status)
      ? [{ value: applied.status, label: data.stats.find((s) => s.status === applied.status)?.label ?? applied.status }] : []),
  ] : []

  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0
  const toggleSort = (key) => {
    setSort((s) => (s.key === key || (!s.key && data?.sort === key)
      ? { key, dir: (s.dir || data?.dir) === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }))
    setPage(1)
  }
  const sortKey = sort.key || data?.sort
  const sortDir = sort.dir || data?.dir
  const multi = tab.reports.length > 1

  return (
    <>
      <div className="rp-section-head">
        <h2><ClipboardList size={22} />{tab.title}</h2>
        <ExportMenu csvHref={`${API_BASE}/reports/${reportId}/export.csv?${exportParams}`} title={data?.title ?? 'Report'} />
      </div>

      {multi && (
        <nav className="rp-subtabs" aria-label={`${tab.title}`}>
          {tab.reports.map((id) => (
            <button key={id} type="button" className={id === reportId ? 'active' : ''} aria-current={id === reportId ? 'page' : undefined}
              onClick={() => onSelectReport(id)}>
              {data?.id === id ? data.title : SUBTAB_LABELS[id]}
            </button>
          ))}
        </nav>
      )}

      <form className="rp-filters" onSubmit={(e) => { e.preventDefault(); apply() }}>
        {['school', 'building', 'floor', 'inspector'].filter(has).map((f) => {
          const list = { school: facets.schools, building: facets.buildings, floor: facets.floors, inspector: facets.inspectors }[f]
          const blocked = (f === 'building' && !draft.school) || (f === 'floor' && !draft.building)
          return (
            <div key={f} className="a-field">
              <span>{label(f)}</span>
              <SearchSelect variant="field" label={label(f)} value={draft[f]} onChange={setField(f)}
                searchPlaceholder={`Search ${PLURAL[label(f)].toLowerCase()}…`}
                options={[
                  { value: '', label: blocked ? `Select a ${(f === 'building' ? label('school') : 'building').toLowerCase()} first` : `All ${PLURAL[label(f)]}` },
                  ...list.map((o) => ({ value: o.value, label: o.label })),
                ]} />
            </div>
          )
        })}
        {has('status') && (
          <div className="a-field">
            <span>{data.statusLabel}</span>
            <SearchSelect variant="field" label={data.statusLabel} value={draft.status} onChange={setField('status')} searchable={false}
              options={statusOptions} />
          </div>
        )}
        {has('date') && (
          <div className="a-field rp-dates">
            <span>Date Range</span>
            <div>
              <input type="date" className="u-input" value={draft.from} max={draft.to || undefined} aria-label="From date"
                onChange={(e) => setField('from')(e.target.value)} />
              <span aria-hidden="true">–</span>
              <input type="date" className="u-input" value={draft.to} min={draft.from || undefined} aria-label="To date"
                onChange={(e) => setField('to')(e.target.value)} />
            </div>
          </div>
        )}
        <div className="rp-filter-actions">
          <button type="submit" className="u-btn u-btn-primary" disabled={!dirty}>Apply</button>
          <button type="button" className="u-btn u-btn-outline" disabled={!filtersActive} aria-label="Reset filters" title="Reset filters"
            onClick={() => { apply(EMPTY); setQ(''); setDebouncedQ('') }}>
            <RotateCcw size={14} />
          </button>
        </div>
      </form>

      {data && (
        <div className="a-kpis rp-kpis" style={{ '--n': data.stats.length }}>
          {data.stats.map((s) => (
            <Kpi key={s.key} stat={s}
              active={s.key === 'total' ? !applied.status : applied.status === s.status}
              onClick={() => (s.key === 'total' ? apply({ ...applied, status: '' }) : applyStatus(s.status))} />
          ))}
        </div>
      )}

      <div className={`rp-body${multi ? ' with-side' : ''}`}>
        <section className="u-card rp-records">
          <header className="rp-records-head">
            <h3>{data?.title ?? 'Report'} Records</h3>
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Search records…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search records" />
            </label>
          </header>

          {error && <div className="u-banner">Couldn't load this report ({error}).</div>}

          <div className="u-table-wrap">
            <table className="u-table rp-table">
              <thead>
                <tr>
                  {data?.columns.map((c) => (
                    <th key={c.key} className={c.type === 'number' ? 'num' : undefined}
                      aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <button type="button" className="a-sort" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        {sortKey === c.key && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r) => (
                  <tr key={r.id}>
                    {data.columns.map((c) => (
                      <td key={c.key} className={c.type ? `t-${c.type}` : undefined}>
                        <Cell column={c} row={r} statuses={data.statuses} />
                      </td>
                    ))}
                  </tr>
                ))}
                {data && !data.rows.length && (
                  <tr><td colSpan={data.columns.length} className="u-empty">No records match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <footer className="u-pager">
              <span className="u-muted">Showing {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {data.total.toLocaleString('en-US')} records</span>
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

        {multi && (
          <aside className="u-card rp-side" aria-label={tab.title}>
            <h3><FileText size={18} />{tab.title}</h3>
            <ul>
              {tab.reports.map((id) => (
                <li key={id} className={id === reportId ? 'current' : ''}>
                  <button type="button" className="rp-side-open" onClick={() => onSelectReport(id)}>
                    <FileText size={15} />{SUBTAB_LABELS[id]} Report
                  </button>
                  <a className="u-row-btn" href={`${API_BASE}/reports/${id}/export.csv?${siblingParams}`} download
                    aria-label={`Download ${SUBTAB_LABELS[id]} report (CSV)`} title="Download CSV">
                    <Download size={15} />
                  </a>
                </li>
              ))}
            </ul>
            <p className="u-muted rp-side-note">Downloads use the facility, building, floor, inspector and date filters applied above.</p>
          </aside>
        )}
      </div>
    </>
  )
}
