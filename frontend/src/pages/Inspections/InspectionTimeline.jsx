import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  UserPlus, ClipboardCheck, Send, BadgeCheck, Undo2, FlaskConical, Wrench, CalendarPlus, ListChecks, History, FileText, Image as ImageIcon,
  Paperclip, Download, ExternalLink, X, Eye, User, CircleDot,
} from 'lucide-react'
import PdfPages from '../../components/ui/PdfPages'
import { API_BASE } from '../../lib/api'
import { fmtDay } from '../Surveillance/survMeta'

const STAGE_REVIEW = /^(Sent for review|Review approved – stage confirmed|Review returned for rework)$/
const isPdf = (name) => /\.pdf$/i.test(name ?? '')
const isImage = (name) => /\.(png|jpe?g|webp|gif)$/i.test(name ?? '')
const fmtWhen = (at) => {
  if (!at) return { day: 'Undated', time: '' }
  const hasTime = String(at).length > 10
  const d = new Date(hasTime ? at : `${at}T00:00:00`)
  return { day: fmtDay(String(at).slice(0, 10)), time: hasTime ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '' }
}

// Icon for an entry, from what it records
function iconOf(e) {
  const t = e.title ?? ''
  if (e.kind === 'doc') return isImage(e.docs?.[0]?.name) ? ImageIcon : FileText
  if (e.kind === 'action') return Wrench
  if (e.kind === 'activity') return History
  if (/^Assigned|record created/i.test(t)) return UserPlus
  if (/^Submitted/i.test(t)) return Send
  if (/Reviewed & completed|approved/i.test(t)) return BadgeCheck
  if (/^Returned|returned for rework/i.test(t)) return Undo2
  if (/sample|lab result/i.test(t)) return FlaskConical
  if (/follow-up/i.test(t)) return CalendarPlus
  if (/checklist/i.test(t)) return ListChecks
  if (/carried out|Inspection/i.test(t)) return ClipboardCheck
  return CircleDot
}

// Where an entry falls within a day: assigned, carried out, documents, sample, submitted, review, lab, tasks
function stepOf(e) {
  const t = e.title ?? ''
  if (/^Assigned|record created/i.test(t)) return 0
  if (/carried out/i.test(t)) return 1
  if (/checklist/i.test(t)) return 2
  if (e.kind === 'doc') return 3
  if (/collected/i.test(t)) return 4
  if (/^Submitted/i.test(t)) return 5
  if (/^Returned|Reviewed|approved/i.test(t)) return 6
  if (/sent to the laboratory/i.test(t)) return 7
  if (/lab result/i.test(t)) return 8
  if (e.kind === 'action') return 9
  return 10
}

