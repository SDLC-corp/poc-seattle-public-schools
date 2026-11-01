// Detects enclosed rooms on a floor plan image with OpenCV.js, off the main thread.
// Message in:  { id, imageData, options: { wall, gap, minArea } }  (fractions of the image's short side / area)
// Message out: { id, ok, shapes: [{ id, name, points: [x0,y0,x1,y1,…] (0–1), area (0–1) }], ms } or { id, ok: false, error }
//
// Pipeline: grey → Otsu threshold (dark lines = walls) → opening removes thin strokes (text, dimension lines)
// → dilation seals doorways → free space split into blobs → blobs touching the image edge are "outside"
// → each kept blob is grown back to the walls and simplified to a polygon.
import cvModule from '@techstark/opencv-js'

// The Emscripten module is a "thenable" (it has its own .then), so it must never be returned from an
// async function or awaited directly — that would unwrap it forever. Wrap it in a plain object instead.
let cvReady = null
function getCv() {
  cvReady ??= new Promise((resolve) => {
    if (cvModule.Mat) resolve({ cv: cvModule })
    else cvModule.onRuntimeInitialized = () => resolve({ cv: cvModule })
  })
  return cvReady
}

function detect(cv, imageData, { wall, gap, minArea }) {
  const W = imageData.width
  const H = imageData.height
  const short = Math.min(W, H)
  const mats = []
  const keep = (m) => { mats.push(m); return m }
  const kernel = (n) => keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(n, n)))

  try {
    const src = keep(cv.matFromImageData(imageData))
    const gray = keep(new cv.Mat())
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0)

    const ink = keep(new cv.Mat())
    cv.threshold(gray, ink, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)

    // Walls are the thick strokes; text, hatching and dimension lines are thinner and get removed
    const walls = keep(new cv.Mat())
    cv.morphologyEx(ink, walls, cv.MORPH_OPEN, kernel(Math.max(2, Math.round(short * wall))))
    const free = keep(new cv.Mat())
    cv.bitwise_not(walls, free)

    // Close doorways so each room becomes its own blob
    const gapK = Math.max(3, Math.round(short * gap))
    const sealed = keep(new cv.Mat())
    cv.dilate(walls, sealed, kernel(gapK))
    const spaces = keep(new cv.Mat())
    cv.bitwise_not(sealed, spaces)

    const contours = keep(new cv.MatVector())
    const hierarchy = keep(new cv.Mat())
    // CCOMP: every free-space blob is top level (rooms sit inside the building, which sits inside the
    // white page margin, so RETR_EXTERNAL would only return the page edge); holes (text etc.) are level 2
    cv.findContours(spaces, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE)

    const growK = kernel(gapK + 2)
    const shapes = []
    for (let i = 0; i < contours.size(); i += 1) {
      if (hierarchy.data32S[i * 4 + 3] !== -1) continue // a hole, not a space
      const c = contours.get(i)
      const r = cv.boundingRect(c)
      const area = cv.contourArea(c)
      const touchesEdge = r.x <= 1 || r.y <= 1 || r.x + r.width >= W - 1 || r.y + r.height >= H - 1
      if (touchesEdge || area < minArea * W * H * 0.5 || area > 0.6 * W * H) { c.delete(); continue }

      // Grow the blob back out to the walls (dilation shrank it), staying inside free space
      const mask = cv.Mat.zeros(H, W, cv.CV_8UC1)
      const one = new cv.MatVector()
      one.push_back(c)
      cv.drawContours(mask, one, 0, new cv.Scalar(255), cv.FILLED)
      cv.dilate(mask, mask, growK)
      cv.bitwise_and(mask, free, mask)
      const grown = new cv.MatVector()
      const h2 = new cv.Mat()
      cv.findContours(mask, grown, h2, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      let best = null
      let bestArea = 0
      for (let j = 0; j < grown.size(); j += 1) {
        const g = grown.get(j)
        const a = cv.contourArea(g)
        if (a > bestArea) { best?.delete(); best = g; bestArea = a } else g.delete()
      }
      if (best && bestArea >= minArea * W * H) {
        const poly = new cv.Mat()
        cv.approxPolyDP(best, poly, 0.012 * cv.arcLength(best, true), true)
        const points = []
        for (let k = 0; k < poly.rows; k += 1) {
          points.push(+(poly.data32S[k * 2] / W).toFixed(4), +(poly.data32S[k * 2 + 1] / H).toFixed(4))
        }
        if (points.length >= 6) shapes.push({ points, area: +(bestArea / (W * H)).toFixed(5) })
        poly.delete()
      }
      best?.delete()
      mask.delete(); one.delete(); grown.delete(); h2.delete(); c.delete()
    }

    // Reading order: top to bottom, then left to right
    const top = (s) => Math.min(...s.points.filter((_, k) => k % 2))
    const left = (s) => Math.min(...s.points.filter((_, k) => k % 2 === 0))
    shapes.sort((a, b) => (Math.abs(top(a) - top(b)) > 0.05 ? top(a) - top(b) : left(a) - left(b)))
    return shapes.map((s, i) => ({ id: `S${i + 1}`, name: `Room ${i + 1}`, ...s }))
  } finally {
    for (const m of mats) m.delete()
  }
}

self.onmessage = async ({ data }) => {
  const { id, imageData, options } = data
  try {
    const { cv } = await getCv()
    const t0 = performance.now()
    // Doorway widths vary between drawings: also try wider gap sealing and keep the run that finds most rooms
    let shapes = []
    for (const factor of [1, 1.4, 1.9]) {
      const found = detect(cv, imageData, { ...options, gap: options.gap * factor })
      if (found.length > shapes.length) shapes = found
    }
    self.postMessage({ id, ok: true, shapes, ms: Math.round(performance.now() - t0) })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message ?? String(err) })
  }
}
