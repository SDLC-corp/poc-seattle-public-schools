import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Text, Group, Circle, Shape, Image as KImage } from 'react-konva'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { centroid } from '../../lib/roomDetection'
import { ROOM_COLORS } from './roomColors'

const WALL = '#3d4a5c'
const TABLE = '#8a5a14'
const MIN_ZOOM = 0.5
const MAX_ZOOM = 6

function useContainerWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function useImage(url) {
  const [loaded, setLoaded] = useState({ url: null, img: null, failed: false })
  useEffect(() => {
    if (!url) return undefined
    const img = new window.Image()
    img.onload = () => setLoaded({ url, img, failed: false })
    img.onerror = () => setLoaded({ url, img: null, failed: true })
    img.src = url
    return () => { img.onload = null; img.onerror = null }
  }, [url])
  return loaded.url === url ? loaded : { url, img: null, failed: false }
}

const toPx = (points, w, h) => points.map((v, i) => (i % 2 ? v * h : v * w))

// Drawing grid in plan coordinates (pans and zooms with the plan), over the visible part of the stage.
// `step` is the minor spacing; every fifth line is a major line.
function Grid({ step, bounds, scale }) {
  const lines = (major) => (ctx, shape) => {
    const { x0, y0, x1, y1 } = bounds
    ctx.beginPath()
    for (let i = Math.floor(x0 / step); i * step <= x1; i += 1) {
      if ((i % 5 === 0) !== major) continue
      ctx.moveTo(i * step, y0)
      ctx.lineTo(i * step, y1)
    }
    for (let j = Math.floor(y0 / step); j * step <= y1; j += 1) {
      if ((j % 5 === 0) !== major) continue
      ctx.moveTo(x0, j * step)
      ctx.lineTo(x1, j * step)
    }
    ctx.strokeShape(shape)
  }
  return (
    <>
      <Shape sceneFunc={lines(false)} stroke="#e6ecf2" strokeWidth={1 / scale} listening={false} />
      <Shape sceneFunc={lines(true)} stroke="#cfd9e4" strokeWidth={1 / scale} listening={false} />
    </>
  )
}

/**
 * Floor plan with room polygons and detected tables (both 0–1 fractions of the plan).
 * mode: 'view' | 'select' | 'label' | 'draw' | 'edit' | 'delete'
 * Background: uploaded plan image, else the sample layout (corridor, stairs, outer walls).
 */
