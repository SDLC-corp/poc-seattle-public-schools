import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Receipt, Upload, FileText, Clock3, Copy, TriangleAlert, CircleDollarSign, Search, X, Sparkles, CircleCheck, CircleAlert,
  PencilLine, ChevronLeft, ChevronRight,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { CostHeader, Kpi, Card } from './CostShared'
import { CURRENT_YEAR, CONTRACTORS, SCHOOLS, BUILDINGS, MATERIALS, TAX_RATE } from './costData'
import { usd, sum, fmtDate } from './costUtils'
import { session, statusOf, loadDocuments, generatedInvoices, analyse, confidenceTone, matchUpload } from './invoiceModel'
import '../LabSamples/labSamples.css' // the right-side panel (.lr-drawer)

const STATUSES = ['All', 'Pending Review', 'Reviewed', 'Approved', 'Rejected']
const statusCls = (s) => s.replace(' ', '-').toLowerCase()
const PAGE = 15

// A simulated "extracted" invoice for the upload (built from the sample tables, nothing is read from the file)
function simulatedInvoice(fileName, n) {
  const s = SCHOOLS[n % SCHOOLS.length]
  const b = BUILDINGS.find((x) => x.schoolId === s.id)
  const m = MATERIALS[n % MATERIALS.length]
  const qty = 240 + (n * 37) % 300
  const unitRate = m.rate
  const subtotal = Math.round(qty * unitRate * 100) / 100
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100
  return {
    id: `INV-${CURRENT_YEAR}-U${String(n).padStart(3, '0')}`, number: `UPL-${CURRENT_YEAR}${900 + n}`, date: `${CURRENT_YEAR}-10-${String(20 + (n % 8)).padStart(2, '0')}`,
    year: CURRENT_YEAR, contractor: CONTRACTORS[n % 2].name, schoolId: s.id, buildingId: b.id, category: 'Abatement',
    description: `Removal – ${m.name}`, qty, unit: m.unit, unitRate, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100,
    confidence: 76, status: 'Pending Review', duplicateOf: null, anomaly: null, fileName, uploaded: true,
  }
}

