import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft, FileText, ExternalLink, Download, Eye, XCircle, CheckCircle2, PencilLine, Check, Undo2, Save, X, CircleCheck, CircleAlert,
  TriangleAlert, ShieldCheck, Sparkles, Loader2, Lock,
} from 'lucide-react'
import PdfPages from '../../components/ui/PdfPages'
import { Card } from './CostShared'
import { fmtDate } from './costUtils'
import { session, statusOf, loadDocuments, generatedInvoices, analyse, money, confidenceTone, REVIEW_BELOW } from './invoiceModel'

const statusCls = (s) => s.replace(' ', '-').toLowerCase()

/**
 * One invoice: the PDF on the left, extracted fields on the right with their confidence. Fields below the review
 * threshold, or failing an arithmetic check, must be corrected (Edit) or confirmed before the invoice can be approved.
 */
export default function InvoiceDetail() {
  const { id } = useParams()
  const { pathname, state } = useLocation()
  const navigate = useNavigate()
  // Just uploaded: the analysis step runs first, then the history entry is cleared so a refresh doesn't repeat it
  const analyzing = Boolean(state?.analyzing)
  const finishAnalysis = () => navigate(pathname, { replace: true, state: null })
  const [inv, setInv] = useState(undefined) // undefined loading, null not found
  const [, setVersion] = useState(0) // bumped after a change to the session state
  const [editing, setEditing] = useState(null) // { key, value }
  const [toast, setToast] = useState(null)
  const refresh = () => setVersion((v) => v + 1)

  useEffect(() => {
    let cancelled = false
    const local = generatedInvoices().find((x) => x.id === id)
    if (local) { setInv(local); return undefined }
    loadDocuments().then((d) => { if (!cancelled) setInv(d.find((x) => x.id === id) ?? null) }).catch(() => { if (!cancelled) setInv(null) })
    return () => { cancelled = true }
  }, [id])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  if (inv === undefined) return <div className="ci-page"><p className="ci-empty">Loading invoice…</p></div>
  if (inv === null) {
    return (
      <div className="ci-page">
        <div className="u-card ci-inv-empty"><FileText size={30} /><strong>Invoice not found</strong><span>There&apos;s no invoice {id}. <Link to="/cost/invoices">Back to all invoices</Link></span></div>
      </div>
    )
  }

  const a = analyse(inv)
  const x = a.invoice
  const status = statusOf(inv)
  const pending = a.needsReview.length

  const setField = (key, value) => {
    session.edits[inv.id] = { ...session.edits[inv.id], [key]: value }
    setEditing(null)
    refresh()
    setToast({ kind: 'success', text: `${a.fields.find((f) => f.key === key).label} corrected.` })
  }
  const undo = (key) => {
    const { [key]: _drop, ...rest } = session.edits[inv.id] ?? {}
    session.edits[inv.id] = rest
    refresh()
  }
  const confirm = (key) => {
    session.confirmed[inv.id] = { ...session.confirmed[inv.id], [key]: true }
    refresh()
  }
  const decide = (s) => {
    session.status[inv.id] = s
    refresh()
    setToast({ kind: s === 'Rejected' ? 'error' : 'success', text: `${x.number} marked ${s.toLowerCase()}.` })
  }
  const counts = { high: a.fields.filter((f) => f.extracted >= 90).length, mid: a.fields.filter((f) => f.extracted >= REVIEW_BELOW && f.extracted < 90).length, low: a.fields.filter((f) => f.extracted < REVIEW_BELOW).length }

  return (
    <div className={`ci-page ci-invd${analyzing ? ' analyzing' : ''}`}>
      <div className="ci-invd-head">
        <div>
          <Link to="/cost/invoices" className="ci-back"><ArrowLeft size={15} />All invoices</Link>
          <h1><span className="a-mono">{x.number}</span><span className={`ci-status ${statusCls(status)}`}>{status}</span></h1>
          <p>{x.contractor} · {x.school}{x.building ? `, ${x.building}` : ''} · {fmtDate(x.date)} · <b>{money(x.total)}</b></p>
        </div>
        <div className="ci-invd-acts">
          <button type="button" className="u-btn u-btn-outline" disabled={status !== 'Pending Review'} onClick={() => decide('Reviewed')}><Eye size={14} />Mark Reviewed</button>
          <button type="button" className="u-btn u-btn-outline ci-reject" disabled={status === 'Rejected' || status === 'Approved'} onClick={() => decide('Rejected')}><XCircle size={14} />Reject</button>
          <button type="button" className="u-btn u-btn-primary" disabled={status === 'Approved' || status === 'Rejected' || pending > 0}
            title={pending ? 'Correct or confirm the fields that need manual review first' : undefined} onClick={() => decide('Approved')}><CheckCircle2 size={14} />Approve</button>
        </div>
      </div>

      {pending > 0 ? (
        <p className="ci-review-banner warn"><PencilLine size={16} /><span><b>Manual review required:</b> {pending} field{pending === 1 ? '' : 's'} below {REVIEW_BELOW}% confidence or failing a check. Compare with the document, then <b>Edit</b> to correct or <b>Confirm</b> if it&apos;s right. Approval is available once all are resolved.</span></p>
      ) : (
        <p className="ci-review-banner ok"><ShieldCheck size={16} /><span><b>All fields verified.</b> Every extracted field is above {REVIEW_BELOW}% confidence or has been checked by a reviewer.</span></p>
      )}

      <div className="ci-invd-grid">
        <Card title="Invoice Document" className="ci-invd-doc"
          sub={x.matched ? `${x.fileName} · details from invoice record ${x.matched}` : x.fileName ?? (x.pdfUrl ? `${x.number}.pdf` : 'Generated from the invoice record (no PDF stored)')}
          actions={(x.pdfUrl || x.imageUrl) && (
            <div className="ci-tools">
              <a className="u-btn u-btn-outline u-btn-sm" href={x.pdfUrl ?? x.imageUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open</a>
              {/* An uploaded file lives in the browser (blob: URL) and downloads under its own name */}
              <a className="u-btn u-btn-outline u-btn-sm" href={x.fileName ? (x.pdfUrl ?? x.imageUrl) : `${x.pdfUrl}?download=1`} download={x.fileName ?? undefined}><Download size={13} />Download</a>
            </div>
          )}>
          {x.pdfUrl ? <PdfPages src={x.pdfUrl} title={x.fileName ?? `${x.number}.pdf`} />
            : x.imageUrl ? <div className="ci-doc-image"><img src={x.imageUrl} alt={`Invoice ${x.number}`} /></div>
              : <RenderedInvoice x={x} />}
        </Card>

        <div className="ci-stack">
          <Card title={<span className="ci-title-icon"><Sparkles size={16} />Extraction Confidence</span>}>
            <div className="ci-conf-sum">
              <div className={`ci-conf-big ${confidenceTone(a.overall)}`}><strong>{a.overall}%</strong><span>overall</span></div>
              <div className="ci-conf-break">
                <span className="ci-conf-bar" aria-hidden="true">
                  <i className="high" style={{ flexGrow: counts.high }} /><i className="mid" style={{ flexGrow: counts.mid }} /><i className="low" style={{ flexGrow: counts.low }} />
                </span>
                <ul>
                  <li><i className="high" />High (90%+) <b>{counts.high}</b></li>
                  <li><i className="mid" />Medium ({REVIEW_BELOW}–89%) <b>{counts.mid}</b></li>
                  <li><i className="low" />Low (below {REVIEW_BELOW}%) <b>{counts.low}</b></li>
                  <li><PencilLine size={12} />Corrected <b>{a.fields.filter((f) => f.edited).length}</b></li>
                </ul>
              </div>
            </div>
          </Card>

          <Card title="Extracted Fields" sub={pending ? `${pending} to review` : 'All verified'}>
            <ul className="ci-fields">
              {a.fields.map((f) => (
                <li key={f.key} className={f.review ? 'review' : undefined}>
                  <span className="ci-field-label">{f.label}{f.review && <small><TriangleAlert size={11} />{f.failing ? "Doesn't add up" : 'Manual review required'}</small>}</span>
                  {editing?.key === f.key ? (
                    <form className="ci-field-edit" onSubmit={(e) => { e.preventDefault(); setField(f.key, f.type === 'money' ? Number(editing.value) || 0 : editing.value.trim()) }}>
                      <input className="u-input" autoFocus type={f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'money' ? '0.01' : undefined}
                        value={editing.value} onChange={(e) => setEditing({ key: f.key, value: e.target.value })} aria-label={`Correct ${f.label}`} />
                      <button type="submit" className="u-row-btn" aria-label="Save"><Save size={14} /></button>
                      <button type="button" className="u-row-btn" onClick={() => setEditing(null)} aria-label="Cancel"><X size={14} /></button>
                    </form>
                  ) : (
                    <span className="ci-field-value">{f.text}{f.edited && <small className="ci-edited">Corrected · was {displayOriginal(inv, f)}</small>}{f.confirmed && !f.edited && <small className="ci-edited ok">Confirmed by reviewer</small>}</span>
                  )}
                  <span className={`ci-field-conf ${confidenceTone(f.confidence)}`} title={f.edited ? 'Corrected by a reviewer' : `Extraction confidence ${f.extracted}%`}>
                    <span className="ci-mini-bar"><i style={{ width: `${f.confidence}%` }} /></span>{f.confidence}%
                  </span>
                  <span className="ci-field-acts">
                    {editing?.key !== f.key && <button type="button" className="u-row-btn" onClick={() => setEditing({ key: f.key, value: String(f.value ?? '') })} aria-label={`Edit ${f.label}`} title="Edit"><PencilLine size={14} /></button>}
                    {f.review && editing?.key !== f.key && <button type="button" className="u-row-btn ci-confirm" onClick={() => confirm(f.key)} aria-label={`Confirm ${f.label}`} title="Confirm – the value is right"><Check size={14} /></button>}
                    {f.edited && <button type="button" className="u-row-btn" onClick={() => undo(f.key)} aria-label={`Undo correction to ${f.label}`} title="Undo correction"><Undo2 size={14} /></button>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Line Items">
            <table className="u-table ci-table ci-compact">
              <thead><tr><th>Description</th><th className="n">Qty</th><th className="n">Unit Rate</th><th className="n">Amount</th></tr></thead>
              <tbody>{x.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td className="n">{l.qty} {l.unit}</td><td className="n">{money(l.rate)}</td><td className="n">{money(l.total)}</td></tr>)}</tbody>
            </table>
            <dl className="ci-facts ci-inv-totals">
              {[['Subtotal', money(x.subtotal)], [`Tax (${x.taxRate}%)`, money(x.tax)], ...(x.discount ? [['Discount', `−${money(x.discount)}`]] : []), ['Grand Total', <b key="t">{money(x.total)}</b>],
                ['Amount Paid', money(x.paid)], ['Balance Due', <b key="b" className={x.balance > 0 ? 'ci-up' : undefined}>{money(x.balance)}</b>], ['Payment Terms', x.paymentTerms || '—']]
                .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </Card>

          <Card title="Validation Checks">
            <ul className="ci-checks">
              {a.checks.map((c) => <li key={c.key} className={c.ok ? 'ok' : 'bad'}>{c.ok ? <CircleCheck size={15} /> : <CircleAlert size={15} />}{c.label}</li>)}
            </ul>
          </Card>
        </div>
      </div>
      {toast && <div className={`u-toast ${toast.kind}`} role="status">{toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}{toast.text}</div>}
      {analyzing && <AnalyzingDialog fileName={x.fileName ?? `${x.number}.pdf`} onDone={finishAnalysis} />}
    </div>
  )
}

const ANALYSIS_MS = 30000
const ANALYSIS_STEPS = [
  { at: 0, label: 'Uploading the document securely' },
  { at: 0.12, label: 'Reading the document' },
  { at: 0.32, label: 'Extracting invoice information' },
  { at: 0.58, label: 'Validating financial details' },
  { at: 0.82, label: 'Scoring confidence and flagging fields to review' },
]

// Shown for 30 seconds after an upload, then the analysis underneath is revealed
function AnalyzingDialog({ fileName, onDone }) {
  const [elapsed, setElapsed] = useState(0)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    const start = Date.now()
    const t = setInterval(() => {
      const e = Date.now() - start
      setElapsed(e)
      if (e >= ANALYSIS_MS) { clearInterval(t); done.current() }
    }, 200)
    return () => clearInterval(t)
  }, [])
  const p = Math.min(1, elapsed / ANALYSIS_MS)
  const current = ANALYSIS_STEPS.findLastIndex((s) => p >= s.at)
  return (
    <div className="u-modal-backdrop ci-analyze-backdrop">
      <div className="u-modal ci-analyze" role="alertdialog" aria-modal="true" aria-labelledby="ci-an-title" aria-describedby="ci-an-text" aria-busy="true">
        <span className="ci-analyze-icon"><Sparkles size={26} /><Loader2 size={64} className="ci-spin" /></span>
        <h2 id="ci-an-title">Analyzing Invoice</h2>
        <p id="ci-an-text">Your invoice is being securely processed. Our AI system is analyzing the document, extracting invoice information, and validating financial details. Please wait while we complete the analysis.</p>
        <div className="ci-analyze-file"><FileText size={14} /><span>{fileName}</span><Lock size={12} /></div>
        <div className="ci-analyze-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label="Analysis progress">
          <i style={{ width: `${p * 100}%` }} />
        </div>
        <span className="ci-analyze-pct">{Math.round(p * 100)}%</span>
        <ul className="ci-analyze-steps">
          {ANALYSIS_STEPS.map((s, i) => (
            <li key={s.label} className={i < current ? 'done' : i === current ? 'now' : undefined}>
              {i < current ? <CircleCheck size={15} /> : i === current ? <Loader2 size={15} className="ci-spin" /> : <span className="ci-step-dot" />}{s.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// The value as extracted, before a reviewer's correction
function displayOriginal(inv, f) {
  if (f.type === 'money') return money(inv[f.key])
  if (f.type === 'date') return fmtDate(inv[f.key])
  return inv[f.key] || '—'
}

// For invoices without a stored PDF: the invoice laid out like a document
function RenderedInvoice({ x }) {
  return (
    <div className="ci-doc ci-doc-tall" aria-label="Invoice document">
      <div className="ci-doc-head"><strong>{x.contractor}</strong><span>INVOICE</span></div>
      <div className="ci-doc-meta">
        <span>Invoice No. <b>{x.number}</b></span><span>Date <b>{fmtDate(x.date)}</b></span>
        <span>Bill to <b>{x.school}</b></span><span>Site <b>{x.building}</b></span>
      </div>
      <table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>{x.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{l.qty} {l.unit}</td><td>{money(l.rate)}</td><td>{money(l.total)}</td></tr>)}</tbody>
      </table>
      <div className="ci-doc-tot"><span>Subtotal {money(x.subtotal)}</span><span>Tax {money(x.tax)}</span><b>Total {money(x.total)}</b></div>
    </div>
  )
}
