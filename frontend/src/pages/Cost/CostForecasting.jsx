import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  Layers, Tag, Sparkles, CalendarDays, TrendingUp, Target, Info, ChevronRight, Search, ArrowUpDown, ChevronLeft, FileSpreadsheet,
  Building2, Percent, Wrench, BarChart3, ShieldCheck, FileText, CalendarRange, Wallet, Gauge, Scale, Receipt,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { Kpi, Card, Field } from './CostShared'
import { LineChart, StackedColumns, HBars, Donut } from './CostCharts'
import {
  CURRENT_YEAR, HIST_YEARS, CATEGORIES, SCHOOLS, BUILDINGS, ACMS, MATERIALS, MATERIAL, SCENARIOS, FORECAST_ITEMS, BUDGETS, PAST_PREDICTIONS,
  rateIn, predictedRate, recentActivity,
} from './costData'
import { usd, pct, sum, actuals, forecastYears, schoolName, buildingName, fmtDate, downloadCsv } from './costUtils'

const LEVELS = [
  { id: 'district', label: 'District Wise' },
  { id: 'school', label: 'School Wise' },
  { id: 'building', label: 'Building Wise' },
  { id: 'acm', label: 'ACM Wise' },
]
const PERIODS = [1, 3, 5]
const periodLabel = (n) => (n === 1 ? `Next Year (${CURRENT_YEAR + 1})` : `Next ${n} Years (${CURRENT_YEAR + 1}–${CURRENT_YEAR + n})`)
const SCENARIO_LABEL = { low: 'Low', expected: 'Expected', high: 'High' }
const REF_QTY = 500 // reference quantity for the unit-cost trend table
const shortName = (name) => name.replace(/ (&|\/) .*| \(.*\)/, '') // "Floor Tile & Mastic" → "Floor Tile"
const unitLabel = (u) => (u === 'sq ft' ? 'sq. ft.' : u === 'lf' ? 'linear ft.' : u)
const ACTIVITY_ORDER =['Inspection', 'Maintenance', 'Abatement', 'Air Monitoring', 'Disposal']
const COLUMNS = [
  { key: 'school', label: 'School', get: (r) => schoolName(r.schoolId) },
  { key: 'building', label: 'Building', get: (r) => buildingName(r.buildingId) },
  { key: 'acmId', label: 'ACM ID', get: (r) => r.acmId ?? '—' },
  { key: 'material', label: 'Material', get: (r) => r.material },
  { key: 'qty', label: 'Quantity', num: true, get: (r) => r.qty },
  { key: 'unit', label: 'Unit', get: (r) => r.unit },
  { key: 'currentRate', label: 'Current Rate', num: true, get: (r) => r.currentRate, fmt: (v) => usd(v, { cents: true }) },
  { key: 'estimated', label: 'Estimated Cost', num: true, get: (r) => r.estimated, fmt: (v) => usd(v) },
  { key: 'predicted', label: 'Predicted Cost', num: true, get: (r) => r.predictedS, fmt: (v) => usd(v) },
  { key: 'year', label: 'Forecast Year', num: true, get: (r) => r.year },
]
// Forecast Reports shortcuts: each opens that report's preview in Cost Reports
const REPORT_LINKS = [
  { id: 'annual', icon: CalendarDays, title: 'Annual Cost Forecast', desc: 'Year-wise future expenses' },
  { id: 'activity', icon: Wrench, title: 'Activity-wise Forecast', desc: 'Inspection, removal, maintenance, etc.' },
  { id: 'school', icon: Building2, title: 'School-wise Forecast', desc: 'Estimated cost per school' },
  { id: 'actualPredicted', icon: BarChart3, title: 'Historical vs Predicted', desc: 'Actual cost vs AI prediction comparison' },
  { id: 'building', icon: Layers, title: 'Building-wise Forecast', desc: 'Building-level cost projection' },
  { id: 'budget3', icon: Target, title: '3-Year Budget Projection', desc: 'Consolidated 3-year budget plan' },
  { id: 'acm', icon: Percent, title: 'ACM-wise Cost Prediction', desc: 'Cost by ACM type (pipe, tile, insulation)' },
  { id: 'actualPredicted', icon: ShieldCheck, title: 'Forecast Accuracy Report', desc: 'Prediction vs actual cost variance' },
]

