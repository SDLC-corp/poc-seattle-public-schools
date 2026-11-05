import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  FileBarChart, Landmark, CalendarRange, Target, School, Building2, Percent, Wrench, History, Users, Scale, Wallet, Receipt,
  Eye, FileText, FileSpreadsheet, X, CircleCheck, CircleAlert, Search,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { CostHeader, Card, Field } from './CostShared'
import {
  CURRENT_YEAR, HIST_YEARS, CATEGORIES, SCHOOLS, BUILDINGS, CONTRACTORS, INVOICES, BUDGETS, FORECAST_ITEMS, PAST_PREDICTIONS, SCENARIOS,
} from './costData'
import { usd, pct, sum, actuals, forecastYears, schoolName, buildingName, fmtDate, downloadCsv, printReport } from './costUtils'
import '../LabSamples/labSamples.css' // the right-side panel (.lr-drawer)

const money = (key, label) => ({ key, label, num: true, fmt: (r) => usd(r[key]), csv: (r) => Math.round(r[key]) })
const text = (key, label) => ({ key, label })

// Each report: columns + rows from the demo data for the chosen filters ({ school, years, category })
const REPORTS = [
  {
    id: 'district', icon: Landmark, title: 'District Cost Summary', desc: 'Actual, estimated and predicted cost by school',
    build: ({ years, category }) => {
      const it = FORECAST_ITEMS.filter((f) => f.year > CURRENT_YEAR && f.year <= CURRENT_YEAR + years && (!category || f.category === category))
      const act = actuals().filter((x) => !category || x.category === category)
      return { columns: [text('school', 'School'), money('historical', 'Historical Actual'), money('ytd', `${CURRENT_YEAR} YTD`), money('estimated', `Estimate ${years}y`), money('predicted', `Predicted ${years}y`)],
        rows: SCHOOLS.map((s) => ({ school: s.name, historical: sum(act.filter((x) => x.schoolId === s.id), 'total'), ytd: sum(act.filter((x) => x.schoolId === s.id && x.year === CURRENT_YEAR), 'total'), estimated: sum(it.filter((f) => f.schoolId === s.id), 'estimated'), predicted: sum(it.filter((f) => f.schoolId === s.id), 'predicted') })) }
    },
  },
  {
    id: 'annual', icon: CalendarRange, title: 'Annual Cost Forecast', desc: 'Year-wise future expenses by category',
    build: ({ school, years, category }) => ({
      columns: [text('year', 'Year'), ...CATEGORIES.filter((c) => !category || c.id === category).map((c) => money(c.id, c.id)), money('total', 'Total')],
      rows: forecastYears(years).map((y) => {
        const it = FORECAST_ITEMS.filter((f) => f.year === y && (!school || f.schoolId === school) && (!category || f.category === category))
        return { year: y, ...Object.fromEntries(CATEGORIES.map((c) => [c.id, sum(it.filter((f) => f.category === c.id), 'predicted')])), total: sum(it, 'predicted') }
      }),
    }),
  },
  {
    id: 'budget3', icon: Target, title: 'Three-Year Budget Projection', desc: 'Budget against low / expected / high predictions',
    build: ({ school, category }) => ({
      columns: [text('year', 'Year'), money('budget', 'Approved Budget'), money('low', 'Low'), money('expected', 'Expected'), money('high', 'High'), money('gap', 'Expected − Budget')],
      rows: forecastYears(3).map((y) => {
        const p = sum(FORECAST_ITEMS.filter((f) => f.year === y && (!school || f.schoolId === school) && (!category || f.category === category)), 'predicted')
        const budget = sum(school ? [school] : SCHOOLS.map((s) => s.id), (id) => BUDGETS[id][y])
        return { year: y, budget, low: p * SCENARIOS.low, expected: p, high: p * SCENARIOS.high, gap: p - budget }
      }),
    }),
  },
  {
    id: 'school', icon: School, title: 'School-Wise Cost Forecast', desc: 'Predicted cost per school, per year',
    build: ({ years, category }) => ({
      columns: [text('school', 'School'), ...forecastYears(years).map((y) => money(String(y), String(y))), money('total', 'Total')],
      rows: SCHOOLS.map((s) => {
        const it = FORECAST_ITEMS.filter((f) => f.schoolId === s.id && f.year > CURRENT_YEAR && f.year <= CURRENT_YEAR + years && (!category || f.category === category))
        return { school: s.name, ...Object.fromEntries(forecastYears(years).map((y) => [String(y), sum(it.filter((f) => f.year === y), 'predicted')])), total: sum(it, 'predicted') }
      }).sort((a, b) => b.total - a.total),
    }),
  },
  {
    id: 'building', icon: Building2, title: 'Building-Wise Cost Forecast', desc: 'Building-level cost projection',
    build: ({ school, years, category }) => ({
      columns: [text('school', 'School'), text('building', 'Building'), { key: 'acms', label: 'ACMs', num: true }, money('estimated', 'Estimated'), money('predicted', 'Predicted')],
      rows: BUILDINGS.filter((b) => !school || b.schoolId === school).map((b) => {
        const it = FORECAST_ITEMS.filter((f) => f.buildingId === b.id && f.year > CURRENT_YEAR && f.year <= CURRENT_YEAR + years && (!category || f.category === category))
        return { school: schoolName(b.schoolId), building: b.name, acms: new Set(it.map((f) => f.acmId)).size, estimated: sum(it, 'estimated'), predicted: sum(it, 'predicted') }
      }).sort((a, b) => b.predicted - a.predicted),
    }),
  },
  {
    id: 'acm', icon: Percent, title: 'ACM-Wise Cost Prediction', desc: 'Predicted cost of each ACM',
    build: ({ school, years, category }) => {
      const m = new Map()
      for (const f of FORECAST_ITEMS.filter((x) => x.acmId && x.year > CURRENT_YEAR && x.year <= CURRENT_YEAR + years && (!school || x.schoolId === school) && (!category || x.category === category))) {
        if (!m.has(f.acmId)) m.set(f.acmId, { acm: f.acmId, school: schoolName(f.schoolId), building: buildingName(f.buildingId), material: f.material, qty: `${f.qty} ${f.unit}`, estimated: 0, predicted: 0 })
        m.get(f.acmId).estimated += f.estimated
        m.get(f.acmId).predicted += f.predicted
      }
      return { columns: [text('acm', 'ACM ID'), text('school', 'School'), text('building', 'Building'), text('material', 'Material'), text('qty', 'Quantity'), money('estimated', 'Estimated'), money('predicted', 'Predicted')], rows: [...m.values()].sort((a, b) => b.predicted - a.predicted) }
    },
  },
  {
    id: 'activity', icon: Wrench, title: 'Activity-Wise Cost Report', desc: 'Inspection, maintenance, abatement, monitoring, disposal',
    build: ({ school, years }) => {
      const it = FORECAST_ITEMS.filter((f) => f.year > CURRENT_YEAR && f.year <= CURRENT_YEAR + years && (!school || f.schoolId === school))
      const act = actuals({ school })
      const tot = sum(it, 'predicted')
      return { columns: [text('activity', 'Activity'), money('historical', 'Historical Actual'), money('predicted', `Predicted ${years}y`), { key: 'share', label: '% of Forecast', num: true, fmt: (r) => pct(r.share), csv: (r) => (r.share * 100).toFixed(1) }],
        rows: CATEGORIES.map((c) => { const p = sum(it.filter((f) => f.category === c.id), 'predicted'); return { activity: c.id, historical: sum(act.filter((x) => x.category === c.id), 'total'), predicted: p, share: tot ? p / tot : 0 } }) }
    },
  },
  {
    id: 'historical', icon: History, title: 'Historical Expenditure Report', desc: 'Approved spend by year and category',
    build: ({ school, category }) => ({
      columns: [text('year', 'Year'), ...CATEGORIES.filter((c) => !category || c.id === category).map((c) => money(c.id, c.id)), money('total', 'Total'), { key: 'invoices', label: 'Invoices', num: true }],
      rows: HIST_YEARS.map((y) => {
        const a = actuals({ school }).filter((x) => x.year === y && (!category || x.category === category))
        return { year: y === CURRENT_YEAR ? `${y} (YTD)` : y, ...Object.fromEntries(CATEGORIES.map((c) => [c.id, sum(a.filter((x) => x.category === c.id), 'total')])), total: sum(a, 'total'), invoices: a.length }
      }),
    }),
  },
  {
    id: 'contractor', icon: Users, title: 'Contractor-Wise Cost Report', desc: 'Spend and invoices per contractor',
    build: ({ school, category }) => ({
      columns: [text('contractor', 'Contractor'), text('specialty', 'Specialty'), { key: 'invoices', label: 'Invoices', num: true }, money('total', 'Total Paid'), money('avg', 'Average Invoice')],
      rows: CONTRACTORS.map((c) => {
        const a = actuals({ school }).filter((x) => x.contractorId === c.id && (!category || x.category === category))
        return { contractor: c.name, specialty: c.specialty, invoices: a.length, total: sum(a, 'total'), avg: a.length ? sum(a, 'total') / a.length : 0 }
      }).filter((r) => r.invoices).sort((a, b) => b.total - a.total),
    }),
  },
  {
    id: 'actualPredicted', icon: Scale, title: 'Actual vs Predicted Cost Report', desc: 'How past predictions compared with spend',
    build: () => ({
      columns: [text('year', 'Year'), money('predicted', 'Predicted'), money('actual', 'Actual'), money('diff', 'Difference'), { key: 'accuracy', label: 'Accuracy', num: true, fmt: (r) => pct(r.accuracy), csv: (r) => (r.accuracy * 100).toFixed(1) }],
      rows: PAST_PREDICTIONS.map((p) => ({ ...p, diff: p.actual - p.predicted, accuracy: 1 - Math.abs(p.actual - p.predicted) / p.actual })),
    }),
  },
  {
    id: 'variance', icon: Wallet, title: 'Budget Variance Report', desc: `${CURRENT_YEAR} budget against estimated spend`,
    build: ({ school }) => ({
      columns: [text('school', 'School'), money('budget', `${CURRENT_YEAR} Budget`), money('ytd', 'Spent YTD'), money('estimate', 'Estimated Full Year'), money('variance', 'Variance'), { key: 'util', label: 'Utilization', num: true, fmt: (r) => pct(r.util), csv: (r) => (r.util * 100).toFixed(1) }],
      rows: SCHOOLS.filter((s) => !school || s.id === school).map((s) => {
        const ytd = sum(actuals({ school: s.id }).filter((x) => x.year === CURRENT_YEAR), 'total')
        const estimate = (ytd * 12) / 10
        const budget = BUDGETS[s.id][CURRENT_YEAR]
        return { school: s.name, budget, ytd, estimate, variance: budget - estimate, util: budget ? estimate / budget : 0 }
      }),
    }),
  },
  {
    id: 'invoices', icon: Receipt, title: 'Invoice Analysis Report', desc: 'Current-year invoices with review status and flags',
    build: ({ school, category }) => ({
      columns: [{ key: 'date', label: 'Date', fmt: (r) => fmtDate(r.date) }, text('number', 'Invoice'), text('contractor', 'Contractor'), { key: 'school', label: 'School', fmt: (r) => schoolName(r.schoolId), csv: (r) => schoolName(r.schoolId) }, text('category', 'Category'), money('total', 'Total'), text('status', 'Status'), { key: 'flags', label: 'Flags', fmt: (r) => [r.duplicateOf && 'Possible duplicate', r.anomaly].filter(Boolean).join('; ') || '—', csv: (r) => [r.duplicateOf && 'Possible duplicate', r.anomaly].filter(Boolean).join('; ') }],
      rows: INVOICES.filter((x) => x.year === CURRENT_YEAR && (!school || x.schoolId === school) && (!category || x.category === category)).sort((a, b) => b.date.localeCompare(a.date)),
    }),
  },
]

