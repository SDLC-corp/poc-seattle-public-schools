import { request, API_BASE } from '../../lib/api'
import { INVOICES } from './costData'
import { usd, schoolName, buildingName, fmtDate } from './costUtils'

/**
 * Invoices for Invoice Analysis: the contractor invoice documents (backend data/invoices, each with a PDF) and the
 * generated invoice history. Each invoice gets its extracted fields with a confidence score and arithmetic checks;
 * fields below REVIEW_BELOW, and figures that don't add up, need a person to confirm or correct them.
 */
export const REVIEW_BELOW = 80
const CATEGORY = { inspection: 'Inspection', abatement: 'Abatement', 'O&M': 'Maintenance', air_monitoring: 'Air Monitoring', disposal: 'Disposal', documentation: 'Documentation' }
const num = (v) => Number(v) || 0
const round2 = (v) => Math.round(v * 100) / 100
export const money = (v) => usd(v, { cents: true })

// --- Session state shared by the list and the invoice page (kept until the page is reloaded; nothing is saved) ---
export const session = { uploaded: [], status: {}, edits: {}, confirmed: {} }
export const statusOf = (x) => session.status[x.id] ?? x.status

// An invoice document from backend/data/invoices/invoices.json
export function fromDocument(inv) {
  const line = inv.line_items?.[0] ?? {}
  const f = inv.financials ?? {}
  const loc = inv.service_location ?? {}
  return {
    id: inv.invoice_number, number: inv.invoice_number, date: inv.invoice_date, dueDate: inv.due_date, year: Number(inv.invoice_date.slice(0, 4)),
    contractor: inv.contractor?.name ?? '', contractorRef: inv.contractor?.license_reference ?? '',
    school: loc.school ?? '', building: loc.building ?? '', area: [loc.floor, loc.room_or_area].filter(Boolean).join(' · '),
    workOrder: inv.work_order ?? '', category: CATEGORY[line.category] ?? line.category ?? '', description: inv.work_description ?? line.description ?? '',
    lines: (inv.line_items ?? []).map((l) => ({ description: l.description, qty: num(l.quantity), unit: String(l.unit ?? '').replace(/_/g, ' '), rate: num(l.unit_rate), total: num(l.line_total) })),
    subtotal: num(f.subtotal), taxRate: num(f.tax_rate_percent), tax: num(f.tax_amount), discount: num(f.discount), total: num(f.grand_total),
    paid: num(f.amount_paid), balance: num(f.balance_due), paymentTerms: inv.payment_terms ?? '',
    status: num(f.balance_due) > 0 ? 'Pending Review' : 'Approved', duplicateOf: null, anomaly: null,
    pdfUrl: inv.hasPdf ? `${API_BASE}/cost-invoices/${encodeURIComponent(inv.invoice_number)}/pdf` : null, document: true,
  }
}

// A generated (or uploaded) invoice in the same shape
function fromGenerated(x) {
  return {
    ...x, contractorRef: '', school: schoolName(x.schoolId), building: buildingName(x.buildingId), area: '', workOrder: '', dueDate: null,
    lines: [{ description: x.description, qty: x.qty, unit: x.unit, rate: x.unitRate, total: x.subtotal }],
    taxRate: x.subtotal ? round2((x.tax / x.subtotal) * 100) : 0, discount: 0, paid: x.status === 'Approved' ? x.total : 0,
    balance: x.status === 'Approved' ? 0 : x.total, paymentTerms: 'Net 30', pdfUrl: x.pdfUrl ?? null, imageUrl: x.imageUrl ?? null, document: false,
  }
}

let documents = null
export function loadDocuments() {
  documents ??= request('/cost-invoices').then((d) => d.invoices.map(fromDocument)).catch((e) => { documents = null; throw e })
  return documents
}
// Uploads matched to an invoice record are already in the document shape
export const generatedInvoices = () => [...session.uploaded.map((x) => (x.document ? x : fromGenerated(x))), ...INVOICES.map(fromGenerated)]

// The invoice record an uploaded file is for (its invoice number in the file name), or null
export async function matchUpload(fileName) {
  try {
    const d = await request(`/cost-invoices/match?file=${encodeURIComponent(fileName)}`)
    return fromDocument(d.invoice)
  } catch {
    return null
  }
}

