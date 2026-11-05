import { useCallback, useEffect, useState } from 'react'
import { usd } from './costUtils'

// Small SVG charts for the Cost Intelligence demo: one y-axis each, legends always shown, hover details.

// Width of the plot area, so charts draw at their real size and text stays readable in narrow cards
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

const niceStep = (max, n = 4) => {
  const raw = max / n
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return step
}

export function Legend({ items }) {
  return (
    <ul className="ci-legend">
      {items.map((x) => (
        <li key={x.key ?? x.label}><i className={x.dot ? 'dot' : x.dashed ? 'dashed' : ''} style={{ '--c': x.color }} />{x.label}</li>
      ))}
    </ul>
  )
}

// An x label; "\n" starts a second, smaller line
function XLabel({ x, y, text }) {
  const [a, b] = String(text).split('\n')
  return (
    <text x={x} y={y} textAnchor="middle" className="ci-tick">
      {a}{b && <tspan x={x} dy="13" className="ci-tick-sub">{b}</tspan>}
    </text>
  )
}

const YTitle = ({ text, pad, H }) => (text
  ? <text transform={`translate(14 ${(pad.t + H - pad.b) / 2}) rotate(-90)`} textAnchor="middle" className="ci-ytitle">{text}</text>
  : null)

/**
 * Lines over shared x labels. series: [{ key, label, color, values: (number|null)[], dashed?, area?, dot?, labels? }]
 * A null value leaves a gap, so actual and forecast series can meet at the current year. labels: show each value
 * above its point (labelFormat); dot: points only (e.g. a single baseline value). yTitle: rotated axis title;
 * minY: start the axis above zero (unit rates).
 */
