import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { X, History, ArrowDownRight, ArrowUpRight, ArrowRight, MapPin, Layers, ImageOff, User } from 'lucide-react'
import { request, API_BASE } from '../../lib/api'
import { floorLink } from '../Surveillance/survMeta'
import { TRENDS, CONDITIONS, fmtDay } from './trendsMeta'
import '../LabSamples/labSamples.css' // the right-side panel (.lr-drawer)

const CHANGE = {
  1: { icon: ArrowDownRight, text: 'Deteriorated', cls: 'worse' },
  0: { icon: ArrowRight, text: 'No change', cls: 'same' },
  '-1': { icon: ArrowUpRight, text: 'Improved', cls: 'better' },
}

// Condition over time as a step line on the three AHERA levels
function ConditionSteps({ entries }) {
  const W = 560
  const H = 120
  const pad = { l: 128, r: 14, t: 12, b: 24 }
  const levels = Object.keys(CONDITIONS)
  const t0 = Date.parse(entries[0].date)
  const t1 = Date.parse(entries.at(-1).date)
  const x = (d) => pad.l + (t1 === t0 ? (W - pad.l - pad.r) / 2 : ((Date.parse(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r))
  const y = (c) => pad.t + (CONDITIONS[c].rank / 2) * (H - pad.t - pad.b)
  const pts = entries.flatMap((e, i) => (i === 0 ? [[x(e.date), y(e.condition)]] : [[x(e.date), y(entries[i - 1].condition)], [x(e.date), y(e.condition)]]))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tr-steps" role="img" aria-label={`Condition history: ${entries.map((e) => `${fmtDay(e.date)} ${e.condition}`).join(', ')}`}>
      {levels.map((c) => (
        <g key={c}>
          <line x1={pad.l} x2={W - pad.r} y1={y(c)} y2={y(c)} className="tr-grid" />
          <text x={pad.l - 8} y={y(c) + 4} textAnchor="end" className="tr-tick">{c}</text>
        </g>
      ))}
      <polyline fill="none" stroke="#5b6b7b" strokeWidth="2" points={pts.map((p) => p.join(',')).join(' ')} />
      {entries.map((e, i) => <circle key={i} cx={x(e.date)} cy={y(e.condition)} r="5" fill={CONDITIONS[e.condition].color} stroke="#fff" strokeWidth="2"><title>{`${fmtDay(e.date)} · ${e.condition} · ${e.type}`}</title></circle>)}
      <text x={pad.l} y={H - 6} className="tr-tick">{fmtDay(entries[0].date)}</text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" className="tr-tick">{fmtDay(entries.at(-1).date)}</text>
    </svg>
  )
}

/** Right-side panel: one ACM's condition history across its assessments, newest first, with photos. */
export default function AcmTimelineDrawer({ acmId, onClose }) {
  const [t, setT] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    request(`/trends/acm/${encodeURIComponent(acmId)}`).then((d) => { if (!cancelled) setT(d) }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [acmId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const photos = (t?.entries ?? []).flatMap((e) => e.photos.map((p) => ({ ...p, date: e.date, condition: e.condition })))
  const before = photos[0]
  const after = photos.length > 1 ? photos.at(-1) : null
  const tr = t && TRENDS[t.trend]

  return (
    <div className="lr-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="lr-drawer tr-drawer" role="dialog" aria-modal="true" aria-labelledby="tr-tl-title">
        <header className="u-modal-head lr-drawer-head">
          <h2 id="tr-tl-title"><History size={18} />ACM Condition Timeline</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body lr-drawer-body">
          {error && <p className="uf-error">{error}</p>}
          {!t && !error && <p className="u-muted">Loading…</p>}
          {t && (
            <>
              <div className="tr-tl-head">
                <div>
                  <strong className="a-mono">{t.acmId}</strong>
                  <span>{t.material} · {t.materialType}</span>
                  <small>{[t.school, t.building, t.floor, t.room].filter(Boolean).join(' · ')}</small>
                </div>
                <span className={`tr-badge ${t.trend}`} style={{ '--c': tr.color }}>{tr.label}</span>
              </div>
              <div className="tr-tl-links">
                <Link to={floorLink(t)} className="u-btn u-btn-outline u-btn-sm"><MapPin size={13} />Room on floor plan</Link>
                <Link to="/acm" className="u-btn u-btn-outline u-btn-sm"><Layers size={13} />ACM Inventory</Link>
              </div>

              {t.entries.length > 0 && (
                <section className="tr-tl-sec">
                  <h3>Condition over time</h3>
                  <ConditionSteps entries={t.entries} />
                </section>
              )}

              <section className="tr-tl-sec">
                <h3>Before &amp; after</h3>
                {photos.length ? (
                  <div className="tr-photos">
                    {[before, after].filter(Boolean).map((p, i) => (
                      <figure key={p.href}>
                        <a href={`${API_BASE}${p.href}`} target="_blank" rel="noreferrer"><img src={`${API_BASE}${p.href}`} alt={`${i ? 'Latest' : 'Earliest'} photo, ${fmtDay(p.date)}`} /></a>
                        <figcaption>{i ? 'Latest' : 'Earliest'} · {fmtDay(p.date)} · {p.condition}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : <p className="tr-nophoto"><ImageOff size={14} />No photographs were recorded with this ACM's assessments.</p>}
              </section>

              <section className="tr-tl-sec">
                <h3>Assessments ({t.entries.length}) <small>newest first</small></h3>
                <ol className="tr-tl-list">
                  {[...t.entries].reverse().map((e, i) => {
                    const ch = e.change == null ? null : CHANGE[e.change]
                    return (
                      <li key={`${e.date}-${i}`}>
                        <span className="tr-tl-dot" style={{ background: CONDITIONS[e.condition].color }} aria-hidden="true" />
                        <div className="tr-tl-row">
                          <strong>{fmtDay(e.date)}</strong>
                          <span className="tr-cond" style={{ '--c': CONDITIONS[e.condition].color }}>{e.condition}</span>
                          {ch ? <span className={`tr-change ${ch.cls}`}><ch.icon size={13} />{ch.text}</span> : <span className="tr-change same">First assessment</span>}
                        </div>
                        <small className="tr-tl-meta">
                          {e.link ? <Link to={e.link}>{e.type}{e.recordId ? ` · ${e.recordId}` : ''}</Link> : e.type}
                          {e.inspector && <> · <User size={11} /> {e.inspector}</>}
                        </small>
                        {e.observations && <p className="tr-tl-obs">{e.observations}</p>}
                      </li>
                    )
                  })}
                </ol>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
