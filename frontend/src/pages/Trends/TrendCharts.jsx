import { useCallback, useEffect, useState } from 'react'
import { CONDITIONS, CONDITION_VIEW, CONDITION_KEYS } from './trendsMeta'

// Charts for the deterioration overview: conditions over time, the current split, and the split per material type.
// Each shows a legend, so condition is never told by colour alone.

const pct = (n, total) => (total ? (n / total) * 100 : 0)
const fmtPct = (v) => `${v.toFixed(1)}%`
const niceTop = (max) => {
  const raw = Math.max(4, max) / 5
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  return { step, top: step * 5 }
}

// Width of a chart's box, so the SVG is drawn at its real size and text stays readable
function useWidth(fallback = 640) {
  const [el, setEl] = useState(null)
  const [w, setW] = useState(fallback)
  const ref = useCallback((node) => setEl(node), [])
  useEffect(() => {
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => { const cw = Math.round(e.contentRect.width); if (cw > 0) setW(cw) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [ref, Math.max(w, 280)]
}

export function Legend({ counts }) {
  return (
    <ul className="tr-legend">
      {CONDITION_KEYS.map((k) => <li key={k}><i style={{ background: CONDITIONS[k].color }} />{CONDITION_VIEW[k].label}{counts && <b>{counts[k].toLocaleString()}</b>}</li>)}
    </ul>
  )
}

/** ACMs in each condition at the end of every month (lines with a light area), with a hover crosshair. */
export function ConditionLine({ series, height = 260 }) {
  const [hover, setHover] = useState(null)
  const [ref, W] = useWidth()
  const H = height
  const pad = { l: 62, r: 18, t: 14, b: 40 }
  const { step, top } = niceTop(Math.max(...series.flatMap((m) => CONDITION_KEYS.map((k) => m[k]))))
  const ticks = Array.from({ length: 6 }, (_, i) => i * step)
  const x = (i) => pad.l + (series.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (series.length - 1)) * (W - pad.l - pad.r))
  const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b)
  const every = Math.ceil(series.length / Math.max(2, Math.floor((W - pad.l) / 52)))
  const label = (ym) => new Date(`${ym}-01T00:00:00`)
  return (
    <div className="tr-chart">
      <div className="tr-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`ACMs by condition per month: ${series.map((m) => `${m.month} ${CONDITION_KEYS.map((k) => `${CONDITION_VIEW[k].short} ${m[k]}`).join(', ')}`).join('; ')}`}>
          <text transform={`translate(14 ${(pad.t + H - pad.b) / 2}) rotate(-90)`} textAnchor="middle" className="tr-ytitle">No. of ACMs</text>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'tr-axis' : 'tr-grid'} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tr-tick">{t.toLocaleString()}</text>
            </g>
          ))}
          {series.map((m, i) => i % every === 0 && (
            <text key={m.month} x={x(i)} y={H - 22} textAnchor="middle" className="tr-tick">
              {label(m.month).toLocaleDateString('en-US', { month: 'short' })}
              <tspan x={x(i)} dy="13" className="tr-tick-sub">{label(m.month).getFullYear()}</tspan>
            </text>
          ))}
          {CONDITION_KEYS.map((k) => (
            <polygon key={`a-${k}`} points={`${x(0)},${y(0)} ${series.map((m, i) => `${x(i)},${y(m[k])}`).join(' ')} ${x(series.length - 1)},${y(0)}`} fill={CONDITIONS[k].color} opacity="0.1" />
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="tr-cross" />}
          {CONDITION_KEYS.map((k) => (
            <g key={k}>
              <polyline fill="none" stroke={CONDITIONS[k].color} strokeWidth="2.5" strokeLinejoin="round" points={series.map((m, i) => `${x(i)},${y(m[k])}`).join(' ')} />
              {series.map((m, i) => <circle key={m.month} cx={x(i)} cy={y(m[k])} r={hover === i ? 5.5 : 4} fill={CONDITIONS[k].color} stroke="#fff" strokeWidth="1.5" />)}
            </g>
          ))}
          {series.map((m, i) => (
            <rect key={m.month} x={x(i) - (W - pad.l - pad.r) / series.length / 2} y={pad.t} width={(W - pad.l - pad.r) / series.length} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover != null && (
          <div className="tr-tip tr-tip-line" style={{ left: Math.min(x(hover), W - 220) }} role="status">
            <strong>{label(series[hover].month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
            {CONDITION_KEYS.map((k) => <span key={k}><i style={{ background: CONDITIONS[k].color }} />{CONDITION_VIEW[k].label}: <b>{series[hover][k]}</b> ({fmtPct(pct(series[hover][k], series[hover].total))})</span>)}
            <span>Assessed ACMs: <b>{series[hover].total}</b></span>
          </div>
        )}
      </div>
      <Legend />
    </div>
  )
}

/** The current split as a donut with each share on its segment and the total in the middle. */
export function ConditionDonut({ kpis }) {
  const [hover, setHover] = useState(null)
  const R = 80
  const C = 2 * Math.PI * R
  let off = 0
  let angle = -90
  return (
    <div className="tr-donut">
      <div className="tr-donut-fig">
        <svg viewBox="0 0 220 220" role="img" aria-label={CONDITION_KEYS.map((k) => `${CONDITION_VIEW[k].label} ${kpis[k]} (${fmtPct(pct(kpis[k], kpis.total))})`).join(', ')}>
          <g transform="rotate(-90 110 110)">
            {CONDITION_KEYS.map((k) => {
              const len = (pct(kpis[k], kpis.total) / 100) * C
              const el = <circle key={k} cx="110" cy="110" r={R} fill="none" stroke={CONDITIONS[k].color} strokeWidth={hover === k ? 44 : 38}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} />
              off += len
              return el
            })}
          </g>
          {CONDITION_KEYS.map((k) => {
            const share = pct(kpis[k], kpis.total)
            const mid = angle + (share / 100) * 180
            angle += (share / 100) * 360
            if (share < 6) return null
            const rad = (mid * Math.PI) / 180
            return <text key={k} x={110 + R * Math.cos(rad)} y={110 + R * Math.sin(rad) + 4} textAnchor="middle" className="tr-donut-pct">{fmtPct(share)}</text>
          })}
        </svg>
        <div className="tr-donut-center">
          <strong>{(hover ? kpis[hover] : kpis.total).toLocaleString()}</strong>
          <span>{hover ? CONDITION_VIEW[hover].label : 'ACMs'}</span>
        </div>
      </div>
      <ul className="tr-donut-legend">
        {CONDITION_KEYS.map((k) => (
          <li key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} className={hover === k ? 'on' : undefined}>
            <i style={{ background: CONDITIONS[k].color }} /><span>{CONDITION_VIEW[k].label}<small>{k}</small></span><b>{kpis[k].toLocaleString()}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Each material type as a 100% bar of its ACMs' current condition, shares written on the segments. */
export function MaterialStack({ items }) {
  if (!items.length) return <p className="tr-empty">No assessed ACMs for these filters.</p>
  return (
    <div className="tr-chart">
      <ul className="tr-mstack">
        {items.map((g) => (
          <li key={g.name}>
            <span className="tr-mstack-name" title={`${g.name} · ${g.total} ACMs`}>{g.name}<small>{g.total} ACM{g.total === 1 ? '' : 's'}</small></span>
            <span className="tr-mstack-bar">
              {CONDITION_KEYS.map((k) => g[k] > 0 && (
                <i key={k} style={{ flexGrow: g[k], background: CONDITIONS[k].color }} title={`${CONDITION_VIEW[k].label}: ${g[k]} (${fmtPct(pct(g[k], g.total))})`}>
                  {pct(g[k], g.total) >= 9 && `${Math.round(pct(g[k], g.total))}%`}
                </i>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="tr-mstack-axis" aria-hidden="true"><span /><span className="tr-mstack-ticks">{[0, 20, 40, 60, 80, 100].map((t) => <span key={t}>{t}%</span>)}</span></div>
      <Legend />
    </div>
  )
}