export function LineChart({ x: xIn, series, height = 240, format = (v) => usd(v, { compact: true }), labelFormat, markers = true, yTitle, minY }) {
  const [hover, setHover] = useState(null)
  const lf = labelFormat ?? format
  const [ref, W] = useWidth()
  const H = height
  // The second x-label line ("(Forecast)") only when the points are far enough apart for it
  const roomy = (W - 90) / Math.max(1, xIn.length - 1) >= 64
  const x = roomy ? xIn : xIn.map((l) => String(l).split('\n')[0])
  const twoLine = x.some((l) => String(l).includes('\n'))
  const pad = { l: yTitle ? 66 : 52, r: 22, t: series.some((s) => s.labels) ? 28 : 16, b: twoLine ? 44 : 30 }
  const all = series.flatMap((s) => s.values.filter((v) => v != null))
  const bottom = minY ?? 0
  const step = niceStep(Math.max(...all, 1) - bottom)
  const top = bottom + Math.ceil((Math.max(...all, 1) - bottom) / step) * step
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, i) => bottom + i * step)
  const xs = (i) => pad.l + (x.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (x.length - 1)) * (W - pad.l - pad.r))
  const ys = (v) => pad.t + (1 - (v - bottom) / (top - bottom)) * (H - pad.t - pad.b)
  const path = (vals) => vals.map((v, i) => (v == null ? null : `${xs(i)},${ys(v)}`)).filter(Boolean).join(' ')
  return (
    <div className="ci-chart">
      <div className="ci-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={series.map((s) => `${s.label}: ${s.values.map((v, i) => (v == null ? null : `${String(x[i]).replace('\n', ' ')} ${lf(v)}`)).filter(Boolean).join(', ')}`).join('; ')}>
          <YTitle text={yTitle} pad={pad} H={H} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} className={t === bottom ? 'ci-axis' : 'ci-grid'} />
              <text x={pad.l - 8} y={ys(t) + 4} textAnchor="end" className="ci-tick">{format(t)}</text>
            </g>
          ))}
          {x.map((l, i) => <XLabel key={`x-${i}`} x={xs(i)} y={H - (twoLine ? 24 : 8)} text={l} />)}
          {series.filter((s) => s.area).map((s) => {
            const idx = s.values.map((v, i) => (v == null ? null : i)).filter((i) => i != null)
            if (idx.length < 2) return null
            return <polygon key={`a-${s.key}`} points={`${xs(idx[0])},${ys(bottom)} ${path(s.values)} ${xs(idx.at(-1))},${ys(bottom)}`} fill={s.color} opacity="0.12" />
          })}
          {hover != null && <line x1={xs(hover)} x2={xs(hover)} y1={pad.t} y2={H - pad.b} className="ci-cross" />}
          {series.map((s) => (
            <g key={s.key}>
              {!s.dot && <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" points={path(s.values)} />}
              {(markers || s.dot) && s.values.map((v, i) => v != null && (
                <circle key={i} cx={xs(i)} cy={ys(v)} r={hover === i || s.dot ? 6 : 4.5} fill={s.dashed ? '#fff' : s.color} stroke={s.color} strokeWidth="2.5" />
              ))}
              {s.labels && s.values.map((v, i) => v != null && !s.labelSkip?.includes(i) && <text key={`l-${i}`} x={xs(i)} y={ys(v) - 12} textAnchor={i === 0 ? 'start' : i === s.values.length - 1 ? 'end' : 'middle'} dx={i === 0 ? -4 : i === s.values.length - 1 ? 4 : 0} className="ci-pt-label">{lf(v)}</text>)}
            </g>
          ))}
          {x.map((l, i) => (
            <rect key={`h-${i}`} x={xs(i) - (W - pad.l - pad.r) / x.length / 2} y={pad.t} width={(W - pad.l - pad.r) / x.length} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover != null && (
          <div className="ci-tip" style={{ left: `${(xs(hover) / W) * 100}%` }}>
            <strong>{String(x[hover]).replace('\n', ' ')}</strong>
            {series.map((s) => s.values[hover] != null && <span key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{labelFormat ? lf(s.values[hover]) : usd(s.values[hover])}</b></span>)}
          </div>
        )}
      </div>
      <Legend items={series} />
    </div>
  )
}

/**
 * Stacked columns. stacks: [{ key, label, color, values: number[] }] (one value per x label). Totals above each column.
 * segmentLabels: the value inside each segment tall enough to hold it; xSub: a second line under each x label;
 * legendRight: the legend beside the chart, top segment first.
 */
export function StackedColumns({ x, stacks, height = 240, onSelect, segmentLabels = false, xSub, yTitle, legendRight = false }) {
  const [hover, setHover] = useState(null)
  const [ref, W] = useWidth()
  const H = height
  const pad = { l: yTitle ? 66 : 52, r: 16, t: 22, b: xSub ? 44 : 30 }
  const totals = x.map((_, i) => stacks.reduce((n, s) => n + s.values[i], 0))
  const step = niceStep(Math.max(...totals, 1))
  const top = Math.ceil(Math.max(...totals, 1) / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const band = (W - pad.l - pad.r) / x.length
  const bw = Math.min(segmentLabels ? 120 : 64, band * (segmentLabels ? 0.62 : 0.55))
  const ys = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b)
  return (
    <div className={`ci-chart${legendRight ? ' ci-chart-side' : ''}`}>
      <div className="ci-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={x.map((l, i) => `${l}: ${usd(totals[i])}`).join(', ')}>
          <YTitle text={yTitle} pad={pad} H={H} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={ys(t)} y2={ys(t)} className={t === 0 ? 'ci-axis' : 'ci-grid'} />
              <text x={pad.l - 8} y={ys(t) + 4} textAnchor="end" className="ci-tick">{usd(t, { compact: true })}</text>
            </g>
          ))}
          {x.map((l, i) => {
            const cx = pad.l + band * i + band / 2
            let acc = 0
            return (
              <g key={l} onMouseEnter={() => setHover(i)} onClick={onSelect ? () => onSelect(i) : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }} opacity={hover == null || hover === i ? 1 : 0.55}>
                <rect x={cx - band / 2} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
                {stacks.map((s) => {
                  const v = s.values[i]
                  if (!v) return null
                  const y0 = ys(acc)
                  acc += v
                  const y1 = ys(acc)
                  return (
                    <g key={s.key}>
                      <rect x={cx - bw / 2} y={y1 + 1} width={bw} height={Math.max(0, y0 - y1 - 2)} rx="2" fill={s.color} />
                      {segmentLabels && y0 - y1 >= 15 && <text x={cx} y={(y0 + y1) / 2 + 4} textAnchor="middle" className="ci-seg-label">{usd(v, { compact: true })}</text>}
                    </g>
                  )
                })}
                <text x={cx} y={ys(totals[i]) - 6} textAnchor="middle" className="ci-total">{usd(totals[i], { compact: true })}</text>
                <XLabel x={cx} y={H - (xSub ? 24 : 8)} text={xSub ? `${l}\n${xSub[i]}` : l} />
              </g>
            )
          })}
        </svg>
        {hover != null && (
          <div className="ci-tip" style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%` }}>
            <strong>{x[hover]} · {usd(totals[hover])}</strong>
            {[...stacks].reverse().map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}: <b>{usd(s.values[hover])}</b></span>)}
          </div>
        )}
      </div>
      <Legend items={legendRight ? [...stacks].reverse() : stacks} />
    </div>
  )
}

/** Horizontal bars, largest first. items: [{ key, label, sub?, value, color? }] */
export function HBars({ items, color = '#2a78d6', onSelect, max: maxIn, format = (v) => usd(v, { compact: true }) }) {
  const max = maxIn ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="ci-hbars">
      {items.map((it) => {
        const Row = onSelect ? 'button' : 'div'
        return (
          <li key={it.key ?? it.label}>
            <Row type={onSelect ? 'button' : undefined} className={`ci-hbar${onSelect ? ' click' : ''}`} onClick={onSelect ? () => onSelect(it) : undefined} title={`${it.label}: ${usd(it.value)}`}>
              <span className="ci-hbar-name">{it.label}{it.sub && <small>{it.sub}</small>}</span>
              <span className="ci-hbar-track"><i style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? color }} /></span>
              <span className="ci-hbar-val">{format(it.value)}</span>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}

/** Donut of dollar amounts with a legend showing each value and share. items: [{ key, label, value, color }] */
export function Donut({ items, center, sub }) {
  const [hover, setHover] = useState(null)
  const total = items.reduce((n, i) => n + i.value, 0)
  const R = 70
  const C = 2 * Math.PI * R
  let off = 0
  return (
    <div className="ci-donut">
      <div className="ci-donut-fig">
        <svg viewBox="0 0 180 180" role="img" aria-label={items.map((i) => `${i.label} ${usd(i.value)}`).join(', ')}>
          <g transform="rotate(-90 90 90)">
            {items.map((it, i) => {
              const len = total ? (it.value / total) * C : 0
              const el = <circle key={it.key ?? it.label} cx="90" cy="90" r={R} fill="none" stroke={it.color} strokeWidth={hover === i ? 30 : 26}
                strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              off += len
              return el
            })}
          </g>
        </svg>
        <div className="ci-donut-center"><strong>{hover != null ? usd(items[hover].value, { compact: true }) : center}</strong><span>{hover != null ? items[hover].label : sub}</span></div>
      </div>
      <ul className="ci-donut-legend">
        {items.map((it, i) => (
          <li key={it.key ?? it.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? 'on' : undefined}>
            <i style={{ background: it.color }} />{it.label}<b>{usd(it.value, { compact: true })}</b><small>{total ? Math.round((it.value / total) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  )
}
