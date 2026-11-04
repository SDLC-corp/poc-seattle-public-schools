import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  TrendingDown, Layers, ShieldCheck, TriangleAlert, OctagonAlert, TrendingUp, School, RotateCcw, Search, FileSpreadsheet, FileText,
  ChevronLeft, ChevronRight, Info, BellRing, Settings2, ArrowRight, CircleCheck, CircleAlert,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, API_BASE } from '../../lib/api'
import { LocationChart, MaterialChart, MonthlyChart } from './TrendCharts'
import AcmTimelineDrawer from './AcmTimelineDrawer'
import AlertRulesDrawer from './AlertRulesDrawer'
import { TRENDS, CONDITIONS, LEVEL_LABEL, fmtDay } from './trendsMeta'
import '../Users/users.css'
import './trends.css'

const EMPTY = { school: '', building: '', floor: '', room: '', acm: '', materialType: '', classification: '', friability: '', condition: '', inspectionType: '', from: '', to: '' }
// Choosing a level clears everything below it
const BELOW = { school: ['building', 'floor', 'room', 'acm'], building: ['floor', 'room', 'acm'], floor: ['room', 'acm'], room: ['acm'] }
const iso = (d) => d.toISOString().slice(0, 10)
const PRESETS = [
  { value: '', label: 'All recorded history' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
]
const TABLE_VIEWS = [
  { value: 'worse', label: 'Deteriorating' },
  { value: 'significant', label: 'Significant only' },
  { value: 'improved', label: 'Improved' },
  { value: 'stable', label: 'Stable' },
  { value: 'all', label: 'All ACMs' },
]

function Kpi({ icon: Icon, value, label, sub, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text"><strong>{value ?? '—'}</strong><span className="kpi-label">{label}</span>{sub && <small>{sub}</small>}</span>
    </button>
  )
}

function Field({ label, children }) {
  return <div className="tr-field"><span>{label}</span>{children}</div>
}

/**
 * Trend Analysis – Material Deterioration: how ACM condition has changed across inspections and surveillance,
 * district-wide with drill-down to school, building, floor, room and each ACM's timeline. Computed only from
 * recorded condition assessments.
 */
export default function Trends() {
  const [filters, setFilters] = useState(EMPTY)
  const [preset, setPreset] = useState('')
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('worse')
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [timeline, setTimeline] = useState(null) // ACM id
  const [rulesOpen, setRulesOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const metaQs = new URLSearchParams({ school: filters.school, building: filters.building, floor: filters.floor, room: filters.room }).toString()
  useEffect(() => {
    let cancelled = false
    request(`/trends/meta?${metaQs}`).then((m) => { if (!cancelled) setMeta(m) }).catch(() => {})
    return () => { cancelled = true }
  }, [metaQs])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const filterQs = new URLSearchParams(filters).toString()
  const qs = `${filterQs}&${new URLSearchParams({ trend: view, q: debouncedQ, page, pageSize: 10 })}`
  useEffect(() => {
    let cancelled = false
    request(`/trends?${qs}`).then((d) => { if (!cancelled) { setData(d); setError(null) } }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs, refreshKey])

  const set = useCallback((key) => (v) => {
    setFilters((f) => ({ ...f, [key]: v, ...Object.fromEntries((BELOW[key] ?? []).map((k) => [k, ''])) }))
    setPage(1)
  }, [])
  const applyPreset = (v) => {
    setPreset(v)
    const to = new Date()
    const from = new Date()
    from.setMonth(from.getMonth() - Number(v))
    setFilters((f) => ({ ...f, from: v ? iso(from) : '', to: v ? iso(to) : '' }))
    setPage(1)
  }
  const reset = () => { setFilters(EMPTY); setPreset(''); setQuery(''); setPage(1) }
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY) || query

  // Drill-down trail: District › School › Building › Floor › Room
  const opt = (list, id) => list?.find((x) => x.id === id)?.name
  const trail = [
    { key: 'district', label: 'District', clear: ['school', 'building', 'floor', 'room', 'acm'] },
    filters.school && { key: 'school', label: opt(meta?.schools, filters.school) ?? 'School', clear: ['building', 'floor', 'room', 'acm'] },
    filters.building && { key: 'building', label: opt(meta?.buildings, filters.building) ?? 'Building', clear: ['floor', 'room', 'acm'] },
    filters.floor && { key: 'floor', label: opt(meta?.floors, filters.floor) ?? 'Floor', clear: ['room', 'acm'] },
    filters.room && { key: 'room', label: opt(meta?.rooms, filters.room) ?? 'Room', clear: ['acm'] },
  ].filter(Boolean)
  const goTo = (crumb) => { setFilters((f) => ({ ...f, ...Object.fromEntries(crumb.clear.map((k) => [k, ''])) })); setPage(1) }
  const drill = (g) => {
    const level = data?.byLocation.level
    if (level === 'acm') setTimeline(g.id)
    else set(level)(g.id)
  }

  const k = data?.kpis
  const pctOf = (n) => (k?.total ? `${Math.round((n / k.total) * 100)}% of assessed` : '')
  const table = data?.table
  const levelName = LEVEL_LABEL[data?.byLocation.level ?? 'school']
  const options = (list, all) => [{ value: '', label: all }, ...(list ?? []).map((x) => (typeof x === 'string' ? { value: x, label: x } : { value: x.id, label: x.name }))]

  // PDF: a printable report of the current view, opened in a new window for "Save as PDF"
  const exportPdf = async () => {
    try {
      const d = await request(`/trends?${filterQs}&trend=worse&pageSize=100`)
      const w = window.open('', '_blank')
      if (!w) { setToast({ kind: 'error', text: 'Allow pop-ups to open the printable report.' }); return }
      const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      const scope = trail.map((t) => t.label).join(' › ') + (filters.from ? ` · ${fmtDay(filters.from)} – ${fmtDay(filters.to || iso(new Date()))}` : ' · all recorded history')
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ACM Deterioration Trends</title><style>
        body{font:12px/1.45 system-ui,sans-serif;color:#1d2733;margin:24px}h1{font-size:20px;margin:0}p{margin:4px 0 14px;color:#5b6b7b}
        .k{display:flex;gap:10px;margin:12px 0}.k div{border:1px solid #d7dee6;border-radius:6px;padding:8px 12px}.k b{display:block;font-size:18px}
        table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e3e8ee;padding:5px 6px;text-align:left;vertical-align:top}th{background:#f3f6f9}
        .n{font-size:11px;color:#5b6b7b;margin-top:14px}</style></head><body>
        <h1>ACM Condition Trends – Material Deterioration</h1><p>${esc(scope)} · generated ${esc(new Date().toLocaleString())}</p>
        <div class="k">${[['Assessed ACMs', d.kpis.total], ['Stable', d.kpis.stable], ['Deteriorating', d.kpis.deteriorating], ['Significantly Deteriorated', d.kpis.significant], ['Improved', d.kpis.improved], ['Schools Requiring Attention', d.kpis.schoolsAttention]].map(([l, v]) => `<div><b>${v}</b>${l}</div>`).join('')}</div>
        <table><thead><tr><th>ACM ID</th><th>School</th><th>Building</th><th>Room</th><th>Material</th><th>Previous</th><th>Current</th><th>Last Assessment</th><th>Trend</th><th>Follow-up</th></tr></thead><tbody>
        ${d.table.rows.map((r) => `<tr><td>${esc(r.acmId)}</td><td>${esc(r.school)}</td><td>${esc(r.building)}</td><td>${esc(r.room)}</td><td>${esc(r.material)}</td><td>${esc(r.previous ?? '—')}<br><small>${esc(fmtDay(r.previousDate))}</small></td><td>${esc(r.current)}</td><td>${esc(fmtDay(r.lastDate))}<br><small>${esc(r.lastType)}</small></td><td>${esc(TRENDS[r.trend].label)}</td><td>${esc(r.followUp.label)}</td></tr>`).join('')}
        </tbody></table>${d.table.total > d.table.rows.length ? `<p class="n">First ${d.table.rows.length} of ${d.table.total} deteriorating ACMs – use Excel export for the full list.</p>` : ''}
        <p class="n">Trends compare each ACM's latest recorded condition assessment with the one before, on the AHERA scale (Good, Damaged, Significantly Damaged). They describe physical condition only – they do not predict future condition and are not a measure of airborne asbestos.</p>
        <script>window.onload=()=>window.print()</script></body></html>`)
      w.document.close()
    } catch (e) {
      setToast({ kind: 'error', text: e.message })
    }
  }

  return (
    <div className="tr-page">
      <div className="tr-head">
        <div>
          <h1><TrendingDown size={24} />Trend Analysis – Material Deterioration</h1>
          <p>How ACM condition is changing across inspections and 6-month surveillance, district-wide down to each material.</p>
        </div>
        <div className="tr-head-actions">
          <a className="u-btn u-btn-outline" href={`${API_BASE}/trends/export.csv?${filterQs}`} download><FileSpreadsheet size={15} />Excel</a>
          <button type="button" className="u-btn u-btn-outline" onClick={exportPdf}><FileText size={15} />PDF</button>
        </div>
      </div>

      <p className="tr-note"><Info size={14} /><span>Calculated from recorded condition assessments only (AHERA scale: Good → Damaged → Significantly Damaged), comparing each ACM&apos;s latest assessment with the one before. Trends describe physical condition – they don&apos;t predict future condition and aren&apos;t a measure of airborne asbestos (see <Link to="/air-monitoring">Air Monitoring</Link>).</span></p>

      <section className="u-card tr-filters" aria-label="Filters">
        <div className="tr-filter-grid">
          <Field label="School"><SearchSelect variant="field" label="School" value={filters.school} onChange={set('school')} searchPlaceholder="Search schools…" options={options(meta?.schools, 'All Schools')} /></Field>
          <Field label="Building"><SearchSelect variant="field" label="Building" value={filters.building} onChange={set('building')} disabled={!filters.school} searchPlaceholder="Search buildings…" options={options(meta?.buildings, filters.school ? 'All Buildings' : 'Select a school first')} /></Field>
          <Field label="Floor"><SearchSelect variant="field" label="Floor" value={filters.floor} onChange={set('floor')} disabled={!filters.building} searchable={false} options={options(meta?.floors, filters.building ? 'All Floors' : 'Select a building first')} /></Field>
          <Field label="Room"><SearchSelect variant="field" label="Room" value={filters.room} onChange={set('room')} disabled={!filters.floor} searchPlaceholder="Search rooms…" options={options(meta?.rooms, filters.floor ? 'All Rooms' : 'Select a floor first')} /></Field>
          <Field label="ACM ID"><SearchSelect variant="field" label="ACM" value={filters.acm} onChange={set('acm')} disabled={!filters.room} searchPlaceholder="Search ACMs…" options={options(meta?.acms, filters.room ? 'All ACMs' : 'Select a room first')} /></Field>
          <Field label="Material Type"><SearchSelect variant="field" label="Material type" value={filters.materialType} onChange={set('materialType')} searchPlaceholder="Search…" options={options(meta?.materialTypes, 'All Materials')} /></Field>
          <Field label="Classification"><SearchSelect variant="field" label="Classification" value={filters.classification} onChange={set('classification')} searchable={false} options={options(meta?.classifications, 'All')} /></Field>
          <Field label="Friability"><SearchSelect variant="field" label="Friability" value={filters.friability} onChange={set('friability')} searchable={false} options={options(meta?.friability, 'All')} /></Field>
          <Field label="Current Condition"><SearchSelect variant="field" label="Condition" value={filters.condition} onChange={set('condition')} searchable={false} options={options(meta?.conditions, 'All Conditions')} /></Field>
          <Field label="Inspection Type"><SearchSelect variant="field" label="Inspection type" value={filters.inspectionType} onChange={set('inspectionType')} searchable={false} options={options(meta?.inspectionTypes, 'All Types')} /></Field>
          <Field label="Period"><SearchSelect variant="field" label="Period" value={preset} onChange={applyPreset} searchable={false} options={PRESETS} /></Field>
          <Field label="From – To">
            <span className="tr-dates">
              <input type="date" className="u-input" value={filters.from} max={filters.to || undefined} onChange={(e) => { setPreset(''); set('from')(e.target.value) }} aria-label="From" />
              <input type="date" className="u-input" value={filters.to} min={filters.from || undefined} onChange={(e) => { setPreset(''); set('to')(e.target.value) }} aria-label="To" />
            </span>
          </Field>
        </div>
        <div className="tr-filter-foot">
          <nav className="tr-trail" aria-label="Drill-down">
            {trail.map((c, i) => (
              <span key={c.key}>
                {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
                {i < trail.length - 1 ? <button type="button" onClick={() => goTo(c)}>{c.label}</button> : <strong>{c.label}</strong>}
              </span>
            ))}
          </nav>
          <button type="button" className="u-btn u-btn-outline u-btn-sm" disabled={!active} onClick={reset}><RotateCcw size={13} />Reset filters</button>
        </div>
      </section>

      {error && <div className="u-banner">Couldn&apos;t load the trend analysis ({error}).</div>}

      <div className="tr-kpis">
        <Kpi icon={Layers} value={k?.total} label="Total ACM Records" sub={k && `${k.baseline} with a single assessment`} tone="primary" active={view === 'all'} onClick={() => { setView('all'); setPage(1) }} />
        <Kpi icon={ShieldCheck} value={k?.stable} label="Stable ACMs" sub={pctOf(k?.stable)} tone="good" active={view === 'stable'} onClick={() => { setView('stable'); setPage(1) }} />
        <Kpi icon={TriangleAlert} value={k?.deteriorating} label="Deteriorating ACMs" sub={pctOf(k?.deteriorating)} tone="warning" active={view === 'worse'} onClick={() => { setView('worse'); setPage(1) }} />
        <Kpi icon={OctagonAlert} value={k?.significant} label="Significantly Deteriorated" sub={pctOf(k?.significant)} tone="critical" active={view === 'significant'} onClick={() => { setView('significant'); setPage(1) }} />
        <Kpi icon={TrendingUp} value={k?.improved} label="Improved ACMs" sub={pctOf(k?.improved)} tone="primary" active={view === 'improved'} onClick={() => { setView('improved'); setPage(1) }} />
        <Kpi icon={School} value={k?.schoolsAttention} label="Schools Requiring Attention" sub="deteriorating or significantly damaged ACM" tone="violet" active={false}
          onClick={() => { setView('worse'); setPage(1) }} />
      </div>

      <div className="tr-row">
        <section className="u-card tr-card">
          <header className="tr-card-head">
            <h2>{levelName}-wise Deterioration</h2>
            <span className="u-muted">{data?.byLocation.level === 'acm' ? 'Click an ACM for its timeline' : `Worst first · click to drill into a ${levelName.toLowerCase()}`}</span>
          </header>
          {data ? <LocationChart data={data.byLocation} onDrill={drill} /> : <p className="tr-empty">Loading…</p>}
        </section>
        <section className="u-card tr-card">
          <header className="tr-card-head"><h2>Condition by Material Type</h2><span className="u-muted">Current condition</span></header>
          {data ? <MaterialChart data={data.byMaterial} /> : <p className="tr-empty">Loading…</p>}
        </section>
      </div>

      <div className="tr-row">
        <section className="u-card tr-card">
          <header className="tr-card-head"><h2>Deterioration Over Time</h2><span className="u-muted">Condition changes between consecutive assessments, per month</span></header>
          {data ? <MonthlyChart data={data.monthly} /> : <p className="tr-empty">Loading…</p>}
        </section>
        <section className="u-card tr-card tr-alerts">
          <header className="tr-card-head">
            <h2><BellRing size={16} />Alerts {data && <span className="tr-count">{data.alerts.length}</span>}</h2>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setRulesOpen(true)}><Settings2 size={13} />Configure</button>
          </header>
          {data && !data.alerts.length && <p className="tr-empty">No alert rules match for these filters.</p>}
          <ul className="tr-alert-list">
            {data?.alerts.slice(0, 8).map((a, i) => (
              <li key={i} className={a.severity}>
                {a.severity === 'critical' ? <OctagonAlert size={15} /> : <TriangleAlert size={15} />}
                <span>{a.text}</span>
                {a.acm && <button type="button" className="tr-link" onClick={() => setTimeline(a.acm)}>Timeline <ArrowRight size={12} /></button>}
              </li>
            ))}
          </ul>
          {data?.alerts.length > 8 && <p className="u-muted tr-more">+{data.alerts.length - 8} more</p>}
        </section>
      </div>

      <section className="u-card tr-card">
        <header className="tr-card-head tr-table-head">
          <h2>ACM Condition Records {table && <span className="tr-count">{table.total}</span>}</h2>
          <div className="tr-table-tools">
            <div className="tr-seg" role="group" aria-label="Show">
              {TABLE_VIEWS.map((v) => <button key={v.value} type="button" className={view === v.value ? 'on' : undefined} aria-pressed={view === v.value} onClick={() => { setView(v.value); setPage(1) }}>{v.label}</button>)}
            </div>
            <label className="u-search"><Search size={15} /><input type="search" placeholder="ACM ID, material, school, room…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search ACMs" /></label>
          </div>
        </header>
        <div className="u-table-wrap">
          <table className="u-table tr-table">
            <thead>
              <tr><th>ACM ID</th><th>School</th><th className="tr-col-b">Building</th><th>Room</th><th>Material Type</th><th>Previous Condition</th><th>Current Condition</th><th>Last Inspection</th><th>Trend</th><th>Follow-up</th></tr>
            </thead>
            <tbody>
              {table?.rows.map((r) => {
                const t = TRENDS[r.trend]
                return (
                  <tr key={r.id} onClick={() => setTimeline(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setTimeline(r.id) }}>
                    <td className="u-nowrap"><span className="a-mono tr-acm">{r.acmId}</span></td>
                    <td>{r.school}</td>
                    <td className="tr-col-b">{r.building}</td>
                    <td>{r.room}</td>
                    <td>{r.materialType}<small className="tr-sub">{r.material}</small></td>
                    <td>{r.previous ? <><span className="tr-cond" style={{ '--c': CONDITIONS[r.previous].color }}>{r.previous}</span><small className="tr-sub">{fmtDay(r.previousDate)}</small></> : <span className="u-muted">—</span>}</td>
                    <td><span className="tr-cond" style={{ '--c': CONDITIONS[r.current].color }}>{r.current}</span></td>
                    <td className="u-nowrap">{fmtDay(r.lastDate)}<small className="tr-sub">{r.lastLink ? <Link to={r.lastLink} onClick={(e) => e.stopPropagation()}>{r.lastType}</Link> : r.lastType}</small></td>
                    <td><span className={`tr-badge ${r.trend}`} style={{ '--c': t.color }}>{t.short}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.followUp.link ? <Link to={r.followUp.link} className="tr-fu ok">{r.followUp.label}</Link>
                        : <span className={`tr-fu ${r.followUp.status}`}>{r.followUp.label}</span>}
                    </td>
                  </tr>
                )
              })}
              {table && !table.rows.length && <tr><td colSpan={10} className="u-empty">No ACMs match.</td></tr>}
            </tbody>
          </table>
        </div>
        {table && (
          <footer className="u-pager">
            <span className="u-muted">{table.total ? `Showing ${(table.page - 1) * table.pageSize + 1} to ${Math.min(table.total, table.page * table.pageSize)} of ${table.total}` : 'No results'}</span>
            <nav className="u-pages" aria-label="Pagination">
              <button type="button" disabled={table.page <= 1} onClick={() => setPage(table.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span className="u-gap">Page {table.page} of {table.pages}</span>
              <button type="button" disabled={table.page >= table.pages} onClick={() => setPage(table.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          </footer>
        )}
      </section>

      {timeline && <AcmTimelineDrawer acmId={timeline} onClose={() => setTimeline(null)} />}
      {rulesOpen && <AlertRulesDrawer onClose={() => setRulesOpen(false)} onSaved={() => { setRulesOpen(false); setRefreshKey((n) => n + 1); setToast({ kind: 'success', text: 'Alert rules saved.' }) }} />}
      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
