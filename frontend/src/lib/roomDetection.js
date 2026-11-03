// Main-thread side of room detection: scales the plan image down, sends its pixels to the
// OpenCV worker (loaded on first use, ~11 MB) and resolves with the detected room polygons and tables.
// Rooms are found at up to 1400 px; tables on a sharper copy at up to twice that, so small chair symbols keep their shape.
const ROOM_SIDE = 1400
const SHARP_SIDE = 2800

let worker = null
let seq = 0
const pending = new Map()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('../workers/roomDetect.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id)
    if (!p) return
    pending.delete(data.id)
    if (data.ok) p.resolve(data)
    else p.reject(new Error(data.error))
  }
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Room detection failed to load'))
    pending.clear()
    worker.terminate()
    worker = null
  }
  return worker
}

function pixels(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff' // transparent PNGs: treat empty as paper
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

async function toImageData(source) {
  const blob = source instanceof Blob ? source : await (await fetch(source)).blob()
  const bitmap = await createImageBitmap(blob)
  const imageData = pixels(bitmap, ROOM_SIDE)
  const sharpData = pixels(bitmap, SHARP_SIDE)
  const natural = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return { imageData, sharpData, natural }
}

/** source: File/Blob or same-origin image URL. Resolves { shapes, tables, chairs, tablesAsRooms, ms, width, height } (natural image size). */
export async function detectRooms(source) {
  const { imageData, sharpData, natural } = await toImageData(source)
  const id = ++seq
  const result = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, imageData, sharpData }, [imageData.data.buffer, sharpData.data.buffer])
  })
  return { ...result, ...natural }
}

// Ray-casting point-in-polygon on flat [x0,y0,x1,y1,…] points
export function shapeAt(shapes, x, y) {
  return shapes.find(({ points: p }) => {
    let inside = false
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside
    }
    return inside
  }) ?? null
}

export function centroid(points) {
  let x = 0
  let y = 0
  for (let i = 0; i < points.length; i += 2) { x += points[i]; y += points[i + 1] }
  const n = points.length / 2
  return { x: x / n, y: y / n }
}