export default function PlanCanvas({
  layout, imageUrl, rooms, tables = [], selectedId, mode = 'view', height = 420,
  onSelect, onLabel, onDelete, onCreate, onChangePolygon,
}) {
  const [wrapRef, containerW] = useContainerWidth()
  const { img, failed } = useImage(imageUrl)
  const [view, setView] = useState(null) // { scale, x, y } — null = fitted
  const [draft, setDraft] = useState([]) // points being drawn (fractions)
  const [cursor, setCursor] = useState(null)
  const [editPts, setEditPts] = useState(null) // { id, points } while dragging vertices

  const showImage = Boolean(imageUrl)
  const aspect = showImage ? (img ? img.height / img.width : 0.66) : layout ? layout.depth / layout.width : 0.66
  const pad = showImage ? 8 : 26
  // height is the maximum; wide plans get a shorter canvas instead of empty space
  let w = Math.max(0, containerW - pad * 2)
  let h = w * aspect
  if (h > height - pad * 2) { h = height - pad * 2; w = h / aspect }
  const stageH = Math.round(h + pad * 2)
  const fit = { scale: 1, x: (containerW - w) / 2, y: pad }
  const v = view ?? fit
  const sx = layout ? w / layout.width : 1

  // Leaving draw mode drops an unfinished outline (render-time reset, no effect needed)
  const [modeFor, setModeFor] = useState(mode)
  if (modeFor !== mode) {
    setModeFor(mode)
    setDraft([])
    setCursor(null)
  }

  useEffect(() => {
    if (mode !== 'draw') return undefined
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape') setDraft([])
      if (e.key === 'Enter' && draft.length >= 6) { onCreate?.(draft); setDraft([]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onCreate, draft])

  const zoomBy = (factor, about) => {
    const cur = view ?? fit
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.scale * factor))
    const p = about ?? { x: containerW / 2, y: stageH / 2 }
    const wx = (p.x - cur.x) / cur.scale
    const wy = (p.y - cur.y) / cur.scale
    setView({ scale, x: p.x - wx * scale, y: p.y - wy * scale })
  }

  // Pointer position as plan fractions
  const planPoint = (stage) => {
    const p = stage.getPointerPosition()
    return { fx: (p.x - v.x) / v.scale / w, fy: (p.y - v.y) / v.scale / h }
  }

  // Drop consecutive near-identical corners (a double-click adds the last corner twice)
  const dedupe = (pts) => pts.reduce((acc, v, i) => {
    if (i % 2) return acc
    const n = acc.length
    if (n && Math.abs(acc[n - 2] - v) < 0.004 && Math.abs(acc[n - 1] - pts[i + 1]) < 0.004) return acc
    return [...acc, v, pts[i + 1]]
  }, [])

  const finishDraft = (pts) => {
    const clean = dedupe(pts)
    if (clean.length >= 6) { onCreate?.(clean); setDraft([]) }
  }

  const onStageClick = (e) => {
    if (mode !== 'draw' || e.evt.button === 2) return
    const { fx, fy } = planPoint(e.target.getStage())
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return
    // Clicking near the first point closes the outline
    if (draft.length >= 6) {
      const dx = (fx - draft[0]) * w * v.scale
      const dy = (fy - draft[1]) * h * v.scale
      if (Math.hypot(dx, dy) < 10) { finishDraft(draft); return }
    }
    setDraft((d) => [...d, +fx.toFixed(4), +fy.toFixed(4)])
  }

  const onRoomClick = (room) => (e) => {
    if (mode === 'draw') return
    e.cancelBubble = true
    if (mode === 'delete') onDelete?.(room)
    else if (mode === 'label') onLabel?.(room)
    else onSelect?.(room.id)
  }

  const setCursorStyle = (e, style) => { const c = e.target.getStage()?.container(); if (c) c.style.cursor = style }
  const hoverCursor = { select: 'pointer', view: 'pointer', label: 'text', delete: 'not-allowed', edit: 'pointer' }[mode] ?? 'crosshair'

  return (
    <div ref={wrapRef} className={`pc-wrap mode-${mode}`} style={{ height: containerW > 0 ? stageH : height }}>
      {containerW > 0 && (
        <Stage width={containerW} height={stageH} onClick={onStageClick} onTap={onStageClick}
          onDblClick={() => { if (mode === 'draw') finishDraft(draft) }}
          onMouseMove={(e) => { if (mode === 'draw') setCursor(planPoint(e.target.getStage())) }}
          onWheel={(e) => {
            // Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page
            if (!e.evt.ctrlKey && !e.evt.metaKey) return
            e.evt.preventDefault()
            zoomBy(e.evt.deltaY < 0 ? 1.15 : 1 / 1.15, e.target.getStage().getPointerPosition())
          }}>
          <Layer>
            <Rect width={containerW} height={stageH} fill="#ffffff" listening={false} />
            <Group x={v.x} y={v.y} scaleX={v.scale} scaleY={v.scale}
              draggable={mode === 'select' || mode === 'view'}
              onDragEnd={(e) => { if (e.target === e.currentTarget) setView({ scale: v.scale, x: e.target.x(), y: e.target.y() }) }}>
              {/* Grid; the plan image is multiplied over it, so its white paper shows the grid and its ink stays dark */}
              {w > 0 && (
                <Grid step={w / 40} scale={v.scale}
                  bounds={{ x0: -v.x / v.scale, y0: -v.y / v.scale, x1: (containerW - v.x) / v.scale, y1: (stageH - v.y) / v.scale }} />
              )}

              {/* Background */}
              {showImage && img && <KImage image={img} width={w} height={h} listening={false} globalCompositeOperation="multiply" />}
              {showImage && !img && (
                <Text width={w} y={h / 2 - 8} align="center" fontSize={13} fill="#8a96a6"
                  text={failed ? 'The floor plan image could not be loaded' : 'Loading floor plan…'} listening={false} />
              )}
              {!showImage && layout && (
                <Group listening={false}>
                  <Text y={-20} width={w} align="center" fontSize={10} fill="#55657a" text={`${layout.width.toFixed(2)} m`} />
                  <Line points={[0, -6, w, -6]} stroke="#9aa6b5" strokeWidth={1} />
                  <Text x={-20} y={h / 2 + 20} rotation={-90} fontSize={10} fill="#55657a" text={`${layout.depth.toFixed(2)} m`} />
                  <Rect y={layout.corridor.y * sx} width={w} height={layout.corridor.h * sx} fill="rgba(226, 232, 239, 0.55)" />
                  <Text y={(layout.corridor.y + layout.corridor.h / 2) * sx - 5} width={w} align="center" fontSize={9} fill="#8a96a6" letterSpacing={2} text="CORRIDOR" />
                  <Group x={layout.stairs.x * sx} y={layout.stairs.y * sx}>
                    <Rect width={layout.stairs.w * sx} height={layout.stairs.h * sx} fill="#eef1f5" stroke={WALL} strokeWidth={1.5} />
                    {Array.from({ length: 8 }, (_, i) => (
                      <Line key={i} points={[4, ((i + 1) * layout.stairs.h * sx) / 9, layout.stairs.w * sx - 4, ((i + 1) * layout.stairs.h * sx) / 9]} stroke="#b7c0cc" strokeWidth={1} />
                    ))}
                    <Text width={layout.stairs.w * sx} y={(layout.stairs.h * sx) / 2 - 12} align="center" fontSize={9} fontStyle="bold"
                      fill="#55657a" text={layout.stairs.label.toUpperCase().replace(' / ', '\n')} lineHeight={1.3} />
                  </Group>
                </Group>
              )}

              {/* No plan uploaded: a plain grid to draw rooms on */}
              {!showImage && !layout && (
                <Group listening={false}>
                  <Rect width={w} height={h} stroke="#c9d3de" strokeWidth={1} dash={[6, 4]} />
                  {!rooms.some((r) => r.polygon) && (
                    <Text width={w} y={h / 2 - 16} align="center" fontSize={13} lineHeight={1.5} fill="#8a96a6"
                      text={'No floor plan uploaded\nEdit the floor to upload a PDF, or draw rooms with the Draw tool'} />
                  )}
                </Group>
              )}

              {/* Rooms */}
              {(!showImage || img) && rooms.filter((r) => r.polygon).map((r) => {
                const pts = editPts?.id === r.id ? editPts.points : r.polygon
                const c = ROOM_COLORS[r.acmStatus] ?? ROOM_COLORS['Not Assessed']
                const selected = r.id === selectedId
                const ctr = centroid(pts)
                const xs = pts.filter((_, i) => i % 2 === 0)
                const roomW = (Math.max(...xs) - Math.min(...xs)) * w
                const fs = Math.max(6, Math.min(11, roomW / Math.max(8, r.name.length * 0.62)))
                return (
                  <Group key={r.id}>
                    <Line points={toPx(pts, w, h)} closed fill={c.fill}
                      stroke={selected ? '#006aa3' : showImage ? c.stroke : WALL} strokeWidth={(selected ? 3 : showImage ? 1.5 : 2) / v.scale}
                      onClick={onRoomClick(r)} onTap={onRoomClick(r)}
                      onMouseEnter={(e) => setCursorStyle(e, hoverCursor)} onMouseLeave={(e) => setCursorStyle(e, '')} />
                    <Group x={ctr.x * w} y={ctr.y * h} listening={false}>
                      {r.acmStatus === 'ACM Present' && (
                        <Line points={[-6, -fs - 12, 0, -fs - 22, 6, -fs - 12]} closed fill="#c62f2f" />
                      )}
                      <Text x={-roomW / 2 + 2} y={-fs - 2} width={Math.max(10, roomW - 4)} align="center" fontSize={fs} fontStyle="bold" fill="#1f2d3f"
                        text={r.name} wrap="word" />
                      <Text x={-roomW / 2} y={2} width={roomW} align="center" fontSize={Math.max(6, fs - 1)} fill="#38485c" text={`(${r.number})`} />
                    </Group>
                    {/* Vertex handles in edit mode */}
                    {mode === 'edit' && selected && Array.from({ length: pts.length / 2 }, (_, i) => (
                      <Circle key={i} x={pts[i * 2] * w} y={pts[i * 2 + 1] * h} radius={5 / v.scale} fill="#ffffff" stroke="#006aa3" strokeWidth={2 / v.scale}
                        draggable
                        dragBoundFunc={function bound(pos) {
                          const t = this.getParent().getAbsoluteTransform().copy().invert().point(pos)
                          const c2 = { x: Math.min(w, Math.max(0, t.x)), y: Math.min(h, Math.max(0, t.y)) }
                          return this.getParent().getAbsoluteTransform().point(c2)
                        }}
                        onDragMove={(e) => {
                          const next = [...pts]
                          next[i * 2] = +(e.target.x() / w).toFixed(4)
                          next[i * 2 + 1] = +(e.target.y() / h).toFixed(4)
                          setEditPts({ id: r.id, points: next })
                        }}
                        onDragEnd={() => { if (editPts) onChangePolygon?.(r.id, editPts.points); setEditPts(null) }}
                        onMouseEnter={(e) => setCursorStyle(e, 'move')} onMouseLeave={(e) => setCursorStyle(e, '')} />
                    ))}
                  </Group>
                )
              })}

              {/* Tables found by the chairs around them: shown for reference, never rooms */}
              {showImage && img && tables.map((t) => (
                <Rect key={t.id} x={t.x * w} y={t.y * h} width={t.w * w} height={t.h * h} listening={false}
                  fill="rgba(138, 90, 20, 0.12)" stroke={TABLE} strokeWidth={1.5 / v.scale} dash={[4 / v.scale, 3 / v.scale]} />
              ))}

              {/* Outline being drawn */}
              {mode === 'draw' && draft.length > 0 && (
                <Group listening={false}>
                  <Line points={[...toPx(draft, w, h), ...(cursor ? [cursor.fx * w, cursor.fy * h] : [])]} stroke="#006aa3" strokeWidth={2 / v.scale} dash={[6 / v.scale, 4 / v.scale]} />
                  {Array.from({ length: draft.length / 2 }, (_, i) => (
                    <Circle key={i} x={draft[i * 2] * w} y={draft[i * 2 + 1] * h} radius={(i === 0 ? 6 : 4) / v.scale} fill={i === 0 ? '#006aa3' : '#ffffff'} stroke="#006aa3" strokeWidth={2 / v.scale} />
                  ))}
                </Group>
              )}
              {!showImage && layout && <Rect width={w} height={h} stroke={WALL} strokeWidth={4} listening={false} />}
            </Group>
          </Layer>
        </Stage>
      )}
      <div className="pc-zoom">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in (Ctrl + wheel)"><ZoomIn size={15} /></button>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
        <button type="button" onClick={() => setView(null)} aria-label="Fit to view" title="Fit to view"><Maximize2 size={14} /></button>
      </div>
      {mode === 'draw' && (
        <p className="pc-hint">{draft.length >= 6 ? 'Click the first point, double-click or press Enter to finish · Esc cancels' : 'Click to place the room’s corners'}</p>
      )}
    </div>
  )
}
