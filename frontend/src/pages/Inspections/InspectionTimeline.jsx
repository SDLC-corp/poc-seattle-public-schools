import { useState } from 'react'
import { Link } from 'react-router'
import { History, ChevronDown, FileText, User, StickyNote } from 'lucide-react'
import { fmtDay } from '../Surveillance/survMeta'
import { fmtDateTime, API_BASE } from '../../lib/api'

const STAGE_STATUS_TEXT = { COMPLETED: 'Completed', IN_PROGRESS: 'In progress', PENDING: 'Pending', SKIPPED: 'Skipped', NOT_REQUIRED: 'Not required' }
const when = (at) => (!at ? null : String(at).length > 10 ? fmtDateTime(at) : fmtDay(at))

/**
 * What happened in each stage that was worked on: who did what and when, notes and documents.
 * Stages that don't apply are listed as Not required / Skipped with the reason (they're hidden from the stepper).
 */
export default function InspectionTimeline({ timeline }) {
  const [open, setOpen] = useState(true)
  if (!timeline?.length) return null
  const events = timeline.reduce((n, s) => n + s.events.filter((e) => e.kind !== 'stage').length, 0)
  return (
    <section className="u-card in-tl" aria-label="Inspection timeline">
      <header className="in-tl-head">
        <h2><History size={17} />Inspection Timeline</h2>
        <button type="button" className="sv-link-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : `Show (${events} events)`}<ChevronDown size={14} className={open ? 'in-tl-flip' : undefined} />
        </button>
      </header>
      {open && (
        <ol className="in-tl-stages">
          {timeline.map((s) => {
            const idle = s.status === 'notRequired' || s.status === 'skipped'
            return (
              <li key={s.id} className={`in-tl-stage ${s.status}`}>
                <div className="in-tl-stage-head">
                  <span className="in-tl-marker" aria-hidden="true" />
                  <strong>{s.label}</strong>
                  <span className={`in-tl-chip ${s.stageStatus}`}>{STAGE_STATUS_TEXT[s.stageStatus]}</span>
                  {idle && s.reason && <span className="u-muted in-tl-reason">{s.reason}</span>}
                </div>
                {!idle && (
                  <ul className="in-tl-events">
                    {s.events.map((e, i) => (
                      <li key={i} className={`in-tl-event ${e.kind}${e.tone ? ` tone-${e.tone}` : ''}`}>
                        <div className="in-tl-event-top">
                          <span className="in-tl-title">{e.title}</span>
                          {e.at && <time className="in-tl-when">{when(e.at)}{e.estimated ? ' (from record)' : ''}</time>}
                        </div>
                        {(e.by || e.detail) && (
                          <div className="in-tl-meta">
                            {e.by && <span className="in-tl-by"><User size={12} />{e.by}</span>}
                            {e.detail && <span>{e.detail}</span>}
                          </div>
                        )}
                        {e.notes && <p className="in-tl-notes"><StickyNote size={12} />{e.notes}</p>}
                        {(e.docs?.length > 0 || e.link) && (
                          <div className="in-tl-links">
                            {e.docs?.map((d) => (
                              <a key={d.href} href={`${API_BASE}${d.href}`} target="_blank" rel="noreferrer"><FileText size={12} />{d.name}</a>
                            ))}
                            {e.link && <Link to={e.link}>{e.linkLabel ?? 'Open inspection'}</Link>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