/** Forecast at district, school, building or ACM level over 1, 3 or 5 years, with low / expected / high scenarios. */
export default function CostForecasting() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const level = LEVELS.some((l) => l.id === params.get('level')) ? params.get('level') : 'district'
  const building0 = params.get('building') ?? ''
  const [sel, setSel] = useState(() => ({
    school: params.get('school') ?? (building0 ? BUILDINGS.find((b) => b.id === building0)?.schoolId ?? '' : ''),
    building: building0, floor: '', room: '', acm: '',
  }))
  const [years, setYears] = useState(3)
  const [scenario, setScenario] = useState('expected')
  const [materialId, setMaterialId] = useState('floor-tile')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'predicted', dir: 'desc' })
  const [page, setPage] = useState(1)

  const setLevel = (id) => { const p = new URLSearchParams(params); p.set('level', id); setParams(p, { replace: true }) }
  const choose = (key) => (v) => {
    const below = { school: ['building', 'floor', 'room', 'acm'], building: ['floor', 'room', 'acm'], floor: ['room', 'acm'], room: ['acm'], acm: [] }[key]
    setSel((s) => ({ ...s, [key]: v, ...Object.fromEntries(below.map((k) => [k, ''])) }))
    setPage(1)
  }

  // Options down the hierarchy
  const opts = useMemo(() => {
    const acms = ACMS.filter((a) => (!sel.school || a.schoolId === sel.school) && (!sel.building || a.buildingId === sel.building))
    return {
      buildings: BUILDINGS.filter((b) => b.schoolId === sel.school),
      floors: [...new Set(acms.map((a) => a.floor))],
      rooms: [...new Set(acms.filter((a) => a.floor === sel.floor).map((a) => a.room))],
      acms: acms.filter((a) => a.floor === sel.floor && a.room === sel.room),
    }
  }, [sel])

  const factor = SCENARIOS[scenario]
  const fYears = forecastYears(years)
  const items = useMemo(() => FORECAST_ITEMS
    .filter((f) => f.year > CURRENT_YEAR && f.year <= CURRENT_YEAR + years
      && (!sel.school || f.schoolId === sel.school) && (!sel.building || f.buildingId === sel.building)
      && (!sel.floor || f.floor === sel.floor) && (!sel.room || f.room === sel.room) && (!sel.acm || f.acmId === sel.acm))
    .map((f) => ({ ...f, predictedS: f.predicted * factor })), [sel, years, factor])

  // KPIs
  const hist = actuals({ school: sel.school, building: sel.building })
  const histTotal = sum(hist, 'total')
  const estimated = sum(items, 'estimated')
  const predicted = sum(items, 'predictedS')
  const predictedNext = sum(items.filter((f) => f.year === CURRENT_YEAR + 1), 'predictedS')
  const priced = items.filter((f) => f.materialId)
  const escalation = sum(priced, 'estimated') ? sum(priced, (f) => f.estimated * MATERIAL[f.materialId].escalation) / sum(priced, 'estimated') : 0
  const accuracy = PAST_PREDICTIONS.reduce((n, p) => n + (1 - Math.abs(p.actual - p.predicted) / p.actual), 0) / PAST_PREDICTIONS.length
  const budgetPeriod = sel.building || sel.floor || sel.room || sel.acm ? null
    : sum(sel.school ? [sel.school] : SCHOOLS.map((s) => s.id), (id) => sum(fYears, (y) => BUDGETS[id][y]))

  // Unit-cost trend for the chosen material: actual rates, today's rate, then the simulated prediction
  const m = MATERIAL[materialId]
  const trendYears = [...HIST_YEARS, ...fYears]
  const unit = (v) => `$${v.toFixed(2)}`
  const rateLine = {
    x: trendYears.map((y) => (y === CURRENT_YEAR ? `${y}\n(Current)` : y > CURRENT_YEAR ? `${y}\n(Forecast)` : String(y))),
    series: [
      { key: 'actual', label: 'Historical Actual Cost', color: '#2a78d6', area: true, labels: true, values: trendYears.map((y) => (y <= CURRENT_YEAR ? rateIn(m, y) : null)) },
      { key: 'baseline', label: 'Current Cost (Baseline)', color: '#8b6fd6', dot: true, values: trendYears.map((y) => (y === CURRENT_YEAR ? m.rate : null)) },
      {
        key: 'forecast', label: 'AI Forecast (Predicted)', color: '#8b6fd6', dashed: true, area: true, labels: true, labelSkip: [HIST_YEARS.length - 1],
        values: trendYears.map((y) => (y === CURRENT_YEAR ? m.rate : y > CURRENT_YEAR ? predictedRate(m, y) * factor : null)),
      },
    ],
  }
  const trendRows = [
    ...HIST_YEARS.filter((y) => y < CURRENT_YEAR).map((y) => ({ label: `${y} (Actual)`, rate: rateIn(m, y), kind: 'actual' })),
    // Paid so far this year: invoices mix last year's contracted rates with today's quotations
    { label: `${CURRENT_YEAR} (Actual)`, rate: (rateIn(m, CURRENT_YEAR - 1) + m.rate) / 2, kind: 'actual' },
    { label: 'Current Market Rate', rate: m.rate, kind: 'current' },
    ...fYears.map((y) => ({ label: `${y} (AI Prediction)`, rate: predictedRate(m, y) * factor, kind: 'predicted' })),
  ]

  // Category per year, cumulative and per-activity summary
  const byCat = CATEGORIES.map((c) => ({ key: c.id, label: c.id, color: c.color, values: fYears.map((y) => sum(items.filter((f) => f.year === y && f.category === c.id), 'predictedS')) }))
  const yearTotals = fYears.map((y) => sum(items.filter((f) => f.year === y), 'predictedS'))
  const cumulative = yearTotals.reduce((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], [])
  const activityRows = CATEGORIES.map((c, i) => ({ ...c, years: byCat[i].values, total: sum(byCat[i].values, (v) => v) })).filter((r) => r.total > 0)
    .sort((a, b) => ACTIVITY_ORDER.indexOf(a.id) - ACTIVITY_ORDER.indexOf(b.id))

  // Simulated insights for the current scope
  const insights = []
  const lastYear = rateIn(m, CURRENT_YEAR - 1)
  insights.push({ icon: TrendingUp, tone: 'critical', title: `${m.name} costs are increasing`, text: `Historical trend shows a ~${pct(m.escalation)} annual rise (${pct(lastYear / rateIn(m, HIST_YEARS[0]) - 1, 0)} since ${HIST_YEARS[0]}).` })
  insights.push({ icon: Tag, tone: 'primary', title: 'Current contractor rates are higher', text: `Today's rate (${unit(m.rate)}/${m.unit}) is ~${pct(m.rate / lastYear - 1, 0)} above last year (${unit(lastYear)}/${m.unit}).` })
  const topCat = [...activityRows].sort((a, b) => b.total - a.total)[0]
  if (topCat) insights.push({ icon: Layers, tone: 'violet', title: `${topCat.id} is the largest projected expense`, text: `About ${pct(topCat.total / predicted, 0)} of the ${fYears[0]}–${fYears.at(-1)} forecast (${usd(topCat.total)}).` })
  const tight = SCHOOLS.filter((s) => !sel.school || s.id === sel.school).map((s) => ({
    s,
    pred: sum(FORECAST_ITEMS.filter((f) => f.schoolId === s.id && f.year > CURRENT_YEAR && f.year <= CURRENT_YEAR + years), 'predicted') * factor,
    budget: sum(fYears, (y) => BUDGETS[s.id][y]),
  })).sort((a, b) => b.pred / b.budget - a.pred / a.budget)[0]
  if (tight) {
    const over = tight.pred / tight.budget - 1
    insights.push(over > 0
      ? { icon: Building2, tone: 'warning', title: `${tight.s.name} may need a higher budget`, text: `Projected ${fYears[0]}–${fYears.at(-1)} cost is ${pct(over, 0)} above its approved budget.` }
      : { icon: Building2, tone: 'good', title: 'Budgets cover the forecast', text: `${sel.school ? tight.s.name : 'Every school'} stays within its approved ${fYears[0]}–${fYears.at(-1)} budget.` })
  }

  // Breakdown one level below the view (district → schools, school → buildings, building → floors/rooms, ACM → ACMs)
  const group = useMemo(() => {
    const keyOf = { district: (f) => f.schoolId, school: (f) => f.buildingId ?? 'school-wide', building: (f) => (f.floor ? `${f.floor} · ${f.room}` : 'School-wide'), acm: (f) => f.acmId ?? 'School-wide inspection' }[level]
    const nameOf = { district: (k) => schoolName(k), school: (k) => (k === 'school-wide' ? 'School-wide' : sel.school ? buildingName(k) : `${buildingName(k)} · ${schoolName(BUILDINGS.find((b) => b.id === k)?.schoolId)}`), building: (k) => k, acm: (k) => k }[level]
    const map = new Map()
    for (const f of items) {
      const k = keyOf(f)
      if (!map.has(k)) map.set(k, { key: k, name: nameOf(k), acms: new Set(), pred: 0, years: Object.fromEntries(fYears.map((y) => [y, 0])) })
      const g = map.get(k)
      if (f.acmId) g.acms.add(f.acmId)
      g.pred += f.predictedS
      g.years[f.year] += f.predictedS
    }
    return [...map.values()].sort((a, b) => b.pred - a.pred)
  }, [items, level, fYears, sel.school])
  const drillGroup = (g) => {
    if (level === 'district') { choose('school')(g.key); setLevel('school') } else if (level === 'school' && g.key !== 'school-wide') { choose('building')(g.key); setLevel('building') }
  }
  // Spend & budget: current year against the approved budget, comparisons and latest invoices
  const ytd = sum(hist.filter((x) => x.year === CURRENT_YEAR), 'total')
  const yearEstimate = (ytd * 12) / 10 // YTD covers January–October
  const budget = sel.building ? null : sum(sel.school ? [sel.school] : SCHOOLS.map((s) => s.id), (id) => BUDGETS[id][CURRENT_YEAR])
  const bySchool = SCHOOLS.filter((s) => !sel.school || s.id === sel.school).map((s) => ({
    key: s.id, label: s.name, value: sum(items.filter((f) => f.schoolId === s.id), 'predictedS'),
    sub: `Historical ${usd(sum(hist.filter((x) => x.schoolId === s.id), 'total'), { compact: true })}`,
  })).sort((a, b) => b.value - a.value)
  const byBuilding = BUILDINGS.filter((b) => (!sel.school || b.schoolId === sel.school) && (!sel.building || b.id === sel.building))
    .map((b) => ({ key: b.id, label: b.name, sub: schoolName(b.schoolId), value: sum(items.filter((f) => f.buildingId === b.id), 'predictedS'), color: '#8b6fd6' }))
    .sort((a, b) => b.value - a.value).slice(0, 8)
  const recent = recentActivity().filter((x) => (!sel.school || x.schoolId === sel.school) && (!sel.building || x.buildingId === sel.building))
  const byMaterial = MATERIALS.map((x) => ({ key: x.id, label: x.name, sub: `${usd(x.rate, { cents: true })} / ${x.unit} · +${pct(x.escalation)} a year`, value: sum(items.filter((f) => f.materialId === x.id), 'predictedS'), color: '#8b6fd6' }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value)

  // Detailed table
  const col = COLUMNS.find((c) => c.key === sort.key)
  const term = q.trim().toLowerCase()
  const rows = items.filter((r) => !term || [schoolName(r.schoolId), buildingName(r.buildingId), r.acmId, r.material, r.category].some((v) => String(v ?? '').toLowerCase().includes(term)))
    .sort((a, b) => { const x = col.get(a); const y = col.get(b); return (sort.dir === 'asc' ? 1 : -1) * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) })
  const pageSize = 12
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const cur = Math.min(page, pages)
  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const trail = [
    { label: 'District', clear: 'school' },
    sel.school && { label: schoolName(sel.school), clear: 'building' },
    sel.building && { label: buildingName(sel.building), clear: 'floor' },
    sel.floor && { label: sel.floor, clear: 'room' },
    sel.room && { label: sel.room, clear: 'acm' },
    sel.acm && { label: sel.acm },
  ].filter(Boolean)
  const range = `${fYears[0]}${years > 1 ? ` – ${fYears.at(-1)}` : ''}`

  return (
    <div className="ci-page">
      <div className="ci-head">
        <div>
          <h1>Cost Forecasting<span className="ci-info" title="Estimates price planned work at current rates; AI predictions are simulated from the observed annual rate escalation."><Info size={16} /></span></h1>
          <p>AI-powered cost prediction using historical data and current market rates</p>
        </div>
        <div className="ci-head-filters">
          <label className="ci-inline"><span>School District:</span>
            <SearchSelect variant="field" label="School" value={sel.school} onChange={choose('school')} options={[{ value: '', label: 'All Schools' }, ...SCHOOLS.map((s) => ({ value: s.id, label: s.name }))]} />
          </label>
          <label className="ci-inline"><span>Forecast Period:</span>
            <SearchSelect variant="field" label="Forecast period" value={years} onChange={(v) => { setYears(v); setPage(1) }} searchable={false} options={PERIODS.map((n) => ({ value: n, label: periodLabel(n) }))} />
          </label>
        </div>
      </div>

      <div className="ci-kpis ci-kpis-6">
        <Kpi icon={Layers} label="Historical Total Cost" sub={`(${HIST_YEARS[0]} – ${CURRENT_YEAR})`} value={usd(histTotal)} tone="violet" />
        <Kpi icon={Tag} label="Current Estimated Cost" sub={`(${CURRENT_YEAR} rates)`} value={usd(estimated)} hint={`Planned ${range} work priced at ${CURRENT_YEAR} contractor rates`} />
        <Kpi icon={Sparkles} label="AI Predicted Cost" sub={`(${CURRENT_YEAR + 1})`} value={usd(predictedNext)} tone="violet" hint={`${SCENARIO_LABEL[scenario]} scenario · simulated`} />
        <Kpi icon={CalendarRange} label={`${years}-Year Projected Cost`} sub={`(${range})`} value={usd(predicted)} tone="good"
          hint={budgetPeriod != null ? `Approved budget ${usd(budgetPeriod)} · ${predicted > budgetPeriod ? `${usd(predicted - budgetPeriod)} over` : `${usd(budgetPeriod - predicted)} within`}` : undefined} />
        <Kpi icon={TrendingUp} label="Cost Escalation" sub="(Annual Avg.)" value={`~${pct(escalation)}`} tone="critical" />
        <Kpi icon={Target} label="Forecast Accuracy" sub="(past predictions)" value={pct(accuracy, 0)} tone="good" hint={PAST_PREDICTIONS.map((p) => `${p.year}: predicted ${usd(p.predicted)}, actual ${usd(p.actual)}`).join(' · ')} />
      </div>

      <div className="ci-fc-row1">
        <Card title="Historical vs Current vs AI Forecast" sub={`${m.name} · cost per ${m.unit}`}
          actions={<div className="ci-mat-select"><SearchSelect variant="field" label="Material" value={materialId} onChange={setMaterialId} searchable={false} options={MATERIALS.map((x) => ({ value: x.id, label: x.name }))} /></div>}>
          <LineChart {...rateLine} format={(v) => `$${Math.round(v)}`} labelFormat={unit} yTitle={`Cost per ${m.unit} (USD)`} minY={Math.floor(rateIn(m, HIST_YEARS[0]) * 0.8)} height={260} />
        </Card>
        <Card title={`${shortName(m.name)} Replacement – Cost Trend (${REF_QTY} ${unitLabel(m.unit)})`}>
          <table className="ci-trend">
            <thead><tr><th>Year / Type</th><th className="n">Cost per {unitLabel(m.unit)}</th><th className="n">Total Cost</th></tr></thead>
            <tbody>
              {trendRows.map((r) => <tr key={r.label} className={r.kind}><td>{r.label}</td><td className="n">{unit(r.rate)}</td><td className="n">{usd(r.rate * REF_QTY)}</td></tr>)}
            </tbody>
          </table>
        </Card>
        <Card title={<span className="ci-title-icon"><Sparkles size={16} />AI Forecast Insights</span>}>
          <ul className="ci-ai-list">
            {insights.map((i) => (
              <li key={i.title}>
                <span className={`ci-ai-icon tone-${i.tone}`}><i.icon size={17} /></span>
                <span><strong>{i.title}</strong><small>{i.text}</small></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="ci-fc-row2">
        <Card title="Category-wise Forecast (Stacked)" sub={`${SCENARIO_LABEL[scenario]} scenario`}>
          <StackedColumns x={fYears.map(String)} xSub={yearTotals.map((t) => `(Total: ${usd(t, { compact: true })})`)} stacks={byCat} segmentLabels legendRight yTitle="Annual Cost (USD)" height={260} />
        </Card>
        <Card title="Cumulative Cost Projection" sub={range}>
          <LineChart x={fYears.map(String)} series={[{ key: 'cum', label: 'Cumulative predicted cost', color: '#8b6fd6', area: true, labels: true, values: cumulative }]}
            format={(v) => usd(v, { compact: true })} labelFormat={(v) => usd(v, { compact: true })} yTitle="Cumulative Cost (USD)" height={260} />
        </Card>
      </div>

      <div className="ci-fc-row3">
        <Card title={`Forecast Summary by Activity (${range})`}>
          <div className="u-table-wrap">
            <table className="u-table ci-table ci-summary">
              <thead><tr><th>Activity</th>{fYears.map((y) => <th key={y} className="n">{y}</th>)}<th className="n">{years}-Year Total</th><th className="n">% of Total</th></tr></thead>
              <tbody>
                {activityRows.map((r) => (
                  <tr key={r.id}><td><span className="ci-cat" style={{ '--c': r.color }}>{r.id}</span></td>{r.years.map((v, i) => <td key={fYears[i]} className="n">{usd(v)}</td>)}<td className="n"><strong>{usd(r.total)}</strong></td><td className="n">{predicted ? pct(r.total / predicted) : '—'}</td></tr>
                ))}
                {!activityRows.length && <tr><td colSpan={fYears.length + 3} className="u-empty">No planned work in this scope.</td></tr>}
              </tbody>
              {activityRows.length > 0 && <tfoot><tr><td>Total</td>{yearTotals.map((v, i) => <td key={fYears[i]} className="n">{usd(v)}</td>)}<td className="n">{usd(predicted)}</td><td className="n">100%</td></tr></tfoot>}
            </table>
          </div>
        </Card>
        <Card title={<span className="ci-title-icon"><FileText size={16} />Forecast Reports</span>}>
          <div className="ci-replinks">
            {REPORT_LINKS.map((r) => (
              <button key={r.title} type="button" className="ci-replink" onClick={() => navigate(`/cost/reports?preview=${r.id}`)}>
                <span className="ci-replink-icon"><r.icon size={17} /></span>
                <span className="ci-replink-text"><strong>{r.title}</strong><small>{r.desc}</small></span>
                <ChevronRight size={16} className="ci-replink-go" />
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Spend and budget (formerly the Cost Overview page) */}
      <header className="ci-section-head">
        <h2>Spend &amp; Budget</h2>
        <span>{sel.school ? schoolName(sel.school) : 'All schools'}{sel.building ? ` · ${buildingName(sel.building)}` : ''} · approved invoices and {CURRENT_YEAR} budget</span>
      </header>
      <div className="ci-grid-3">
        <Card title="Annual Expenditure Trend" sub="Approved invoices by category">
          <StackedColumns x={HIST_YEARS.map((y) => (y === CURRENT_YEAR ? `${y} YTD` : String(y)))}
            stacks={CATEGORIES.map((c) => ({ key: c.id, label: c.id, color: c.color, values: HIST_YEARS.map((y) => sum(hist.filter((x) => x.year === y && x.category === c.id), 'total')) }))} />
        </Card>
        <Card title="Cost by Category" sub={`Projected ${range}`}>
          <Donut items={CATEGORIES.map((c, i) => ({ key: c.id, label: c.id, color: c.color, value: sum(byCat[i].values, (v) => v) }))} center={usd(predicted, { compact: true })} sub={`${years}-year projected`} />
        </Card>
        <Card title={`${CURRENT_YEAR} Budget Status`} sub={budget == null ? 'Budgets are set per school' : `${sel.school ? schoolName(sel.school) : 'All schools'}`}>
          {budget == null ? <p className="ci-empty">Clear the building filter to compare against the school budget.</p> : (
            <div className="ci-budget">
              <div className="ci-budget-row"><span><Wallet size={15} />Approved Budget</span><strong>{usd(budget)}</strong></div>
              <div className="ci-budget-row"><span><Receipt size={15} />Spent YTD</span><strong>{usd(ytd)}</strong></div>
              <div className="ci-budget-row"><span><CalendarDays size={15} />Estimated Full Year</span><strong>{usd(yearEstimate)}</strong></div>
              <div className="ci-budget-row"><span><Scale size={15} />Variance</span><strong className={budget - yearEstimate >= 0 ? 'good' : 'bad'}>{usd(Math.abs(budget - yearEstimate))} {budget - yearEstimate >= 0 ? 'under' : 'over'}</strong></div>
              <div className="ci-budget-util">
                <span><Gauge size={15} />Budget Utilization <b>{pct(yearEstimate / budget)}</b></span>
                <span className="ci-budget-bar"><i className={yearEstimate > budget ? 'bad' : yearEstimate > budget * 0.9 ? 'warn' : undefined} style={{ width: `${Math.min(100, (yearEstimate / budget) * 100)}%` }} /></span>
                <small>{CURRENT_YEAR} estimate (YTD annualized) ÷ approved budget</small>
              </div>
            </div>
          )}
        </Card>
      </div>
      <div className="ci-grid-2">
        <Card title="School-Wise Cost Comparison" sub={`${years}-year projected · click to drill down`}>
          <HBars items={bySchool} color="#2a78d6" onSelect={(it) => { choose('school')(it.key); setLevel('school') }} />
        </Card>
        <Card title="Building-Wise Cost Distribution" sub={`Top buildings, ${years}-year projected · click to drill down`}>
          <HBars items={byBuilding} onSelect={(it) => { setSel({ school: BUILDINGS.find((b) => b.id === it.key).schoolId, building: it.key, floor: '', room: '', acm: '' }); setLevel('building') }} />
        </Card>
      </div>
      <Card title="Recent Cost Activities" sub="Latest invoices" actions={<button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => navigate('/cost/invoices')}><Receipt size={13} />Invoice Analysis</button>}>
        <div className="u-table-wrap">
          <table className="u-table ci-table">
            <thead><tr><th>Date</th><th>Invoice</th><th>Contractor</th><th>School / Building</th><th>Category</th><th className="n">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((x) => (
                <tr key={x.id} onClick={() => navigate(`/cost/invoices/${encodeURIComponent(x.id)}`)} className="click">
                  <td className="u-nowrap">{fmtDate(x.date)}</td>
                  <td className="a-mono">{x.number}</td>
                  <td>{x.contractor}</td>
                  <td>{schoolName(x.schoolId)}<small className="ci-sub">{buildingName(x.buildingId)}</small></td>
                  <td><span className="ci-cat" style={{ '--c': CATEGORIES.find((c) => c.id === x.category).color }}>{x.category}</span></td>
                  <td className="n">{usd(x.total, { cents: true })}</td>
                  <td><span className={`ci-status ${x.status.replace(' ', '-').toLowerCase()}`}>{x.status}</span></td>
                </tr>
              ))}
              {!recent.length && <tr><td colSpan={7} className="u-empty">No invoices in this scope.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Drill-down, scenarios and the detailed plan */}
      <header className="ci-section-head">
        <h2>Drill-down &amp; Scenarios</h2>
        <span>District → School → Building → Floor → Room → ACM</span>
      </header>
      <nav className="u-tabs ci-tabs" aria-label="View level">
        {LEVELS.map((l) => <button key={l.id} type="button" className={`u-tab${level === l.id ? ' active' : ''}`} onClick={() => setLevel(l.id)}>{l.label}</button>)}
      </nav>

      <section className="u-card ci-filters">
        <div className="ci-filter-grid">
          <Field label="School"><SearchSelect variant="field" label="School" value={sel.school} onChange={choose('school')} options={[{ value: '', label: 'All Schools' }, ...SCHOOLS.map((s) => ({ value: s.id, label: s.name }))]} /></Field>
          <Field label="Building"><SearchSelect variant="field" label="Building" value={sel.building} onChange={choose('building')} disabled={!sel.school} searchable={false} options={[{ value: '', label: sel.school ? 'All Buildings' : 'Select a school first' }, ...opts.buildings.map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="Floor"><SearchSelect variant="field" label="Floor" value={sel.floor} onChange={choose('floor')} disabled={!sel.building} searchable={false} options={[{ value: '', label: sel.building ? 'All Floors' : 'Select a building first' }, ...opts.floors.map((f) => ({ value: f, label: f }))]} /></Field>
          <Field label="Room"><SearchSelect variant="field" label="Room" value={sel.room} onChange={choose('room')} disabled={!sel.floor} searchable={false} options={[{ value: '', label: sel.floor ? 'All Rooms' : 'Select a floor first' }, ...opts.rooms.map((r) => ({ value: r, label: r }))]} /></Field>
          <Field label="ACM"><SearchSelect variant="field" label="ACM" value={sel.acm} onChange={choose('acm')} disabled={!sel.room} searchable={false} options={[{ value: '', label: sel.room ? 'All ACMs' : 'Select a room first' }, ...opts.acms.map((a) => ({ value: a.id, label: `${a.id} – ${a.material}` }))]} /></Field>
          <Field label="Scenario">
            <div className="ci-seg ci-seg-fill" role="group" aria-label="Scenario">
              {Object.keys(SCENARIOS).map((s) => <button key={s} type="button" className={scenario === s ? `on ${s}` : undefined} aria-pressed={scenario === s} onClick={() => setScenario(s)}>{SCENARIO_LABEL[s]}</button>)}
            </div>
          </Field>
        </div>
        <nav className="ci-trail" aria-label="Drill-down">
          {trail.map((c, i) => (
            <span key={c.label}>
              {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
              {i < trail.length - 1 ? <button type="button" onClick={() => choose(c.clear)('')}>{c.label}</button> : <strong>{c.label}</strong>}
            </span>
          ))}
        </nav>
      </section>

      <div className="ci-scenarios">
        {Object.entries(SCENARIOS).map(([s, f]) => (
          <button key={s} type="button" className={`ci-scn ${s}${scenario === s ? ' on' : ''}`} onClick={() => setScenario(s)}>
            <small>{SCENARIO_LABEL[s]} scenario</small>
            <strong>{usd(sum(items, 'predicted') * f)}</strong>
            <span>{s === 'low' ? '−10% vs expected: favourable bids, stable labour' : s === 'high' ? '+15% vs expected: scope growth, tight contractor market' : 'Material escalation as observed in invoices'}</span>
          </button>
        ))}
      </div>

      <div className="ci-grid-2">
        <Card title={`Forecast by ${{ district: 'School', school: 'Building', building: 'Floor & Room', acm: 'ACM' }[level]}`} sub={level === 'district' || level === 'school' ? 'Click a row to drill down' : undefined}>
          <div className="u-table-wrap">
            <table className="u-table ci-table">
              <thead><tr><th>{{ district: 'School', school: 'Building', building: 'Floor · Room', acm: 'ACM' }[level]}</th><th className="n">ACMs</th>{fYears.map((y) => <th key={y} className="n">{y}</th>)}<th className="n">Total</th><th className="n">% of Total</th></tr></thead>
              <tbody>
                {group.slice(0, 15).map((g) => (
                  <tr key={g.key} className={level === 'district' || (level === 'school' && g.key !== 'school-wide') ? 'click' : undefined} onClick={() => drillGroup(g)}>
                    <td>{g.name}</td>
                    <td className="n">{g.acms.size || '—'}</td>
                    {fYears.map((y) => <td key={y} className="n">{usd(g.years[y], { compact: true })}</td>)}
                    <td className="n"><strong>{usd(g.pred)}</strong></td>
                    <td className="n">{predicted ? pct(g.pred / predicted) : '—'}</td>
                  </tr>
                ))}
                {!group.length && <tr><td colSpan={fYears.length + 4} className="u-empty">No planned work in this scope.</td></tr>}
              </tbody>
              {group.length > 0 && (
                <tfoot><tr><td>Total</td><td className="n">{new Set(items.filter((f) => f.acmId).map((f) => f.acmId)).size}</td>{yearTotals.map((v, i) => <td key={fYears[i]} className="n">{usd(v, { compact: true })}</td>)}<td className="n">{usd(predicted)}</td><td className="n">100%</td></tr></tfoot>
              )}
            </table>
          </div>
          {group.length > 15 && <p className="ci-more">Top 15 of {group.length} shown – full list in the detailed table below.</p>}
        </Card>
        <div className="ci-stack">
          <Card title="Material-wise Breakdown" sub="Predicted cost by ACM material"><HBars items={byMaterial} /></Card>
          <Card title="Forecast Assumptions" className="ci-assume">
            <ul>
              <li><Info size={13} /><span>Quantities come from the ACM inventory; work is planned by condition – <b>Significantly Damaged</b> → abatement (within 2 years), <b>Damaged</b> → repair & encapsulation, <b>Good</b> → annual O&amp;M upkeep.</span></li>
              <li><Info size={13} /><span>Estimated cost uses current ({CURRENT_YEAR}) contractor rates; abatement includes clearance air sampling and waste disposal.</span></li>
              <li><Info size={13} /><span>Predicted cost escalates each material at its observed annual rate (6–10%), with a simulated model adjustment.</span></li>
              <li><Info size={13} /><span>Scenarios: Low ×{SCENARIOS.low}, Expected ×{SCENARIOS.expected}, High ×{SCENARIOS.high} of the expected prediction.</span></li>            </ul>
          </Card>
        </div>
      </div>

      <Card title="Detailed Forecast" sub={`${rows.length} planned items · ${SCENARIO_LABEL[scenario]} scenario`}
        actions={(
          <div className="ci-tools">
            <label className="u-search"><Search size={15} /><input type="search" placeholder="School, building, ACM, material…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} aria-label="Search forecast" /></label>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => downloadCsv('cost-forecast.csv', [...COLUMNS.map((c) => ({ label: c.label, csv: (r) => (c.key === 'predicted' ? Math.round(r.predictedS) : c.get(r)) })), { label: 'Category', key: 'category' }, { label: 'Work', key: 'work' }], rows)}>
              <FileSpreadsheet size={13} />Excel
            </button>
          </div>
        )}>
        <div className="u-table-wrap">
          <table className="u-table ci-table">
            <thead>
              <tr>{COLUMNS.map((c) => (
                <th key={c.key} className={c.num ? 'n' : undefined}>
                  <button type="button" className="ci-sort" onClick={() => toggleSort(c.key)} aria-label={`Sort by ${c.label}`}>{c.label}<ArrowUpDown size={11} className={sort.key === c.key ? 'on' : undefined} /></button>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.slice((cur - 1) * pageSize, cur * pageSize).map((r) => (
                <tr key={r.id}>
                  {COLUMNS.map((c) => <td key={c.key} className={c.num ? 'n' : undefined}>{c.key === 'acmId' ? <span className="a-mono">{c.get(r)}</span> : c.fmt ? c.fmt(c.get(r)) : c.get(r)}{c.key === 'material' && <small className="ci-sub">{r.category} · {r.work}</small>}</td>)}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={COLUMNS.length} className="u-empty">No planned items match.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="u-pager">
          <span className="u-muted">{rows.length ? `Showing ${(cur - 1) * pageSize + 1} to ${Math.min(rows.length, cur * pageSize)} of ${rows.length}` : 'No results'}</span>
          <nav className="u-pages" aria-label="Pagination">
            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            <span className="u-gap">Page {cur} of {pages}</span>
            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
        </footer>
      </Card>
    </div>
  )
}
