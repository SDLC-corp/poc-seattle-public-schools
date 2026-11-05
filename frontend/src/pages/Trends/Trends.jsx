import { useEffect, useState } from 'react'
import { Layers, CircleCheck, TriangleAlert, CircleAlert, TrendingUp, TrendingDown, ArrowRight, ArrowUpRight, FileSpreadsheet, Info, ChevronDown, ChevronUp } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, API_BASE } from '../../lib/api'
import { ConditionLine, ConditionDonut, MaterialStack } from './TrendCharts'
import AcmTimelineDrawer from './AcmTimelineDrawer'
import { CONDITION_VIEW, CONDITION_KEYS, fmtDay } from './trendsMeta'
import '../Users/users.css'
import './trends.css'

const PERIODS = [
  { value: 6, label: 'Last 6 Months' },
  { value: 12, label: 'Last 12 Months' },
  { value: 24, label: 'Last 24 Months' },
]
const KPI_ICON = { Good: CircleCheck, Damaged: TriangleAlert, 'Significantly Damaged': CircleAlert }
const DIRECTION = {
  up: { icon: TrendingUp, cls: 'up', label: 'Worsening' },
  flat: { icon: ArrowRight, cls: 'flat', label: 'No clear change' },
  down: { icon: TrendingDown, cls: 'down', label: 'Improving' },
}
const share = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—')

function Pill({ condition }) {
  return <span className={`tr-pill ${CONDITION_VIEW[condition].tone}`}>{condition}</span>
}

/**
 * Trend Analysis – Material Deterioration: every surveyed ACM by its latest recorded condition (AHERA scale), how
 * that split changed month by month, by material type and by school, and the ACMs that got worse in the period.
 */
