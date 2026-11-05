// Cost Intelligence helpers: money formatting, sums and grouping over the demo data, and client-side exports.
import {
  CURRENT_YEAR, INVOICES, FORECAST_ITEMS, BUDGETS, SCHOOLS, SCHOOL, BUILDING, actualInvoices,
} from './costData'

export const usd = (n, { compact = false, cents = false } = {}) => {
  if (n == null || Number.isNaN(n)) return '—'
  if (compact && Math.abs(n) >= 1000) {
    return `$${Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K`}`
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}
export const pct = (n, digits = 1) => `${(n * 100).toFixed(digits)}%`
export const sum = (list, key) => list.reduce((n, x) => n + (typeof key === 'function' ? key(x) : x[key]), 0)
export const groupSum = (list, keyOf, valueKey) => {
  const m = new Map()
  for (const x of list) m.set(keyOf(x), (m.get(keyOf(x)) ?? 0) + (typeof valueKey === 'function' ? valueKey(x) : x[valueKey]))
  return m
}
export const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
export const schoolName = (id) => SCHOOL[id]?.name ?? '—'
export const buildingName = (id) => (id ? BUILDING[id]?.name ?? '—' : 'School-wide')

// Forecast items for a period (1, 3 or 5 years from next year) and an optional school / building / ACM
export function forecastItems({ years = 3, school = '', building = '', acm = '' } = {}) {
  const last = CURRENT_YEAR + years
  return FORECAST_ITEMS.filter((f) => f.year > CURRENT_YEAR && f.year <= last
    && (!school || f.schoolId === school) && (!building || f.buildingId === building) && (!acm || f.acmId === acm))
}
export const forecastYears = (years) => Array.from({ length: years }, (_, i) => CURRENT_YEAR + 1 + i)

// Historical spend (approved invoices), optionally for one school / building
export const actuals = ({ school = '', building = '' } = {}) => actualInvoices().filter((x) => (!school || x.schoolId === school) && (!building || x.buildingId === building))

// Average annual change of a yearly series (compound)
export function cagr(first, last, years) {
  if (!first || !last || years <= 0) return 0
  return (last / first) ** (1 / years) - 1
}

// District / school KPIs used by the Overview and Forecasting screens
export function costKpis({ school = '', building = '', years = 3 } = {}) {
  const hist = actuals({ school, building })
  const histTotal = sum(hist, 'total')
  const ytd = sum(hist.filter((x) => x.year === CURRENT_YEAR), 'total')
  const estimatedCurrentYear = (ytd * 12) / 10 // year to date (10 months) annualized
  const items = forecastItems({ years, school, building })
  const next = items.filter((f) => f.year === CURRENT_YEAR + 1)
  const budget = sum((school ? [school] : SCHOOLS.map((s) => s.id)), (id) => BUDGETS[id][CURRENT_YEAR])
  const byYear = [2023, 2024, 2025].map((y) => sum(hist.filter((x) => x.year === y), 'total'))
  return {
    histTotal, ytd, estimatedCurrentYear,
    baseline: sum(next, 'estimated'), // next year's planned work at today's rates
    predictedNext: sum(next, 'predicted'),
    projected: sum(items, 'predicted'),
    estimatedPeriod: sum(items, 'estimated'),
    budget, utilization: budget ? estimatedCurrentYear / budget : 0, variance: budget - estimatedCurrentYear,
    escalation: cagr(byYear[0], byYear[2], 2),
  }
}

// --- Exports (generated in the browser from the demo data) ---
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function downloadCsv(filename, columns, rows) {
  const lines = [columns.map((c) => cell(c.label)), ...rows.map((r) => columns.map((c) => cell(c.csv ? c.csv(r) : r[c.key])))]
  const blob = new Blob([`﻿${lines.map((l) => l.join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// A printable report in a new window ("Save as PDF" from the print dialog)
export function printReport(title, subtitle, columns, rows) {
  const w = window.open('', '_blank')
  if (!w) return false
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:12px/1.45 system-ui,sans-serif;color:#1d2733;margin:24px}h1{font-size:20px;margin:0}p{margin:4px 0 14px;color:#5b6b7b}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e3e8ee;padding:5px 6px;text-align:left}th{background:#f3f6f9}
    td.n,th.n{text-align:right}</style></head><body>
    <h1>${esc(title)}</h1><p>${esc(subtitle)} · generated ${esc(new Date().toLocaleString())}</p>
    <table><thead><tr>${columns.map((c) => `<th class="${c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.num ? 'n' : ''}">${esc(c.fmt ? c.fmt(r) : r[c.key])}</td>`).join('')}</tr>`).join('')}
    </tbody></table>
    <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
  return true
}

export { INVOICES }