const filterText = (f) => [f.school ? schoolName(f.school) : 'All schools', `${f.years}-year period`, f.category || 'All categories'].join(' · ')

/** Report centre: 12 reports from the demo data with preview, PDF (print) and Excel (CSV) export. */
export default function CostReports() {
  const [f, setF] = useState({ school: '', years: 3, category: '' })
  const [q, setQ] = useState('')
  const [params, setParams] = useSearchParams()
  // ?preview=<report id> (from the Forecast Reports shortcuts) opens that report's preview
  const [preview, setPreviewState] = useState(() => REPORTS.find((r) => r.id === params.get('preview')) ?? null)
  const setPreview = (r) => {
    setPreviewState(r)
    if (!r && params.has('preview')) { const p = new URLSearchParams(params); p.delete('preview'); setParams(p, { replace: true }) }
  }
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const exportCsv = (r) => {
    const { columns, rows } = r.build(f)
    downloadCsv(`${r.id}-report.csv`, columns.map((c) => ({ label: c.label, csv: c.csv ?? ((row) => row[c.key]) })), rows)
    setToast({ kind: 'success', text: `${r.title} downloaded (CSV, opens in Excel).` })
  }
  const exportPdf = (r) => {
    const { columns, rows } = r.build(f)
    if (!printReport(r.title, filterText(f), columns.map((c) => ({ ...c, fmt: c.fmt })), rows)) setToast({ kind: 'error', text: 'Allow pop-ups to open the printable report.' })
  }
  const shown = REPORTS.filter((r) => !q.trim() || `${r.title} ${r.desc}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="ci-page">
      <CostHeader icon={FileBarChart} title="Cost Reports" subtitle="Preview and export cost reports." />
      <section className="u-card ci-filters">
        <div className="ci-filter-grid ci-filter-4">
          <Field label="School"><SearchSelect variant="field" label="School" value={f.school} onChange={(v) => setF((s) => ({ ...s, school: v }))} options={[{ value: '', label: 'All Schools' }, ...SCHOOLS.map((s) => ({ value: s.id, label: s.name }))]} /></Field>
          <Field label="Forecast Period"><SearchSelect variant="field" label="Forecast period" value={f.years} onChange={(v) => setF((s) => ({ ...s, years: v }))} searchable={false} options={[1, 3, 5].map((n) => ({ value: n, label: `${n} Year${n > 1 ? 's' : ''} (${CURRENT_YEAR + 1}–${CURRENT_YEAR + n})` }))} /></Field>
          <Field label="Category"><SearchSelect variant="field" label="Category" value={f.category} onChange={(v) => setF((s) => ({ ...s, category: v }))} searchable={false} options={[{ value: '', label: 'All Categories' }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.id }))]} /></Field>
          <Field label="Find a report"><label className="u-search"><Search size={15} /><input type="search" placeholder="Report name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" /></label></Field>
        </div>
      </section>

      <div className="ci-reports">
        {shown.map((r) => (
          <Card key={r.id} className="ci-report">
            <div className="ci-report-top">
              <span className="ci-report-icon"><r.icon size={18} /></span>
              <div><h3>{r.title}</h3><p>{r.desc}</p></div>
            </div>
            <div className="ci-report-acts">
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setPreview(r)}><Eye size={13} />Preview</button>
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => exportPdf(r)}><FileText size={13} />PDF</button>
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => exportCsv(r)}><FileSpreadsheet size={13} />Excel</button>
            </div>
          </Card>
        ))}
        {!shown.length && <p className="ci-empty">No reports match.</p>}
      </div>

      {preview && <ReportPreview report={preview} filters={f} onClose={() => setPreview(null)} onPdf={() => exportPdf(preview)} onCsv={() => exportCsv(preview)} />}
      {toast && <div className={`u-toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}{toast.text}</div>}
    </div>
  )
}

