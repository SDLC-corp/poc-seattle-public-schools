import { useState } from 'react'
import './charts.css'

const SIZE = 180
const STROKE = 30
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R
const GAP = 2 // surface gap between segments, in px of arc length

// data: [{ label, value, color }]
export default function DonutChart({ data, centerValue, centerLabel, showCounts = false, ariaLabel }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0)

  const segments = data.reduce((acc, d) => {
    const len = total ? (d.value / total) * C : 0
    const prev = acc[acc.length - 1]
    const offset = prev ? prev.offset + prev.len : 0
    return [...acc, { ...d, len, offset }]
  }, [])

  const active = hover != null ? data[hover] : null

  return (
    <div className="donut">
      <div className="donut-figure">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((s, i) => (
              <circle
                key={s.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? STROKE + 6 : STROKE}
                strokeDasharray={`${Math.max(s.len - GAP, 0)} ${C - Math.max(s.len - GAP, 0)}`}
                strokeDashoffset={-s.offset}
                opacity={hover == null || hover === i ? 1 : 0.35}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'opacity .15s, stroke-width .15s', cursor: 'default' }}
              >
                <title>{`${s.label}: ${s.value.toLocaleString('en-US')} (${pct(s.value)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="donut-center" aria-hidden="true">
          <strong>{active ? active.value.toLocaleString('en-US') : centerValue}</strong>
          <span>{active ? active.label : centerLabel}</span>
        </div>
      </div>

      <ul className="chart-legend">
        {data.map((d, i) => (
          <li
            key={d.label}
            className={hover === i ? 'active' : ''}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="legend-swatch" style={{ background: d.color }} />
            <span className="legend-label" title={d.label}>{d.label}</span>
            <span className="legend-value">
              {showCounts ? <><strong>{d.value}</strong> ({pct(d.value)}%)</> : `${pct(d.value)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
