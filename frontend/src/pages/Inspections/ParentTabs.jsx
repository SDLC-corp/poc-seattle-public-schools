import { Link, useNavigate } from 'react-router'
import { CalendarPlus, FlaskConical, Wrench, FileText, Pencil, Plus, ExternalLink, ClipboardPen, Wind, Play } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import { fmtDay } from '../Surveillance/survMeta'
import { API_BASE } from '../../lib/api'
import { STATE_TONE, ACTION_TONE, RESULT_TONE, PASS_TONE, CONDITION_TONE, measureText, limitText, fmtTime, samplesOf, sampleLink } from './inspMeta'

/**
 * Tabs of an inspection with follow-up inspections carried out under it (children): the follow-ups, and the
 * lab results and O&M work of the inspection and its follow-ups together — the follow-ups continue the
 * parent's stages rather than starting their own.
 */

const acmsOf = (r) => [r, ...(r.extra ?? [])]
const openItems = (r) => (r.actionItems ?? []).filter((a) => a.status !== 'Completed')
// A follow-up's verdict once it's approved (server: inspectionLifecycle.followUpOf)
const verdictOf = (k) => {
  if (k.state !== 'approved') return null
  if (openItems(k).length) return { text: 'Issues found – corrective action', tone: 'critical' }
  if (acmsOf(k).some((a) => a.risk?.followUpRequired === 'Yes')) return { text: 'Rework done – verify again', tone: 'warning' }
  return { text: 'Verified – no further action', tone: 'good' }
}