// The follow-up inspection an entry belongs to (its link opens it), or null for the inspection's own entries
const childOf = (e, ownId) => {
  const id = e.link?.match(/^\/inspections\/records\/([^/?#]+)/)?.[1] ?? e.title?.match(/^Follow-up (?:inspection )?(INS-[\w-]+)/)?.[1] ?? null
  return id && id !== ownId ? id : null
}
// Order of a follow-up's entries: scheduled, carried out, its samples, its tasks, submitted, approved
function followUpStep(e) {
  const t = e.title ?? ''
  if (/scheduled/i.test(t)) return 0
  if (/carried out/i.test(t)) return 1
  if (/sample/i.test(t)) return 2
  if (e.kind === 'action') return 3
  if (/submitted/i.test(t)) return 4
  if (/approved|open issues/i.test(t)) return 5
  return 6
}

/**
 * The inspection's history as one simple timeline, oldest first: assigned, carried out, documents, submitted,
 * reviewed, samples and lab results, O&M tasks and follow-ups — who, when, notes — with every report and photo
 * viewable in place (PDFs page by page).
 */
export default function InspectionTimeline({ timeline, record, followUps = [] }) {
  const [viewing, setViewing] = useState(null) // { name, href }
  const docHref = (href) => `${API_BASE}${href}`

  // One list, oldest first: by day, then in the order things happen within a day, then by time; undated last
  // (Stage changes and the old per-stage review requests aren't part of the inspection's flow any more; a pending
  // lab result with no date is a placeholder, not something that happened)
  const all = timeline.flatMap((s) => s.events)
    .filter((e) => e.kind !== 'stage' && !STAGE_REVIEW.test(e.title ?? '') && !(e.title?.startsWith('Lab result: Pending') && !e.at))
    .map((e, i) => ({ ...e, i, child: childOf(e, record?.id) }))
  const byTime = (step) => (a, b) => (a.at ? 0 : 1) - (b.at ? 0 : 1) || String(a.at ?? '').slice(0, 10).localeCompare(String(b.at ?? '').slice(0, 10))
    || step(a) - step(b) || String(a.at ?? '').localeCompare(String(b.at ?? '')) || a.i - b.i
  // The inspection's own events, then each follow-up inspection's, in the order its work happens
  const own = all.filter((e) => !e.child).sort(byTime(stepOf))
  const followUpIds = [...new Set(all.filter((e) => e.child).map((e) => e.child))]
  const groups = followUpIds.map((id) => ({
    id, record: followUps.find((k) => k.id === id),
    events: all.filter((e) => e.child === id).map((e) => ({ ...e, title: e.title.replace(/^Follow-up carried out/, `Follow-up ${id} carried out`) }))
      .sort((a, b) => followUpStep(a) - followUpStep(b) || byTime(() => 0)(a, b)),
  }))
  const events = [...own, ...groups.flatMap((g) => g.events)]
  const files = (record?.attachments ?? []).map((f) => ({ ...f, href: `/inspection-records/records/${record.id}/attachments/${f.id}` }))
    .sort((a, b) => String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? '')))
  const reports = files.filter((f) => isPdf(f.name))
  const photos = files.filter((f) => isImage(f.name))

  const renderItem = (e) => {
    const Icon = iconOf(e)
    // Action items carry no date of their own: they're shown as tasks
    const when = !e.at && e.kind === 'action' ? { day: 'Task', time: '' } : fmtWhen(e.at)
    return (
      <li key={e.i} className={`in-tl2-item tone-${e.tone ?? 'none'}`}>
        <div className="in-tl2-when"><strong>{when.day}</strong>{when.time && <span>{when.time}</span>}</div>
        <span className="in-tl2-dot" aria-hidden="true"><Icon size={15} /></span>
        <div className="in-tl2-card">
          <div className="in-tl2-title">{e.title}</div>
          {e.by && <div className="in-tl2-by"><User size={12} />{e.by}</div>}
          {e.detail && <div className="in-tl2-detail">{e.detail}</div>}
          {e.notes && <p className="in-tl2-notes">{e.notes}</p>}
          {(e.docs?.length > 0 || e.link) && (
            <div className="in-tl2-links">
              {e.docs?.map((d) => (
                <button key={d.href} type="button" className="in-tl2-doc" onClick={() => setViewing(d)}>
                  {isPdf(d.name) ? <FileText size={13} /> : isImage(d.name) ? <ImageIcon size={13} /> : <Paperclip size={13} />}{d.name}
                </button>
              ))}
              {e.link && <Link to={e.link} className="in-tl2-open"><ExternalLink size={12} />{e.linkLabel ?? 'Open'}</Link>}
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="in-tl2">
      <section className="u-card in-tl2-main">
        <header className="in-tl2-head">
          <h2><History size={18} />Timeline</h2>
          <span className="u-muted">{events.length} event{events.length === 1 ? '' : 's'} · oldest first</span>
        </header>
        {!events.length && <p className="u-muted in-tab-empty">No activity recorded yet.</p>}
        <ol className="in-tl2-list">
          {own.map(renderItem)}
          {groups.map((g) => (
            <Fragment key={g.id}>
              {/* Each follow-up inspection's part of the history, under its own heading */}
              <li className="in-tl2-divider">
                <CalendarPlus size={15} />
                <span>Follow-up inspection <Link to={`/inspections/records/${g.id}`} className="sv-id">{g.id}</Link></span>
                {g.record && <small>{[g.record.statusLabel, g.record.inspectorName].filter(Boolean).join(' · ')}</small>}
              </li>
              {g.events.map(renderItem)}
            </Fragment>
          ))}
        </ol>
      </section>

      <aside className="u-card in-tl2-side">
        <header className="in-tl2-head"><h2><Paperclip size={18} />Attachments</h2><span className="u-muted">{files.length}</span></header>
        {!files.length && <p className="u-muted in-tl2-none">No attachments yet.</p>}
        {reports.length > 0 && <h3 className="in-tl2-sub">Documents (PDF)</h3>}
        <ul className="in-tl2-files">
          {reports.map((f) => <FileRow key={f.id} f={f} href={docHref(f.href)} onView={() => setViewing(f)} />)}
        </ul>
        {photos.length > 0 && <h3 className="in-tl2-sub">Photos</h3>}
        <ul className="in-tl2-files">
          {photos.map((f) => <FileRow key={f.id} f={f} href={docHref(f.href)} onView={() => setViewing(f)} />)}
        </ul>
      </aside>

      {viewing && <DocViewer doc={viewing} src={docHref(viewing.href)} onClose={() => setViewing(null)} />}
    </div>
  )
}

export function FileRow({ f, href, onView }) {
  return (
    <li>
      <button type="button" className="in-tl2-file" onClick={onView}>
        <span className={`in-tl2-ficon${isPdf(f.name) ? ' pdf' : ''}`}>{isPdf(f.name) ? <FileText size={16} /> : <ImageIcon size={16} />}</span>
        <span className="in-tl2-fname"><strong>{f.name}</strong><small>{[f.category, f.uploadedAt && fmtDay(f.uploadedAt.slice(0, 10)), f.uploadedBy?.name].filter(Boolean).join(' · ')}</small></span>
        <Eye size={15} className="in-tl2-fview" />
      </button>
      <a className="u-row-btn" href={`${href}?download=1`} aria-label={`Download ${f.name}`} title="Download"><Download size={14} /></a>
    </li>
  )
}

// A report or photo in a large panel: PDFs drawn page by page, fitted to the width
export function DocViewer({ doc, src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="u-modal-backdrop in-viewer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal in-viewer" role="dialog" aria-modal="true" aria-label={doc.name}>
        <header className="in-viewer-head">
          <strong title={doc.name}>{doc.name}</strong>
          <a className="u-btn u-btn-outline u-btn-sm" href={src} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open</a>
          <a className="u-btn u-btn-outline u-btn-sm" href={`${src}?download=1`}><Download size={13} />Download</a>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="in-viewer-body">
          {isPdf(doc.name) ? <PdfPages src={src} title={doc.name} />
            : isImage(doc.name) ? <div className="in-viewer-img"><img src={src} alt={doc.name} /></div>
              : <p className="u-muted in-tab-empty">This file can&apos;t be previewed. <a href={`${src}?download=1`}>Download it</a>.</p>}
        </div>
      </div>
    </div>
  )
}
