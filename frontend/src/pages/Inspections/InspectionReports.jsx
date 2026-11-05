import { useMemo, useState } from 'react'
import { FileText, Download, ExternalLink, Paperclip, CircleAlert } from 'lucide-react'
import { API_BASE } from '../../lib/api'
import { fmtDay } from '../Surveillance/survMeta'
import { measureText, limitText, samplesOf } from './inspMeta'
import { FileRow, DocViewer } from './InspectionTimeline'

const STATUS = { scheduled: 'Scheduled', draft: 'In Progress', submitted: 'In Review', approved: 'Completed', returned: 'Returned for Changes' }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const day = (iso) => (iso ? fmtDay(String(iso).slice(0, 10)) : '—')
const acmsOf = (r) => [r, ...(r.extra ?? [])]
const isPdf = (name) => /\.pdf$/i.test(name ?? '')
const isImage = (name) => /\.(png|jpe?g|webp|gif)$/i.test(name ?? '')

// A signature image (data URL) or a note that it's on paper
const sig = (s) => (s === 'on-file' ? '<em>Signed on paper – on file</em>' : s ? `<img class="sig" src="${esc(s)}" alt="Signature">` : '<em>Not signed</em>')

/**
 * The inspection as a printable report (HTML laid out as Letter pages): location, ACMs and their condition,
 * sampling and lab results, comments, action items and the inspector's and reviewer's sign-off.
 */
