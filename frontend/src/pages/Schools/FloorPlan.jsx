import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Text, Group, Circle, Image as KImage } from 'react-konva'
import { shapeAt, centroid } from '../../lib/roomDetection'

// Pin colour follows the label's ACM status (always shown with its name, never colour alone)
const PIN = { 'ACM Present': '#d03b3b', 'Assumed ACM': '#c98a00', 'No ACM': '#0c8f3e' }
const WALL = '#3d4a5c'
const MAX_H = 460

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

/**
 * Floor plan with room-label pins. Coordinates of pins are 0–1 fractions of the plan.
 * - layout: sample plan from the API (rooms in metres) — drawn when there's no image
 * - imageUrl: uploaded plan image, drawn instead of the layout
 * - editable: click to add a pin (snaps its name to the room clicked), drag pins to move them
 */
export default function FloorPlan({ layout, imageUrl, labels, shapes = [], selectedId, editable = false, onAdd, onSelect, onMove }) {
  const [wrapRef, containerW] = useContainerWidth()
  const { img, failed } = useImage(imageUrl)
  const showImage = Boolean(imageUrl)

  const aspect = showImage
    ? (img ? img.height / img.width : 0.66)
    : layout ? layout.depth / layout.width : 0.66
  const pad = showImage ? 0 : 26 // room for the dimension labels
  let w = Math.max(0, containerW - pad * 2)
  let h = w * aspect
  if (h > MAX_H) { h = MAX_H; w = h / aspect }
  const stageW = containerW
  const stageH = h + pad * 2
  const ox = (stageW - w) / 2
  const oy = pad
  const sx = layout ? w / layout.width : 1 // metres → px

  const labelledRooms = new Map(labels.filter((l) => l.roomId).map((l) => [l.roomId, l]))

  const roomAt = (fx, fy) => {
    if (showImage) return shapeAt(shapes, fx, fy) // rooms detected on the uploaded image
    if (!layout) return null
    const mx = fx * layout.width
    const my = fy * layout.depth
    return layout.rooms.find((r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) ?? null
  }

  const handleClick = (e) => {
    if (!editable || e.target.findAncestor?.('.pin', true)) return
    const p = e.target.getStage().getPointerPosition()
    const fx = (p.x - ox) / w
    const fy = (p.y - oy) / h
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return
    const room = roomAt(fx, fy)
    onAdd({ x: +fx.toFixed(4), y: +fy.toFixed(4), roomId: room?.id ?? null, name: room?.name ?? '' })
  }

  const fmt = (m) => `${m.toFixed(1)}`

  return (
    <div ref={wrapRef} className={`fp-canvas${editable ? ' editable' : ''}`}>
      {containerW > 0 && (
        <Stage width={stageW} height={stageH} onClick={handleClick} onTap={handleClick}>
          <Layer>
            <Rect x={0} y={0} width={stageW} height={stageH} fill="#ffffff" />
            {showImage && img && <KImage image={img} x={ox} y={oy} width={w} height={h} />}
            {showImage && !img && (
              <Text x={0} y={stageH / 2 - 8} width={stageW} align="center" fontSize={13} fill="#8a96a6"
                text={failed ? 'The floor plan image could not be loaded' : 'Loading floor plan…'} />
            )}

            {!showImage && layout && (
              <Group x={ox} y={oy}>
                {/* Overall dimensions */}
                <Text x={0} y={-20} width={w} align="center" fontSize={10} fill="#55657a" text={`${layout.width.toFixed(2)} m`} />
                <Line points={[0, -6, w, -6]} stroke="#9aa6b5" strokeWidth={1} />
                <Text x={-20} y={h / 2 + 20} rotation={-90} fontSize={10} fill="#55657a" text={`${layout.depth.toFixed(2)} m`} />
                <Line points={[-8, 0, -8, h]} stroke="#9aa6b5" strokeWidth={1} />

                {/* Corridor */}
                <Rect x={0} y={layout.corridor.y * sx} width={w} height={layout.corridor.h * sx} fill="#f3f5f8" />
                <Text x={0} y={(layout.corridor.y + layout.corridor.h / 2) * sx - 5} width={w} align="center" fontSize={9}
                  fill="#8a96a6" letterSpacing={2} text="CORRIDOR" />

                {/* Stairs / lobby with treads */}
                <Group x={layout.stairs.x * sx} y={layout.stairs.y * sx}>
                  <Rect width={layout.stairs.w * sx} height={layout.stairs.h * sx} fill="#eef1f5" stroke={WALL} strokeWidth={1.5} />
                  {Array.from({ length: 8 }, (_, i) => (
                    <Line key={i} points={[4, ((i + 1) * layout.stairs.h * sx) / 9, layout.stairs.w * sx - 4, ((i + 1) * layout.stairs.h * sx) / 9]}
                      stroke="#b7c0cc" strokeWidth={1} />
                  ))}
                  <Text width={layout.stairs.w * sx} y={layout.stairs.h * sx / 2 - 12} align="center" fontSize={9} fontStyle="bold"
                    fill="#55657a" text={layout.stairs.label.toUpperCase().replace(' / ', '\n')} lineHeight={1.3} />
                </Group>

                {/* Rooms */}
                {layout.rooms.map((r) => {
                  const lab = labelledRooms.get(r.id)
                  const rw = r.w * sx
                  const rh = r.h * sx
                  // Fit the name: shrink so the longest word fits, then stack name + size centred in the room
                  const name = r.name.toUpperCase()
                  const longest = Math.max(...name.split(' ').map((s) => s.length))
                  // ~0.78em per bold capital, so the longest word never breaks mid-word
                  const fs = Math.max(5.5, Math.min(rw > 70 ? 10 : 9, (rw - 6) / (longest * 0.78)))
                  const lines = Math.ceil((name.length * fs * 0.78) / (rw - 6))
                  const showDims = rw > 52 && rh > 50
                  const blockH = lines * fs * 1.15 + (showDims ? 24 : 0)
                  const top = Math.max(2, (rh - blockH) / 2)
                  return (
                    <Group key={r.id} x={r.x * sx} y={r.y * sx}>
                      <Rect width={rw} height={rh} stroke={WALL} strokeWidth={2}
                        fill={lab ? `${PIN[lab.acmStatus]}1f` : '#ffffff'} />
                      {/* door gap on the corridor side */}
                      <Line points={r.y < layout.corridor.y ? [rw / 2 - 7, rh, rw / 2 + 7, rh] : [rw / 2 - 7, 0, rw / 2 + 7, 0]}
                        stroke={lab ? '#ffffff' : '#ffffff'} strokeWidth={3} />
                      <Text x={3} y={top} width={rw - 6} align="center" fontSize={fs} fontStyle="bold" lineHeight={1.15}
                        fill="#2b3a4f" text={name} wrap="word" />
                      {showDims && (
                        <Text x={2} y={top + lines * fs * 1.15 + 4} width={rw - 4} align="center" fontSize={8} fill="#55657a"
                          text={`${fmt(r.w)} x ${fmt(r.h)} m\n(${(r.w * r.h).toFixed(1)} m²)`} lineHeight={1.25} />
                      )}
                    </Group>
                  )
                })}
                <Rect width={w} height={h} stroke={WALL} strokeWidth={4} listening={false} />
              </Group>
            )}

            {/* Rooms detected on the uploaded image (OpenCV) */}
            {showImage && img && shapes.map((s) => {
              const lab = labelledRooms.get(s.id)
              const c = centroid(s.points)
              const color = lab ? PIN[lab.acmStatus] : '#006aa3'
              return (
                <Group key={s.id} listening={false}>
                  <Line points={s.points.map((v, i) => (i % 2 ? oy + v * h : ox + v * w))} closed
                    fill={`${color}${lab ? '33' : '1a'}`} stroke={color} strokeWidth={1.5} dash={lab ? undefined : [5, 3]} />
                  {!lab && (
                    <Text x={ox + c.x * w - 40} y={oy + c.y * h - 5} width={80} align="center" fontSize={10} fontStyle="bold"
                      fill="#006aa3" text={s.name} />
                  )}
                </Group>
              )
            })}

            {/* Label pins */}
            {(!showImage || img) && labels.map((l) => {
              const selected = l.id === selectedId
              const color = PIN[l.acmStatus] ?? PIN['No ACM']
              return (
                <Group key={l.id} name="pin" x={ox + l.x * w} y={oy + l.y * h} draggable={editable}
                  onClick={(e) => { e.cancelBubble = true; onSelect?.(l.id) }}
                  onTap={(e) => { e.cancelBubble = true; onSelect?.(l.id) }}
                  dragBoundFunc={(pos) => ({ x: Math.min(ox + w, Math.max(ox, pos.x)), y: Math.min(oy + h, Math.max(oy, pos.y)) })}
                  onDragStart={() => onSelect?.(l.id)}
                  onDragEnd={(e) => onMove?.(l.id, +((e.target.x() - ox) / w).toFixed(4), +((e.target.y() - oy) / h).toFixed(4))}
                  onMouseEnter={(e) => { e.target.getStage().container().style.cursor = editable ? 'move' : 'pointer' }}
                  onMouseLeave={(e) => { e.target.getStage().container().style.cursor = '' }}>
                  {selected && <Circle radius={15} fill={color} opacity={0.18} />}
                  {/* map-pin: circle head with a point */}
                  <Line points={[-6, -12, 0, 0, 6, -12]} closed fill={color} />
                  <Circle y={-15} radius={7.5} fill={color} stroke="#ffffff" strokeWidth={selected ? 2.5 : 1.5} />
                  <Circle y={-15} radius={2.6} fill="#ffffff" />
                  <Group y={-36}>
                    <Rect x={-l.name.length * 2.9 - 6} width={l.name.length * 5.8 + 12} height={15} cornerRadius={3}
                      fill={selected ? color : 'rgba(255,255,255,0.94)'} stroke={color} strokeWidth={1} />
                    <Text x={-l.name.length * 2.9 - 6} width={l.name.length * 5.8 + 12} y={3} align="center" fontSize={9.5} fontStyle="bold"
                      fill={selected ? '#ffffff' : '#1c2b40'} text={l.name} />
                  </Group>
                </Group>
              )
            })}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
