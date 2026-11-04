import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ReactFlow, Handle, Position, MarkerType } from '@xyflow/react'
import { Check, Minus } from 'lucide-react'
import { fmtDay } from '../Surveillance/survMeta'
import '@xyflow/react/dist/base.css'

const STATUS_TEXT = { done: 'Done', current: 'Current stage', skipped: 'Skipped', upcoming: 'Upcoming' }
// A finished stage waiting on its review
const GATE_TEXT = { readyForReview: 'Ready for review', awaitingReview: 'Awaiting review', returned: 'Returned for rework' }

// Layout of the stage cards: fixed size, wrapping into rows to fit the card's width
const NODE_W = 210
const NODE_H = 128
const GAP_X = 46
const GAP_Y = 44

// One stage as a card; arrows join on the left / right (same row) or bottom / top (next row)
function StageNode({ data: { s, n } }) {
  return (
    <div className={`in-flow-node ${s.status}`} title={s.hint}>
      <Handle type="target" position={Position.Left} id="l" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} />
      <div className="in-flow-top">
        <span className="in-life-dot" aria-hidden="true">
          {s.status === 'done' ? <Check size={14} strokeWidth={3} /> : s.status === 'skipped' ? <Minus size={14} strokeWidth={3} /> : n}
        </span>
        <strong>{s.label}</strong>
      </div>
      <small className="in-life-status">{s.gate ? GATE_TEXT[s.gate] : STATUS_TEXT[s.status]}{s.date ? ` · ${fmtDay(s.date)}` : ''}</small>
      {s.reviewedBy && <small className="in-life-reviewed">Reviewed by {s.reviewedBy}</small>}
      {s.detail && (s.link
        ? <Link to={s.link} className="in-life-detail nodrag nopan">{s.detail}</Link>
        : <small className="in-life-detail" title={s.detail}>{s.detail}</small>)}
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="b" isConnectable={false} />
    </div>
  )
}
const NODE_TYPES = { stage: StageNode }

// [callback ref, width]: the element's width, kept up to date (it appears once the stages have loaded)
function useWidth() {
  const [el, setEl] = useState(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w]
}

/**
 * Inspection life cycle (stages from the server) as a flow of stage cards: done = green, current = blue,
 * upcoming = grey; the arrow into the current stage is animated. Stages that don't apply to this inspection
 * (status notRequired) are hidden — the timeline still lists them. Hover a stage for its description.
 */
export default function LifecycleStepper({ lifecycle }) {
  const [wrapRef, width] = useWidth()
  const shown = useMemo(() => (lifecycle?.stages ?? []).filter((s) => s.status !== 'notRequired'), [lifecycle])

  const { nodes, edges, height } = useMemo(() => {
    const perRow = Math.max(1, Math.min(shown.length, Math.floor((width + GAP_X) / (NODE_W + GAP_X))))
    const rows = Math.ceil(shown.length / perRow)
    // Centre the cards in the available width
    const used = perRow * NODE_W + (perRow - 1) * GAP_X
    const left = Math.max(0, (width - used) / 2)
    const ns = shown.map((s, i) => ({
      id: s.id,
      type: 'stage',
      position: { x: left + (i % perRow) * (NODE_W + GAP_X), y: Math.floor(i / perRow) * (NODE_H + GAP_Y) },
      data: { s, n: i + 1 },
      draggable: false,
      selectable: false,
      style: { width: NODE_W, height: NODE_H },
    }))
    const es = shown.slice(1).map((s, k) => {
      const from = shown[k]
      const wraps = (k + 1) % perRow === 0 // the next stage starts a new row
      const tone = from.status === 'done' || from.status === 'skipped' ? (s.status === 'current' ? 'current' : 'done') : 'upcoming'
      const color = { done: '#0c7f0c', current: 'var(--primary)', upcoming: '#b8c3cf' }[tone]
      return {
        id: `${from.id}-${s.id}`,
        source: from.id,
        target: s.id,
        sourceHandle: wraps ? 'b' : 'r',
        targetHandle: wraps ? 't' : 'l',
        type: wraps ? 'smoothstep' : 'straight',
        animated: tone === 'current',
        style: { stroke: color, strokeWidth: 2, ...(tone === 'upcoming' ? { strokeDasharray: '5 4' } : {}) },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      }
    })
    return { nodes: ns, edges: es, height: rows * NODE_H + (rows - 1) * GAP_Y + 8 }
  }, [shown, width])

  if (!lifecycle) return null
  const closed = lifecycle.current === 'closed'
  const current = lifecycle.stages.find((s) => s.id === lifecycle.current)

  return (
    <section className="u-card in-life" aria-label="Inspection life cycle">
      <header className="in-life-head">
        <div>
          <h2>Inspection Stages</h2>
          {current && <p className="in-life-desc">{current.hint}</p>}
        </div>
        <span className={`in-life-now${closed ? ' closed' : ''}`} title={lifecycle.override ? `Set by ${lifecycle.override.by?.name}: ${lifecycle.override.note}` : undefined}>
          {closed ? 'Closed' : `Current: ${current?.label}`}{lifecycle.override ? ' · set manually' : ''}
        </span>
      </header>
      {lifecycle.gate && (
        <p className={`in-life-gate ${lifecycle.gate}`}>
          {lifecycle.gate === 'readyForReview' && <>The work in <strong>{current?.label}</strong> is done. Use <strong>Send for Review</strong> – a reviewer confirms it before the next stage starts.</>}
          {lifecycle.gate === 'awaitingReview' && (lifecycle.current === 'submitted'
            ? <>The inspection is waiting for review. Use <strong>Review Stage</strong> to check it and <strong>send the samples to the laboratory</strong>, or return it to the inspector.</>
            : <><strong>{current?.label}</strong> is waiting for a reviewer. Use <strong>Review Stage</strong> to approve it or return it for rework.</>)}
          {lifecycle.gate === 'returned' && <><strong>{current?.label}</strong> was returned for rework – {current?.detail?.replace(/^Returned by /, 'by ')}. Fix it, then send it for review again.</>}
        </p>
      )}
      {/* The stages as a read-only flow (no dragging, panning or zooming) */}
      <div ref={wrapRef} className="in-flow" style={{ height }} aria-label={`Stages: ${shown.map((s) => `${s.label} (${STATUS_TEXT[s.status]})`).join(', ')}`}>
        {width > 0 && (
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
            panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
            defaultViewport={{ x: 0, y: 4, zoom: 1 }} minZoom={1} maxZoom={1} proOptions={{ hideAttribution: true }} />
        )}
      </div>
    </section>
  )
}