export function inspectionReportHtml({ record: r, ctx, materials }) {
  const mat = (id) => materials.find((m) => m.id === id)
  const loc = ctx?.location ?? {}
  const v = r.verification ?? {}
  const acms = acmsOf(r)
  const samples = acms.flatMap((a) => samplesOf(a).map(({ s }) => ({ a, s })))
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Inspection Report ${esc(r.id)}</title><style>
  @page { size: Letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; font: 11.5px/1.5 'Segoe UI', Arial, sans-serif; color: #1d2733; background: #fff; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; border-bottom: 3px solid #0f3b66; }
  .top h1 { margin: 0; font-size: 22px; color: #0f3b66; }
  .top p { margin: 2px 0 0; color: #5b6b7b; }
  .top .id { text-align: right; }
  .top .id b { display: block; font-size: 16px; color: #0f3b66; }
  .status { display: inline-block; margin-top: 4px; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; background: ${r.state === 'approved' ? '#e3f4e5; color: #146b2e' : '#efeafb; color: #4b34a8'}; }
  h2 { margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d7dee6; font-size: 14px; color: #0f3b66; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; }
  .grid div span { display: block; font-size: 10.5px; color: #5b6b7b; }
  .grid div b { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0f3b66; color: #fff; font-weight: 600; text-align: left; padding: 6px 7px; font-size: 11px; }
  td { padding: 6px 7px; border-bottom: 1px solid #e3e8ee; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f9fb; }
  .note { margin: 0; padding: 8px 10px; border-radius: 6px; background: #f3f6f9; white-space: pre-line; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .sign > div { padding: 10px 12px; border: 1px solid #d7dee6; border-radius: 8px; }
  .sign h3 { margin: 0 0 6px; font-size: 12px; color: #0f3b66; }
  .sig { display: block; max-width: 220px; max-height: 70px; margin: 6px 0; }
  .muted { color: #5b6b7b; }
  .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #d7dee6; font-size: 10px; color: #8a99a8; text-align: center; }
  </style></head><body>
  <div class="top">
    <div><h1>${r.parentId ? 'Asbestos Follow-up Inspection Report' : 'Asbestos Inspection Report'}</h1><p>Seattle Public Schools · Environmental Health &amp; Safety${r.parentId ? ` · Follow-up of inspection ${esc(r.parentId)}` : ''}</p></div>
    <div class="id"><b>${esc(r.id)}</b>${esc(r.type)}<br><span class="status">${esc(STATUS[r.state] ?? r.state)}</span></div>
  </div>

  <h2>Inspection &amp; Location</h2>
  <div class="grid">
    <div><span>School</span><b>${esc(loc.schoolName ?? '—')}</b></div>
    <div><span>Building</span><b>${esc(loc.buildingName ?? '—')}</b></div>
    <div><span>Floor / Room</span><b>${esc([loc.floorName, [loc.roomNumber, loc.roomName].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || '—')}</b></div>
    <div><span>Inspection Date</span><b>${day(r.date)}</b></div>
    <div><span>Inspector</span><b>${esc(r.inspectorName ?? '—')}</b></div>
    <div><span>Certification</span><b>${esc(r.certification ? `${r.certification.name ?? ''} ${r.certification.number ?? ''}`.trim() : '—')}</b></div>
    <div><span>Location Description</span><b>${esc(r.locationDescription || '—')}</b></div>
    <div><span>Homogeneous Area</span><b>${esc(r.homogeneousAreaId || '—')}</b></div>
    <div><span>ACMs Inspected</span><b>${acms.length}</b></div>
  </div>

  <h2>Material Condition Assessment</h2>
  <table><thead><tr><th>ACM</th><th>Type</th><th>Previous</th><th>Current</th><th>Damage</th><th>Priority</th><th>Recommended Action</th></tr></thead><tbody>
  ${acms.map((a) => {
    const m = mat(a.materialId)
    const as = a.assessment ?? {}
    return row([`<b>${esc(m?.name ?? a.materialId)}</b><br><span class="muted">${esc(a.materialId)}</span>`, esc(m?.materialType ?? '—'), esc(as.previousCondition ?? '—'),
      `<b>${esc(as.currentCondition ?? '—')}</b>`, esc([as.damageType !== 'None' && as.damageType, as.damageExtent !== 'None' && as.damageExtent].filter(Boolean).join(' · ') || 'None'),
      esc(a.risk?.priority ?? '—'), esc(a.risk?.recommendedAction ?? '—')])
  }).join('')}
  </tbody></table>

  <h2>Sampling &amp; Laboratory Results</h2>
  ${samples.length ? `<table><thead><tr><th>Sample ID</th><th>ACM</th><th>Laboratory / Test</th><th>Collected</th><th>Result</th><th>Measurement</th></tr></thead><tbody>
  ${samples.map(({ a, s }) => {
    return row([`<b>${esc(s.sampleId || '—')}</b>`, esc(mat(a.materialId)?.name ?? a.materialId), `${esc(s.laboratory || '—')}<br><span class="muted">${esc(s.testMethod || '')}</span>`,
      day(s.collectionDate), `<b>${esc(s.result ?? '—')}</b>${s.passFail ? ` · ${esc(s.passFail)}` : ''}`, esc([measureText(s), limitText(s)].filter(Boolean).join(' · ') || '—')])
  }).join('')}</tbody></table>` : '<p class="muted">No samples were required for this inspection.</p>'}

  <h2>Comments &amp; Observations</h2>
  ${r.comments ? `<p class="note">${esc(r.comments)}</p>` : '<p class="muted">No comments recorded.</p>'}

  <h2>O&amp;M Tasks</h2>
  ${r.actionItems?.length ? `<table><thead><tr><th>Work</th><th>Contractor / Person</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead><tbody>
  ${r.actionItems.map((x) => row([`${x.type ? `<b>${esc(x.type)}</b><br>` : ''}${esc(x.action)}${x.omActivityId ? ` <span class="muted">(${esc(x.omActivityId)})</span>` : ''}`,
    esc(x.assignee ?? (x.type ? 'To be assigned by the reviewer' : x.assignedTo) ?? '—'), esc(x.priority ?? '—'), day(x.dueDate), esc(x.status ?? '—')])).join('')}
  </tbody></table>` : '<p class="muted">No O&amp;M tasks.</p>'}

  <h2>Verification &amp; Sign-off</h2>
  <div class="sign">
    <div><h3>Inspector</h3><b>${esc(r.inspectorName ?? '—')}</b><br><span class="muted">Completed ${day(v.completionDate)}</span>${sig(v.inspectorSignature)}</div>
    <div><h3>Reviewer</h3>${r.state === 'approved'
      ? `<b>${esc(v.reviewerName ?? '—')}</b><br><span class="muted">Reviewed ${day(v.reviewDate || v.approvalDate)}</span>${sig(v.reviewerSignature)}${v.reviewComments ? `<p class="note">${esc(v.reviewComments)}</p>` : ''}`
      : '<span class="muted">Waiting for review</span>'}</div>
  </div>

  <div class="foot">Generated ${esc(new Date().toLocaleString('en-US'))} · Inspection ${esc(r.id)}</div>
  </body></html>`
}

/**
 * Reports for the inspection and its follow-up inspections: each one's report generated from its record
 * (choose which to preview; Open / Download PDF) and the reports and photos attached to each (lab reports
 * included), opened in the viewer. Follow-ups cover the same ACMs, so they share the inspection's location.
 */
export default function InspectionReports({ record, ctx, materials, followUps = [] }) {
  const [viewing, setViewing] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [shownId, setShownId] = useState(record.id)
  const all = [record, ...followUps]
  const shown = all.find((r) => r.id === shownId) ?? record
  const html = useMemo(() => inspectionReportHtml({ record: shown, ctx, materials }), [shown, ctx, materials])
  // Attached files of each inspection (the inspection first, then its follow-ups), newest first within each
  const groups = all.map((r) => {
    const files = (r.attachments ?? []).map((f) => ({ ...f, href: `/inspection-records/records/${r.id}/attachments/${f.id}` }))
      .sort((a, b) => String(b.uploadedAt ?? '').localeCompare(String(a.uploadedAt ?? '')))
    return { r, files, reports: files.filter((f) => isPdf(f.name)), photos: files.filter((f) => isImage(f.name)), others: files.filter((f) => !isPdf(f.name) && !isImage(f.name)) }
  })
  const fileCount = groups.reduce((n, g) => n + g.files.length, 0)

  // A new window with the report, which opens the print dialog ("Save as PDF")
  const openReport = (print) => {
    const w = window.open('', '_blank')
    if (!w) { setBlocked(true); return }
    setBlocked(false)
    w.document.write(print ? html.replace('</body>', '<script>window.onload = () => window.print()</script></body>') : html)
    w.document.close()
  }

  return (
    <div className="in-rep">
      <section className="u-card in-rep-main">
        <header className="in-tl2-head">
          <h2><FileText size={18} />{shown.parentId ? 'Follow-up Inspection Report' : 'Inspection Report'}</h2>
          <div className="in-rep-acts">
            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => openReport(false)}><ExternalLink size={13} />Open</button>
            <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={() => openReport(true)}><Download size={13} />Download PDF</button>
          </div>
        </header>
        {/* Which report to show: this inspection's, or one of its follow-ups' */}
        {followUps.length > 0 && (
          <div className="in-rep-pick" role="tablist" aria-label="Reports">
            {all.map((r) => (
              <button key={r.id} type="button" role="tab" aria-selected={r.id === shown.id} className={r.id === shown.id ? 'on' : undefined} onClick={() => setShownId(r.id)}>
                <FileText size={14} />
                <span><strong>{r.parentId ? 'Follow-up' : 'Inspection'} {r.id}</strong><small>{[STATUS[r.state] ?? r.state, r.date && day(r.date)].filter(Boolean).join(' · ')}</small></span>
              </button>
            ))}
          </div>
        )}
        {blocked && <p className="in-rep-warn"><CircleAlert size={14} />Allow pop-ups for this site to open or save the report.</p>}
        {shown.state === 'scheduled' && <p className="in-rep-warn"><CircleAlert size={14} />This follow-up hasn&apos;t been carried out yet – its report fills in once it&apos;s inspected.</p>}
        <div className="in-rep-paper"><iframe title={`Report ${shown.id}`} srcDoc={html} /></div>
      </section>

      <aside className="u-card in-tl2-side">
        <header className="in-tl2-head"><h2><Paperclip size={18} />Attached Reports</h2><span className="u-muted">{fileCount}</span></header>
        {!fileCount && <p className="u-muted in-tl2-none">No lab reports, photos or other documents attached yet. They appear here when added to the inspection, its follow-ups or their lab results.</p>}
        {groups.filter((g) => g.files.length).map((g) => (
          <div key={g.r.id} className="in-rep-group">
            {(followUps.length > 0) && <h3 className="in-rep-group-title">{g.r.parentId ? 'Follow-up' : 'Inspection'} {g.r.id}<span>{g.files.length}</span></h3>}
            {g.reports.length > 0 && <h4 className="in-tl2-sub">Reports (PDF)</h4>}
            <ul className="in-tl2-files">{g.reports.map((f) => <FileRow key={f.id} f={f} href={`${API_BASE}${f.href}`} onView={() => setViewing(f)} />)}</ul>
            {g.photos.length > 0 && <h4 className="in-tl2-sub">Photos</h4>}
            <ul className="in-tl2-files">{g.photos.map((f) => <FileRow key={f.id} f={f} href={`${API_BASE}${f.href}`} onView={() => setViewing(f)} />)}</ul>
            {g.others.length > 0 && <h4 className="in-tl2-sub">Other</h4>}
            <ul className="in-tl2-files">{g.others.map((f) => <FileRow key={f.id} f={f} href={`${API_BASE}${f.href}`} onView={() => setViewing(f)} />)}</ul>
          </div>
        ))}
      </aside>

      {viewing && <DocViewer doc={viewing} src={`${API_BASE}${viewing.href}`} onClose={() => setViewing(null)} />}
    </div>
  )
}
