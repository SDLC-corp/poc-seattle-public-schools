import { useState } from 'react'

const W = 560
const H = 210
const PAD = { top: 14, right: 12, bottom: 26, left: 44 }

// Monthly PCM results (f/cc): bars = average, lines = min / max, dashed line = action level.
// One y-axis only (everything is f/cc). Hover a month for exact values.
export default function AirTrendChart({ months, actionLevel }) {
  const [hover, setHover] = useState(null)
  if (!months?.length) return <p className="u-muted u-small air-empty">No PCM area/clearance results for these filters.</p>

  const top = Math.max(actionLevel * 1.5, ...months.map((m) => m.max)) * 1.1
  const step = top > 0.04 ? 0.01 : 0.005
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => +(i * step).toFixed(3))
  const yMax = ticks[ticks.length - 1] + (top > ticks[ticks.length - 1] ? step : 0)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (innerW / months.length) * (i + 0.5)
  const y = (v) => PAD.top + innerH - (v / yMax) * innerH
  const band = innerW / months.length
  const barW = Math.min(28, band * 0.4)
  const line = (key) => months.map((m, i) => `${i ? 'L' : 'M'}${x(i)},${y(m[key])}`).join(' ')
  const label = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })

  return (
    <div className="air-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly air monitoring results in fibers per cc, with action level">
        {[...ticks, yMax].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="air-grid" />
            <text x={PAD.left - 6} y={y(t) + 3} className="air-tick" textAnchor="end">{t.toFixed(3)}</text>
          </g>
        ))}
        <text x={10} y={PAD.top + innerH / 2} className="air-axis" transform={`rotate(-90 10 ${PAD.top + innerH / 2})`} textAnchor="middle">Fiber count (f/cc)</text>

        {months.map((m, i) => (
          <rect key={m.month} x={x(i) - barW / 2} y={y(m.avg)} width={barW} height={Math.max(1, PAD.top + innerH - y(m.avg))}
            rx={3} className={`air-bar${hover === i ? ' hover' : ''}`} />
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(actionLevel)} y2={y(actionLevel)} className="air-action" />
        <path d={line('max')} className="air-line max" />
        <path d={line('min')} className="air-line min" />
        {months.map((m, i) => (
          <g key={`pts${m.month}`}>
            <circle cx={x(i)} cy={y(m.max)} r={4} className="air-pt max" />
            <circle cx={x(i)} cy={y(m.min)} r={4} className="air-pt min" />
            <text x={x(i)} y={H - 8} className="air-tick" textAnchor="middle">{label(m.month)}</text>
            {/* Wide invisible hit area per month for the tooltip */}
            <rect x={x(i) - band / 2} y={PAD.top} width={band} height={innerH} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="air-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{new Date(`${months[hover].month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <span>Average {months[hover].avg.toFixed(4)} f/cc</span>
          <span>Min {months[hover].min} · Max {months[hover].max}</span>
          <span>{months[hover].count} sample{months[hover].count === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  )
}