/** Invoice list: documents with a PDF first, then the invoice history. Opening one shows its PDF and extracted fields. */
export default function InvoiceAnalysis() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [show, setShow] = useState('') // '' | 'review' | 'flagged'
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => {
    let cancelled = false
    loadDocuments().then((d) => { if (!cancelled) setDocuments(d) })
      .catch((e) => { if (!cancelled) setToast({ kind: 'error', text: `Couldn't load the invoice documents (${e.message}).` }) })
    return () => { cancelled = true }
  }, [])

  const all = useMemo(() => [...documents, ...generatedInvoices()].map((x) => {
    const a = analyse(x)
    return { ...a.invoice, status: statusOf(x), overall: a.overall, review: a.needsReview.length }
  }), [documents])
  const year = all.filter((x) => x.year === CURRENT_YEAR)
  const flagged = (x) => x.duplicateOf || x.anomaly
  const term = q.trim().toLowerCase()
  const list = all
    .filter((x) => (status === 'All' || x.status === status) && (show !== 'review' || x.review) && (show !== 'flagged' || flagged(x)))
    .filter((x) => !term || [x.number, x.contractor, x.school, x.category, x.description].some((v) => String(v ?? '').toLowerCase().includes(term)))
    // Documents (with a PDF) first, newest first; then flagged, needing review, pending, latest
    .sort((a, b) => (b.document ? 1 : 0) - (a.document ? 1 : 0) || (a.document ? b.date.localeCompare(a.date) : 0)
      || (flagged(b) ? 1 : 0) - (flagged(a) ? 1 : 0) || (b.review ? 1 : 0) - (a.review ? 1 : 0)
      || (a.status === 'Pending Review' ? -1 : 0) - (b.status === 'Pending Review' ? -1 : 0) || b.date.localeCompare(a.date))
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(page, pages)
  const filter = (fn) => { fn(); setPage(1) }
  const open = (x) => navigate(`/cost/invoices/${encodeURIComponent(x.id)}`)

  return (
    <div className="ci-page">
      <CostHeader icon={Receipt} title="Invoice Analysis" subtitle="Contractor invoices with extracted details, confidence scores, duplicate checks and anomaly flags.">
        <button type="button" className="u-btn u-btn-primary" onClick={() => setUploading(true)}><Upload size={15} />Upload Invoice</button>
      </CostHeader>

      <div className="ci-kpis ci-kpis-6">
        <Kpi icon={FileText} label="Invoices" sub={`${CURRENT_YEAR} to date`} value={year.length} onClick={() => filter(() => { setStatus('All'); setShow('') })} />
        <Kpi icon={CircleDollarSign} label="Invoiced Amount" sub={`${CURRENT_YEAR}, all statuses`} value={usd(sum(year, 'total'))} />
        <Kpi icon={Clock3} label="Pending Review" value={all.filter((x) => x.status === 'Pending Review').length} tone="warning" onClick={() => filter(() => { setStatus('Pending Review'); setShow('') })} active={status === 'Pending Review'} />
        <Kpi icon={PencilLine} label="Manual Review Required" sub="low confidence or totals don't add up" value={all.filter((x) => x.review).length} tone="violet" onClick={() => filter(() => { setShow('review'); setStatus('All') })} active={show === 'review'} />
        <Kpi icon={Copy} label="Possible Duplicates" value={all.filter((x) => x.duplicateOf).length} tone="critical" onClick={() => filter(() => { setShow('flagged'); setStatus('All') })} active={show === 'flagged'} />
        <Kpi icon={TriangleAlert} label="Anomalies Detected" value={all.filter((x) => x.anomaly).length} tone="critical" onClick={() => filter(() => { setShow('flagged'); setStatus('All') })} active={show === 'flagged'} />
      </div>

      <Card title="Invoices" sub={`${list.length} shown · click an invoice to open its document and extracted details`}
        actions={(
          <div className="ci-tools">
            <label className="u-search"><Search size={15} /><input type="search" placeholder="Invoice no., contractor, school…" value={q} onChange={(e) => filter(() => setQ(e.target.value))} aria-label="Search invoices" /></label>
            <div className="ci-inv-status"><SearchSelect variant="field" label="Status" value={status} onChange={(v) => filter(() => setStatus(v))} searchable={false} options={STATUSES.map((s) => ({ value: s, label: s === 'All' ? 'All Statuses' : s }))} /></div>
            <div className="ci-inv-status"><SearchSelect variant="field" label="Show" value={show} onChange={(v) => filter(() => setShow(v))} searchable={false} options={[{ value: '', label: 'All Invoices' }, { value: 'review', label: 'Manual review required' }, { value: 'flagged', label: 'Duplicates & anomalies' }]} /></div>
          </div>
        )}>
        <div className="u-table-wrap">
          <table className="u-table ci-table ci-inv-table">
            <thead>
              <tr><th>Invoice No.</th><th>Contractor</th><th>School / Building</th><th>Invoice Date</th><th>Category</th><th className="n">Amount</th><th className="c">Confidence</th><th>Review</th><th>Status</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {list.slice((cur - 1) * PAGE, cur * PAGE).map((x) => (
                <tr key={x.id} className="click" tabIndex={0} onClick={() => open(x)} onKeyDown={(e) => { if (e.key === 'Enter') open(x) }}>
                  <td className="u-nowrap"><span className="a-mono ci-inv-no">{x.number}</span>{x.pdfUrl && <span className="ci-flag pdf"><FileText size={11} />PDF</span>}</td>
                  <td>{x.contractor}</td>
                  <td>{x.school}<small className="ci-sub">{x.building}</small></td>
                  <td className="u-nowrap">{fmtDate(x.date)}</td>
                  <td>{x.category}</td>
                  <td className="n"><strong>{usd(x.total, { cents: true })}</strong></td>
                  <td className="c"><span className={`ci-confpill ${confidenceTone(x.overall)}`}>{x.overall}%</span></td>
                  <td>
                    <span className="ci-inv-flags">
                      {x.review > 0 && <span className="ci-flag edit"><PencilLine size={11} />{x.review} field{x.review === 1 ? '' : 's'} to check</span>}
                      {x.duplicateOf && <span className="ci-flag dup"><Copy size={11} />Duplicate?</span>}
                      {x.anomaly && <span className="ci-flag"><TriangleAlert size={11} />Anomaly</span>}
                      {!x.review && !flagged(x) && <span className="ci-ok"><CircleCheck size={13} />Verified</span>}
                    </span>
                  </td>
                  <td><span className={`ci-status ${statusCls(x.status)}`}>{x.status}</span></td>
                  <td className="ci-go"><ChevronRight size={16} /></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={10} className="u-empty">No invoices match.</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="u-pager">
          <span className="u-muted">{list.length ? `Showing ${(cur - 1) * PAGE + 1} to ${Math.min(list.length, cur * PAGE)} of ${list.length}` : 'No results'}</span>
          <nav className="u-pages" aria-label="Pagination">
            <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            <span className="u-gap">Page {cur} of {pages}</span>
            <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
        </footer>
      </Card>

      {uploading && <UploadDrawer onClose={() => setUploading(false)} n={session.uploaded.length + 1}
        onDone={(inv) => {
          session.uploaded.unshift(inv)
          setUploading(false)
          // The invoice page shows the "Analyzing Invoice" step first
          navigate(`/cost/invoices/${encodeURIComponent(inv.id)}`, { state: { analyzing: true } })
        }} />}
      {toast && <div className={`u-toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}{toast.text}</div>}
    </div>
  )
}

// Upload: pick a file and add it as a pending invoice in this session only; the file itself is shown on the invoice
// page (kept in the browser, not sent anywhere) and the extracted values are simulated
function UploadDrawer({ onClose, onDone, n }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const input = useRef(null)
  const run = async () => {
    setBusy(true)
    const url = URL.createObjectURL(file)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const shown = { fileName: file.name, uploaded: true, pdfUrl: isPdf ? url : null, imageUrl: !isPdf && file.type.startsWith('image/') ? url : null }
    // A file named after an invoice record (e.g. SPS-CH-2026-1005.pdf) takes that record's details; it's new, so it awaits review
    const record = await matchUpload(file.name)
    onDone(record
      ? { ...record, ...shown, id: `UPL-${n}-${record.number}`, status: 'Pending Review', matched: record.number }
      : { ...simulatedInvoice(file.name, n), ...shown })
  }
  return (
    <div className="lr-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="lr-drawer ci-upload" role="dialog" aria-modal="true" aria-labelledby="ci-up-title">
        <header className="u-modal-head lr-drawer-head">
          <h2 id="ci-up-title"><Upload size={18} />Upload Invoice</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body lr-drawer-body">
          <button type="button" className="ci-drop" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files?.[0] ?? null) }}>
            <Upload size={22} />
            <strong>{file ? file.name : 'Choose or drop an invoice'}</strong>
            <small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : 'PDF or image'}</small>
          </button>
          <input ref={input} type="file" hidden accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <footer className="u-modal-foot lr-drawer-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={!file || busy} onClick={run}><Sparkles size={14} />Upload &amp; Analyze</button>
        </footer>
      </aside>
    </div>
  )
}