export default function Trends() {
  const [school, setSchool] = useState('')
  const [months, setMonths] = useState(12)
  const [materialType, setMaterialType] = useState('')
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [timeline, setTimeline] = useState(null) // ACM id

  useEffect(() => {
    request('/trends/meta').then(setMeta).catch(() => {})
  }, [])
  const qs = new URLSearchParams({ school, materialType, months }).toString()
  useEffect(() => {
    let cancelled = false
    request(`/trends/overview?${qs}`).then((d) => { if (!cancelled) { setData(d); setError(null) } }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [qs])

  const k = data?.kpis
  const scope = school ? (meta?.schools.find((s) => s.id === school)?.name ?? 'School') : 'All Schools'
  const worse = data?.deteriorating ?? []
  const shown = showAll ? worse : worse.slice(0, 5)

  return (
    <div className="tr-page">
      <div className="tr-head">
        <div>
          <h1>Trend Analysis – Material Deterioration</h1>
          <p>Track condition changes and deterioration trends across schools</p>
        </div>
        <div className="tr-head-filters">
          <div className="tr-sel tr-sel-school"><SearchSelect variant="field" label="School" value={school} onChange={setSchool} searchPlaceholder="Search schools…"
            options={[{ value: '', label: 'All Schools' }, ...(meta?.schools ?? []).map((s) => ({ value: s.id, label: s.name }))]} /></div>
          <div className="tr-sel"><SearchSelect variant="field" label="Period" value={months} onChange={setMonths} searchable={false} options={PERIODS} /></div>
          <div className="tr-sel"><SearchSelect variant="field" label="Material" value={materialType} onChange={setMaterialType} searchPlaceholder="Search materials…"
            options={[{ value: '', label: 'All Materials' }, ...(meta?.materialTypes ?? []).map((m) => ({ value: m, label: m }))]} /></div>
          <a className="u-btn u-btn-outline tr-export" href={`${API_BASE}/trends/export.csv?${new URLSearchParams({ school, materialType })}`} download title="Download the ACM condition list (CSV)"><FileSpreadsheet size={15} />Excel</a>
        </div>
      </div>

      {error && <div className="u-banner">Couldn&apos;t load the trend analysis ({error}).</div>}

      <div className="tr-kpis">
        <div className="tr-kpi primary">
          <span className="tr-kpi-icon"><Layers size={22} /></span>
          <span className="tr-kpi-text"><strong>{k ? k.total.toLocaleString() : '—'}</strong><span>Total ACMs</span></span>
        </div>
        {CONDITION_KEYS.map((c) => {
          const Icon = KPI_ICON[c]
          return (
            <div key={c} className={`tr-kpi ${CONDITION_VIEW[c].tone}`} title={`Current condition: ${c}`}>
              <span className="tr-kpi-icon"><Icon size={22} /></span>
              <span className="tr-kpi-text"><strong>{k ? k[c].toLocaleString() : '—'}</strong><span>{CONDITION_VIEW[c].label}</span></span>
              <em>{k ? share(k[c], k.total) : ''}</em>
            </div>
          )
        })}
      </div>

      <div className="tr-row tr-row-a">
        <section className="u-card tr-card">
          <header className="tr-card-head"><h2>Material Deterioration Trend ({scope})</h2></header>
          {data ? <ConditionLine series={data.series} /> : <p className="tr-empty">Loading…</p>}
        </section>
        <section className="u-card tr-card">
          <header className="tr-card-head"><h2>Condition Distribution ({scope})</h2></header>
          {k ? (k.total ? <ConditionDonut kpis={k} /> : <p className="tr-empty">No assessed ACMs for these filters.</p>) : <p className="tr-empty">Loading…</p>}
        </section>
      </div>

      <div className="tr-row tr-row-b">
        <section className="u-card tr-card">
          <header className="tr-card-head"><h2>Deterioration by Material Type ({scope})</h2></header>
          {data ? <MaterialStack items={data.byMaterial} /> : <p className="tr-empty">Loading…</p>}
        </section>
        <section className="u-card tr-card">
          <header className="tr-card-head">
            <h2>Deterioration Trend by School</h2>
            <span className="u-muted">{data ? `${data.bySchool.length} school${data.bySchool.length === 1 ? '' : 's'} · click to filter` : ''}</span>
          </header>
          <div className="u-table-wrap tr-school-wrap">
            <table className="u-table tr-table tr-school-table">
              <thead><tr><th>School</th><th className="n">Total ACMs</th><th className="c">Stable</th><th className="c">Minor</th><th className="c">Significant</th><th className="c">Deterioration Trend</th></tr></thead>
              <tbody>
                {data?.bySchool.map((s) => {
                  const d = DIRECTION[s.direction]
                  return (
                    <tr key={s.id} className={school === s.id ? 'on' : undefined} onClick={() => setSchool(school === s.id ? '' : s.id)}>
                      <td>{s.name}</td>
                      <td className="n">{s.total.toLocaleString()}</td>
                      {CONDITION_KEYS.map((c) => <td key={c} className="c"><span className={`tr-share ${CONDITION_VIEW[c].tone}`}>{share(s[c], s.total)}</span></td>)}
                      <td className="c">
                        <span className={`tr-dir ${d.cls}`} title={`${d.label}: damaged share ${s.damagedShareChange > 0 ? '+' : ''}${s.damagedShareChange} pts since the period started`}>
                          <d.icon size={18} /><span className="tr-sr">{d.label}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {data && !data.bySchool.length && <tr><td colSpan={6} className="u-empty">No assessed ACMs for these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="u-card tr-card">
        <header className="tr-card-head">
          <h2>Top Deteriorating ACMs ({school ? scope : 'Across Schools'})</h2>
          <span className="u-muted">{data ? `${worse.length} ACM${worse.length === 1 ? '' : 's'} worse at their latest assessment · click for the condition timeline` : ''}</span>
        </header>
        <div className="u-table-wrap">
          <table className="u-table tr-table tr-top-table">
            <thead><tr><th>ACM ID</th><th>School</th><th>Location</th><th>Material</th><th className="c">Previous Condition</th><th className="c">Current Condition</th><th>Change</th><th className="n">Last Inspection</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => setTimeline(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setTimeline(r.id) }}>
                  <td className="u-nowrap"><span className="a-mono tr-acm">{r.acmId}</span></td>
                  <td>{r.school}</td>
                  <td>{r.location || '—'}</td>
                  <td>{r.material}</td>
                  <td className="c"><Pill condition={r.previous} /></td>
                  <td className="c"><Pill condition={r.current} /></td>
                  <td className="u-nowrap"><span className="tr-changed"><ArrowUpRight size={16} />Deteriorated</span></td>
                  <td className="n u-nowrap">{fmtDay(r.lastDate)}<small className="tr-sub">{r.lastType}</small></td>
                </tr>
              ))}
              {data && !worse.length && <tr><td colSpan={8} className="u-empty">No ACM got worse in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        {worse.length > 5 && (
          <button type="button" className="tr-more-btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? <><ChevronUp size={14} />Show top 5</> : <><ChevronDown size={14} />Show all {worse.length}</>}
          </button>
        )}
      </section>

      <p className="tr-note"><Info size={14} /><span>From recorded condition assessments (ACM inventory, inspections and 6-month surveillance) on the AHERA scale: Good = stable, Damaged = minor deterioration, Significantly Damaged = significant deterioration. Trends describe physical condition only; they don&apos;t predict future condition or measure airborne asbestos.</span></p>

      {timeline && <AcmTimelineDrawer acmId={timeline} onClose={() => setTimeline(null)} />}
    </div>
  )
}
