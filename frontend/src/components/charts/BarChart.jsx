import { useState } from 'react'
import './charts.css'

function niceMax(v) {
  const step = 10 ** Math.floor(Math.log10(v || 1))
  return Math.ceil(v / step) * step
}

// data: [{ label, sublabel?, value, color }]
export default function BarChart({ data, ticks = 4, ariaLabel }) {
  const [hover, setHover] = useState(null)
  // 0 floor: with no data yet Math.max() is -Infinity, which made every tick NaN (and their keys collide)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const total = data.reduce((s, d) => s + d.value, 0)
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.round((max / ticks) * i))

  return (
    <div className="bar-chart" role="img" aria-label={ariaLabel}>
      <div className="bar-plot">
        <div className="bar-axis">
          {tickValues.map((t, i) => (
            <span key={i} style={{ bottom: `${(t / max) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className="bar-area">
          {tickValues.map((t, i) => (
            <div key={i} className={`bar-grid${t === 0 ? ' base' : ''}`} style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          {data.map((d, i) => (
            <div
              key={d.label}
              className="bar-slot"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="bar" style={{ height: `${(d.value / max) * 100}%`, background: d.color, opacity: hover == null || hover === i ? 1 : 0.4 }}>
                <span className="bar-value">{d.value}</span>
              </div>
              {hover === i && (
                <div className="chart-tooltip" style={{ bottom: `calc(${(d.value / max) * 100}% + 26px)` }}>
                  <strong>{d.label}</strong>
                  <span>{d.value} inspections · {Math.round((d.value / total) * 100)}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bar-labels">
        {data.map((d) => (
          <span key={d.label}>
            {d.label}
            {d.sublabel && <small>{d.sublabel}</small>}
          </span>
        ))}
      </div>
    </div>
  )
}