function ReportPreview({ report: r, filters, onClose, onPdf, onCsv }) {
  const { columns, rows } = r.build(filters)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // Totals for money columns
  const totals = columns.map((c) => (c.num && c.fmt && rows.length > 1 && !/accuracy|util|share/i.test(c.key) ? sum(rows, c.key) : null))
  return (
    <div className="lr-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="lr-drawer ci-preview" role="dialog" aria-modal="true" aria-labelledby="ci-prev-title">
        <header className="u-modal-head lr-drawer-head">
          <h2 id="ci-prev-title"><r.icon size={18} />{r.title}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body lr-drawer-body">
          <p className="ci-prev-sub">{filterText(filters)}</p>
          <div className="u-table-wrap">
            <table className="u-table ci-table">
              <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? 'n' : undefined}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((row, i) => <tr key={i}>{columns.map((c) => <td key={c.key} className={c.num ? 'n' : undefined}>{c.fmt ? c.fmt(row) : row[c.key]}</td>)}</tr>)}
                {!rows.length && <tr><td colSpan={columns.length} className="u-empty">No data for these filters.</td></tr>}
              </tbody>
              {totals.some((t) => t != null) && (
                <tfoot><tr>{columns.map((c, i) => <td key={c.key} className={c.num ? 'n' : undefined}>{i === 0 ? 'Total' : totals[i] != null ? usd(totals[i]) : ''}</td>)}</tr></tfoot>
              )}
            </table>
          </div>
        </div>
        <footer className="u-modal-foot lr-drawer-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onCsv}><FileSpreadsheet size={14} />Excel</button>
          <button type="button" className="u-btn u-btn-primary" onClick={onPdf}><FileText size={14} />PDF</button>
        </footer>
      </aside>
    </div>
  )
}
