import { useState } from 'react'
import { TRENDS, TREND_ORDER, CONDITIONS, LEVEL_LABEL, fmtMonth } from './trendsMeta'

// Legend for a set of { key, label, color } — always shown with the bars, so identity isn't colour alone
function Legend({ items }) {
  return (
    <ul className="tr-legend">
      {items.map((x) => <li key={x.key}><i style={{ background: x.color }} />{x.label}</li>)}
    </ul>
  )
}

/**
 * Locations (schools at district level, then buildings, floors, rooms or ACMs as you drill down) as horizontal
 * stacked bars of ACM trends, worst first. Clicking a bar drills into it.
 */
export function LocationChart({ data, onDrill }) {
  const [hover, setHover] = useState(null)
  const keys = TREND_ORDER.filter((k) => k !== 'baseline')
  const max = Math.max(1, ...data.items.map((g) => keys.reduce((n, k) => n + g[k], 0)))
  return (
    <div className="tr-chart">
      <Legend items={keys.map((k) => ({ key: k, label: TRENDS[k].label, color: TRENDS[k].color }))} />
      {!data.items.length && <p className="tr-empty">No assessed ACMs for these filters.</p>}
      <ul className="tr-hbars">
        {data.items.map((g) => {
          const shown = keys.reduce((n, k) => n + g[k], 0)
          const worse = g.significant + g.deteriorating
          return (
            <li key={g.id}>
              <button type="button" className="tr-hbar-row" onClick={() => onDrill(g)} onMouseEnter={() => setHover(g.id)} onMouseLeave={() => setHover(null)}
                disabled={data.level === 'acm' && !onDrill} aria-label={`${g.name}: ${worse} deteriorating of ${g.total} ACMs. ${data.level === 'acm' ? 'Open timeline' : 'Drill down'}`}>
                <span className="tr-hbar-name" title={g.name}>{g.name}<small>{g.total} ACM{g.total === 1 ? '' : 's'}</small></span>
                <span className="tr-hbar-track">
                  <span className="tr-hbar-fill" style={{ width: `${(shown / max) * 100}%` }}>
                    {keys.map((k) => g[k] > 0 && <i key={k} style={{ flexGrow: g[k], background: TRENDS[k].color }} />)}
                  </span>
                </span>
                <span className={`tr-hbar-val${worse ? ' bad' : ''}`}>{worse}</span>
              </button>
              {hover === g.id && (
                <div className="tr-tip" role="status">
                  <strong>{g.name}</strong>
                  {TREND_ORDER.map((k) => <span key={k}><i style={{ background: TRENDS[k].color }} />{TRENDS[k].label}: <b>{g[k]}</b></span>)}
                  <em>{data.level === 'acm' ? 'Click to open its timeline' : `Click to drill into this ${LEVEL_LABEL[data.level].toLowerCase()}`}</em>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Material types as 100% bars of their ACMs' current condition
export function MaterialChart({ data }) {
  const [hover, setHover] = useState(null)
  const keys = Object.keys(CONDITIONS)
  return (
    <div className="tr-chart">
      <Legend items={keys.map((k) => ({ key: k, label: k, color: CONDITIONS[k].color }))} />
      {!data.length && <p className="tr-empty">No assessed ACMs for these filters.</p>}
      <ul className="tr-hbars">
        {data.map((g) => (
          <li key={g.name} onMouseEnter={() => setHover(g.name)} onMouseLeave={() => setHover(null)}>
            <div className="tr-hbar-row static">
              <span className="tr-hbar-name" title={g.name}>{g.name}<small>{g.total} ACM{g.total === 1 ? '' : 's'}</small></span>
              <span className="tr-hbar-track">
                <span className="tr-hbar-fill full">
                  {keys.map((k) => g[k] > 0 && <i key={k} style={{ flexGrow: g[k], background: CONDITIONS[k].color }} />)}
                </span>
              </span>
              <span className="tr-hbar-val">{Math.round((g.Good / g.total) * 100)}%<small>good</small></span>
            </div>
            {hover === g.name && (
              <div className="tr-tip" role="status">
                <strong>{g.name}</strong>
                {keys.map((k) => <span key={k}><i style={{ background: CONDITIONS[k].color }} />{k}: <b>{g[k]}</b> ({Math.round((g[k] / g.total) * 100)}%)</span>)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Deteriorations and improvements recorded per month (changes between consecutive assessments), as two lines
export function MonthlyChart({ data }) {
  const [hover, setHover] = useState(null)
  const W = 640
  const H = 220
  const pad = { l: 34, r: 12, t: 12, b: 28 }
  const series = [
    { key: 'deteriorated', label: 'Deteriorated', color: TRENDS.significant.color },
    { key: 'improved', label: 'Improved', color: TRENDS.improved.color },
  ]
  if (!data.length) return <div className="tr-chart"><p className="tr-empty">No repeat assessments in this period.</p></div>
  const max = Math.max(4, ...data.flatMap((m) => series.map((s) => m[s.key])))
  const step = Math.ceil(max / 4)
  const top = step * 4
  const x = (i) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r))
  const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b)
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step)
  return (
    <div className="tr-chart">
      <Legend items={series} />
      <div className="tr-line-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="tr-line" role="img"
          aria-label={`Changes per month: ${data.map((m) => `${fmtMonth(m.month)} ${m.deteriorated} deteriorated, ${m.improved} improved`).join('; ')}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'tr-axis' : 'tr-grid'} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tr-tick">{t}</text>
            </g>
          ))}
          {data.map((m, i) => i % Math.ceil(data.length / 9) === 0 && (
            <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" className="tr-tick">{fmtMonth(m.month)}</text>
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="tr-cross" />}
          {series.map((s) => (
            <g key={s.key}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={data.map((m, i) => `${x(i)},${y(m[s.key])}`).join(' ')} />
              {data.map((m, i) => <circle key={m.month} cx={x(i)} cy={y(m[s.key])} r={hover === i ? 5 : 3.5} fill={s.color} stroke="#fff" strokeWidth="2" />)}
            </g>
          ))}
          {/* Hover targets: a full-height band per month */}
          {data.map((m, i) => (
            <rect key={m.month} x={x(i) - (W - pad.l - pad.r) / data.length / 2} y={pad.t} width={(W - pad.l - pad.r) / data.length} height={H - pad.t - pad.b}
              fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover != null && (
          <div className="tr-tip tr-tip-line" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
            <strong>{fmtMonth(data[hover].month)}</strong>
            {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{data[hover][s.key]}</b></span>)}
            <span>Repeat assessments: <b>{data[hover].assessed}</b></span>
          </div>
        )}
      </div>
    </div>
  )
}