// --- Extraction confidence: stable per invoice and field ---
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const FIELDS = [
  ['contractor', 'Contractor'], ['contractorRef', 'Contractor Reference'], ['number', 'Invoice Number'], ['date', 'Invoice Date', 'date'],
  ['dueDate', 'Due Date', 'date'], ['school', 'School'], ['building', 'Building'], ['area', 'Floor / Area'], ['workOrder', 'Work Order'],
  ['category', 'Service Category'], ['description', 'Description'], ['subtotal', 'Subtotal', 'money'], ['tax', 'Tax', 'money'],
  ['total', 'Grand Total', 'money'], ['paymentTerms', 'Payment Terms'],
]
// Fields a scanner most often misreads
const HARD = ['contractorRef', 'workOrder', 'area', 'dueDate', 'building', 'description', 'tax']

export function display(type, v) {
  if (v === '' || v == null) return '—'
  if (type === 'date') return fmtDate(v)
  if (type === 'money') return money(v)
  return String(v)
}

// Arithmetic checks on the invoice as it stands now (with any corrections applied)
export function checks(x) {
  const lineSum = round2(x.lines.reduce((n, l) => n + l.total, 0))
  const out = [
    ...x.lines.map((l, i) => ({ key: `line${i}`, label: `Line ${i + 1}: quantity × rate = amount`, ok: Math.abs(round2(l.qty * l.rate) - l.total) < 0.02, fields: [] })),
    { key: 'subtotal', label: 'Line items add up to the subtotal', ok: Math.abs(lineSum - x.subtotal) < 0.02, fields: ['subtotal'] },
    { key: 'tax', label: `Tax is ${x.taxRate}% of the subtotal`, ok: Math.abs(round2((x.subtotal * x.taxRate) / 100) - x.tax) < 0.05, fields: ['tax'] },
    { key: 'total', label: 'Subtotal + tax − discount = grand total', ok: Math.abs(round2(x.subtotal + x.tax - x.discount) - x.total) < 0.02, fields: ['total'] },
  ]
  if (x.dueDate) out.push({ key: 'due', label: 'Due date is after the invoice date', ok: x.dueDate >= x.date, fields: ['dueDate'] })
  if (x.duplicateOf) out.push({ key: 'dup', label: 'No other invoice with the same contractor, amount and date', ok: false, fields: [] })
  if (x.anomaly) out.push({ key: 'anomaly', label: x.anomaly, ok: false, fields: [] })
  return out
}

/**
 * The invoice with corrections applied and its extracted fields: { key, label, value, text, confidence, edited,
 * confirmed, review } — review is true while a low-confidence or failing field hasn't been corrected or confirmed.
 */
export function analyse(base) {
  const edits = session.edits[base.id] ?? {}
  const confirmed = session.confirmed[base.id] ?? {}
  const x = { ...base, ...edits }
  const h = hash(base.id)
  const lowCount = (base.confidence ?? 95) < REVIEW_BELOW ? 2 : [1, 2, 0, 1][(h >>> 8) % 4]
  // An approved invoice has already been through review: its low-confidence fields count as confirmed
  const reviewed = (session.status[base.id] ?? base.status) === 'Approved'
  // Generated invoices don't carry these document-only fields
  const shown = FIELDS.filter(([key]) => base.document || !['contractorRef', 'workOrder', 'area', 'dueDate'].includes(key))
  const hard = HARD.filter((k) => shown.some(([key]) => key === k))
  const low = new Set(Array.from({ length: lowCount }, (_, i) => hard[(h >> (i * 4)) % hard.length]))
  const failing = new Set(checks(x).filter((c) => !c.ok).flatMap((c) => c.fields))
  const fields = shown.map(([key, label, type]) => {
    const fh = hash(`${base.id}:${key}`)
    const extracted = low.has(key) ? 58 + (fh % 20) : 90 + (fh % 10)
    const edited = key in edits
    const confidence = edited ? 100 : extracted
    const flagged = extracted < REVIEW_BELOW || failing.has(key)
    const isConfirmed = Boolean(confirmed[key]) || (reviewed && flagged)
    const review = !edited && !isConfirmed && flagged
    return { key, label: key === 'tax' ? `Tax (${x.taxRate}%)` : label, type, value: x[key], text: display(type, x[key]), confidence, extracted, edited, confirmed: isConfirmed, review, failing: failing.has(key) }
  })
  const overall = Math.round(fields.reduce((n, f) => n + f.extracted, 0) / fields.length)
  return { invoice: x, fields, overall, needsReview: fields.filter((f) => f.review), checks: checks(x) }
}

export const confidenceTone = (c) => (c >= 90 ? 'high' : c >= REVIEW_BELOW ? 'mid' : 'low')