// The follow-ups, one row each; choosing one opens its form below (selected / onSelect)
export function FollowUpsPanel({ followUps, selected, onSelect, onSchedule }) {
  return (
    <section className="u-card in-tabpanel" aria-label="Follow-up inspections">
      <header className="in-tabpanel-head in-tabpanel-head-row">
        <div>
          <h2><CalendarPlus size={17} />Follow-up Inspections</h2>
          <p className="in-hint">Inspections of the same ACMs carried out under this one, to verify the work or the condition.</p>
        </div>
        {onSchedule && <button type="button" className="u-btn u-btn-primary" onClick={onSchedule}><Plus size={15} />Schedule Follow-up</button>}
      </header>
      {followUps.length ? (
        <div className="u-table-wrap">
          <table className="u-table in-family-table">
            <thead>
              <tr><th>Inspection</th><th>Inspector</th><th>Scheduled</th><th>Carried Out</th><th>Condition</th><th>Lab</th><th>O&amp;M / Actions</th><th>Status</th><th>Outcome</th><th aria-label="Open" /></tr>
            </thead>
            <tbody>
              {followUps.map((k) => {
                const samples = acmsOf(k).flatMap((a) => samplesOf(a).map((x) => ({ ...x, materialId: a.materialId })))
                const v = verdictOf(k)
                return (
                  <tr key={k.id} className={`in-fu-row${k.id === selected ? ' selected' : ''}`} onClick={() => onSelect(k.id)}>
                    <td className="u-nowrap"><button type="button" className="sv-id in-fu-pick" onClick={() => onSelect(k.id)}>{k.id}</button><small className="in-rv-sub">{k.type}</small></td>
                    <td>{k.inspectorName ?? '—'}</td>
                    <td className="u-nowrap">{k.scheduledDate ? fmtDay(k.scheduledDate) : '—'}{k.scheduledTime && <small className="in-rv-sub">{fmtTime(k.scheduledTime)}</small>}</td>
                    <td className="u-nowrap">{k.date ? fmtDay(k.date) : <span className="u-muted">Not yet</span>}</td>
                    <td>{acmsOf(k).map((a) => a.assessment?.currentCondition).filter(Boolean).map((c, i) => <Badge key={i} tone={CONDITION_TONE[c]}>{c}</Badge>)}{!k.assessment?.currentCondition && <span className="u-muted">—</span>}</td>
                    <td>{samples.length ? samples.map((x) => <Badge key={`${x.materialId}:${x.k}`} tone={RESULT_TONE[x.s.result] ?? 'neutral'}>{x.s.result}</Badge>) : <span className="u-muted">No sample</span>}</td>
                    <td>{(k.actionItems ?? []).length ? `${openItems(k).length} open of ${k.actionItems.length}` : <span className="u-muted">None</span>}</td>
                    <td><Badge tone={STATE_TONE[k.state]}>{k.statusLabel}</Badge></td>
                    <td>{v ? <Badge tone={v.tone}>{v.text}</Badge> : <span className="u-muted">Pending</span>}</td>
                    <td className="u-nowrap">
                      {/* Not started yet: Start Inspection, with when it's scheduled; started: continue; otherwise view it */}
                      <span className="in-fu-go">
                        <span className="in-fu-go-row">
                          <button type="button" className={`u-btn u-btn-sm ${k.state === 'scheduled' || k.id === selected ? 'u-btn-primary' : 'u-btn-outline'}`} onClick={(e) => { e.stopPropagation(); onSelect(k.id) }}>
                            {k.state === 'scheduled' ? <><Play size={13} />Start Inspection</>
                              : ['draft', 'returned'].includes(k.state) ? <><ClipboardPen size={13} />Continue</> : <><ClipboardPen size={13} />View</>}
                          </button>
                          <Link to={`/inspections/records/${k.id}`} className="u-row-btn" aria-label={`Open ${k.id} on its own page`} title="Open on its own page" onClick={(e) => e.stopPropagation()}><ExternalLink size={14} /></Link>
                        </span>
                        {k.state === 'scheduled' && k.scheduledDate && <small>{fmtDay(k.scheduledDate)}{k.scheduledTime ? ` · ${fmtTime(k.scheduledTime)}` : ''}</small>}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="u-muted in-tabpanel-empty">
          No follow-up inspections yet.{onSchedule && <> Use <strong>Schedule Follow-up</strong> to assign one.</>}
        </p>
      )}
    </section>
  )
}

export function LabPanel({ record, followUps, materials, canEditParent, onUpdate }) {
  const navigate = useNavigate()
  const nameOf = (id) => materials.find((m) => m.id === id)?.name ?? id
  // Every sample of the inspection and its follow-ups (an ACM can have several; k is the sample's position)
  const rows = [record, ...followUps].flatMap((r) => acmsOf(r).flatMap((a, i) => samplesOf(a).map(({ k, s }) => ({ r, a, i, k, s }))))
  const reportsOf = (r, a) => (r.attachments ?? []).filter((f) => f.category === 'Laboratory Report' && (f.materialId ?? r.materialId) === a.materialId)
  // The parent's results until its lab review approves them; a follow-up's until the follow-up is approved
  const editable = (r) => (r.id === record.id ? canEditParent : r.state === 'submitted')
  /**
   * Where the sample is listed once it's at the lab: an air sample under Air Monitoring, others under
   * Lab & Sampling Results (ids as the server's inspectionSamples.js makes them). Null until it's been sent.
   */
  const listedAt = (r, i, k, s) => {
    const sent = (r.state === 'submitted' || r.state === 'approved') && (!r.reviewGates || s.sentToLabAt || s.result !== 'Pending')
    if (!sent) return null
    const air = s.sampleType === 'Air Sample'
    return { to: sampleLink(r.id, i, k, s), label: air ? 'Air Monitoring' : 'Lab Results', icon: air ? Wind : FlaskConical }
  }
  return (
    <section className="u-card in-tabpanel" aria-label="Lab results">
      <header className="in-tabpanel-head">
        <h2><FlaskConical size={17} />Lab Results</h2>
        <p className="in-hint">Samples of this inspection and its follow-up inspections.</p>
      </header>
      {rows.length ? (
        <div className="u-table-wrap">
          <table className="u-table in-family-table">
            <thead>
              <tr><th>Sample ID</th><th>From</th><th>ACM</th><th>Type</th><th>Laboratory / Test</th><th>Collected</th><th>Result</th><th>Lab Report</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {rows.map(({ r, a, i, k, s }) => {
                // The whole row opens the sample where it's listed (or, before it's at the lab, its result entry)
                const at = listedAt(r, i, k, s)
                const open = at ? () => navigate(at.to) : editable(r) ? () => onUpdate(r) : null
                return (
                <tr key={`${r.id}-${a.materialId}-${k}`} className={open ? 'in-row-link' : undefined} tabIndex={open ? 0 : undefined}
                  title={at ? `Open in ${at.label === 'Air Monitoring' ? 'Air Monitoring' : 'Lab & Sampling Results'}` : undefined}
                  onClick={(ev) => { if (open && !ev.target.closest('a, button')) open() }}
                  onKeyDown={(ev) => { if (open && ev.key === 'Enter' && ev.target === ev.currentTarget) open() }}>
                  <td className="u-nowrap"><strong>{s.sampleId || '—'}</strong></td>
                  <td className="u-nowrap">{r.id === record.id ? 'This inspection' : <Link to={`/inspections/records/${r.id}`} className="sv-id">{r.id}</Link>}{r.id !== record.id && <small className="in-rv-sub">Follow-up</small>}</td>
                  <td>{nameOf(a.materialId)}</td>
                  <td>{s.sampleType || 'Bulk Material Sample'}</td>
                  <td>{s.laboratory || '—'}<small className="in-rv-sub">{s.testMethod}</small></td>
                  <td className="u-nowrap">{s.collectionDate ? fmtDay(s.collectionDate) : '—'}</td>
                  <td>
                    <span className="in-rv-result">
                      <Badge tone={RESULT_TONE[s.result] ?? 'neutral'}>{s.result}</Badge>
                      {s.passFail && <Badge tone={PASS_TONE[s.passFail]}>{s.passFail}</Badge>}
                    </span>
                    {measureText(s) && <small className="in-rv-sub">{measureText(s)}{limitText(s) ? ` · ${limitText(s)}` : ''}</small>}
                  </td>
                  <td>
                    {reportsOf(r, a).map((f) => <a key={f.id} href={`${API_BASE}/inspection-records/records/${r.id}/attachments/${f.id}`} target="_blank" rel="noreferrer" className="in-review-doc"><FileText size={12} />{f.name}</a>)}
                    {!reportsOf(r, a).length && <span className="u-muted">—</span>}
                  </td>
                  <td>
                    <span className="in-lab-acts">
                      {editable(r) && (
                        <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => onUpdate(r)}>
                          <Pencil size={13} />{s.result === 'Pending' ? 'Enter' : 'Update'}
                        </button>
                      )}
                      {at
                        ? <Link to={at.to} className="u-btn u-btn-outline u-btn-sm"><at.icon size={13} />{at.label}</Link>
                        : <small className="u-muted" title="The reviewer sends the samples to the laboratory when approving the inspection">Not at lab yet</small>}
                    </span>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="u-muted in-tabpanel-empty">No samples were taken in this inspection or its follow-ups.</p>}
    </section>
  )
}

export function OmPanel({ record, followUps, onAdd }) {
  const navigate = useNavigate()
  const all = [record, ...followUps]
  const items = all.flatMap((r) => (r.actionItems ?? []).map((x) => ({ r, x })))
  // O&M work can be added to the inspection, and to a follow-up waiting for its review
  const targets = all.filter((r) => r.id === record.id ? (record.state === 'submitted' || record.state === 'approved') : r.state === 'submitted')
  return (
    <section className="u-card in-tabpanel" aria-label="O&M tasks">
      <header className="in-tabpanel-head">
        <h2><Wrench size={17} />O&amp;M Tasks &amp; Action Items</h2>
        <span className="in-tabpanel-actions">
          {targets.map((r) => (
            <button key={r.id} type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => onAdd(r)}>
              <Plus size={13} />Add O&amp;M Task{r.id === record.id ? '' : ` to ${r.id}`}
            </button>
          ))}
        </span>
      </header>
      {items.length ? (
        <div className="u-table-wrap">
          <table className="u-table in-family-table">
            <thead><tr><th>Task</th><th>From</th><th>Assigned To</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {items.map(({ r, x }) => (
                // An O&M task's row opens its activity in Operations & Maintenance
                <tr key={`${r.id}-${x.id}`} className={x.omActivityId ? 'in-row-link' : undefined} tabIndex={x.omActivityId ? 0 : undefined}
                  title={x.omActivityId ? 'Open in Operations & Maintenance' : undefined}
                  onClick={(ev) => { if (x.omActivityId && !ev.target.closest('a, button')) navigate(`/operations/activities/${x.omActivityId}`) }}
                  onKeyDown={(ev) => { if (x.omActivityId && ev.key === 'Enter' && ev.target === ev.currentTarget) navigate(`/operations/activities/${x.omActivityId}`) }}>
                  <td>
                    {x.omActivityId && <Link to={`/operations/activities/${x.omActivityId}`} className="sv-id">{x.omActivityId}</Link>}
                    <span className="in-om-text">{x.action}</span>
                  </td>
                  <td className="u-nowrap">{r.id === record.id ? 'This inspection' : <><Link to={`/inspections/records/${r.id}`} className="sv-id">{r.id}</Link><small className="in-rv-sub">Follow-up</small></>}</td>
                  <td>{x.assignee ?? x.assignedTo}</td>
                  <td>{x.priority}</td>
                  <td className="u-nowrap">{x.dueDate ? fmtDay(x.dueDate) : '—'}</td>
                  <td><Badge tone={ACTION_TONE[x.status] ?? 'neutral'}>{x.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="u-muted in-tabpanel-empty">No O&amp;M tasks or action items on this inspection or its follow-ups.</p>}
    </section>
  )
}
