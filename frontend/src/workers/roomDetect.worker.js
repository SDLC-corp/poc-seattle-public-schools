// Finds enclosed rooms on a floor plan image with OpenCV.js, off the main thread.
// Message in:  { id, imageData (plan, ≤1400 px), sharpData (same plan, ≤2800 px, for chairs and tables) }
// Message out: { id, ok, shapes: [{ id, points: [x0,y0,…] (0–1), area (0–1), fill (0–1), snapped }],
//                tables: [{ id, x, y, w, h (0–1), chairs }], chairs, tablesAsRooms, ms } or { id, ok: false, error }
//
// Algorithm adapted from the tessera floor-planning detector (features/floor-workflow/detection/opencv.ts, findRooms):
// 1. Small ink pieces (letters, digits, furniture symbols) are dropped — walls are never small pieces.
// 2. Walls = thick ink: double wall lines are filled in, then thin lines (furniture, door leaves, text) are opened away.
// 3. The building footprint is the convex hull of the large wall pieces; anything outside it (dimension lines,
//    legends, area tables) is never a room.
// 4. Long straight single-line partitions that meet a wall count as walls; compact thick pieces standing free of the
//    wall network (furniture) count as floor.
// 5. Free space is shrunk by half a door width, which closes doorways so neighbouring rooms don't merge; each
//    remaining core is grown back into free space up to its walls.
// 6. Shapes that nearly fill their bounding rectangle are snapped to that rectangle.
// Tables come from tessera's furniture pass: chairs drawn as a square inside a square, and closed rectangles
// with chairs along their sides. An outline found by the room finder that is really a table is dropped.
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

// Convex hull of [x, y] points (monotone chain)
function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list) => {
    const out = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half([...pts].reverse())]
}

function findRooms(cv, rgba, doorWidth, minArea) {
  const W = rgba.cols
  const H = rgba.rows
  const mats = []
  const track = (m) => { mats.push(m); return m }
  const kernel = (w, h) => track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))))
  try {
    const gray = track(new cv.Mat())
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
    const allInk = track(new cv.Mat())
    cv.threshold(gray, allInk, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)

    // 1. Drop small pieces of ink (labels, furniture symbols)
    const pieceLabels = track(new cv.Mat())
    const pieceStats = track(new cv.Mat())
    const pieceCentroids = track(new cv.Mat())
    const pieces = cv.connectedComponentsWithStats(allInk, pieceLabels, pieceStats, pieceCentroids, 8, cv.CV_32S)
    const minPiece = doorWidth * 0.8
    const keep = new Uint8Array(pieces)
    for (let i = 1; i < pieces; i += 1) {
      keep[i] = Math.max(pieceStats.intAt(i, cv.CC_STAT_WIDTH), pieceStats.intAt(i, cv.CC_STAT_HEIGHT)) >= minPiece ? 255 : 0
    }
    const ink = track(new cv.Mat(H, W, cv.CV_8UC1))
    const pieceLabel = pieceLabels.data32S
    const inkData = ink.data
    for (let p = 0; p < W * H; p += 1) inkData[p] = keep[pieceLabel[p]]

    // 2. Walls: fill between double wall lines, keep only what is still thick
    const wallGap = Math.max(3, doorWidth * 0.5)
    const filled = track(new cv.Mat())
    cv.morphologyEx(ink, filled, cv.MORPH_CLOSE, kernel(wallGap, wallGap))
    const thick = track(new cv.Mat())
    const lineWidth = Math.max(3, doorWidth * 0.18)
    cv.morphologyEx(filled, thick, cv.MORPH_OPEN, kernel(lineWidth, lineWidth))

    // 3. Building footprint: convex hull of the large wall pieces
    const wallOutlines = track(new cv.MatVector())
    const wallHierarchy = track(new cv.Mat())
    cv.findContours(thick, wallOutlines, wallHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    const minSpan = Math.max(W, H) * 0.12
    const wallPoints = []
    for (let k = 0; k < wallOutlines.size(); k += 1) {
      const c = wallOutlines.get(k)
      try {
        const r = cv.boundingRect(c)
        if (Math.max(r.width, r.height) < minSpan) continue
        const d = c.data32S
        for (let j = 0; j < d.length; j += 2) wallPoints.push([d[j], d[j + 1]])
      } finally {
        c.delete()
      }
    }
    const hull = convexHull(wallPoints)
    const footprint = track(cv.Mat.zeros(H, W, cv.CV_8UC1))
    if (hull.length >= 3) {
      const poly = track(cv.matFromArray(hull.length, 1, cv.CV_32SC2, hull.flat()))
      const polys = track(new cv.MatVector())
      polys.push_back(poly)
      cv.fillPoly(footprint, polys, new cv.Scalar(255))
    }
    const inBuilding = footprint.data

    // 4. Single-line partitions: long straight lines that meet a wall
    const partitionLength = doorWidth * 2.5
    const lines = track(new cv.Mat())
    cv.morphologyEx(ink, lines, cv.MORPH_OPEN, kernel(partitionLength, 1))
    const down = track(new cv.Mat())
    cv.morphologyEx(ink, down, cv.MORPH_OPEN, kernel(1, partitionLength))
    cv.bitwise_or(lines, down, lines)
    const near = track(new cv.Mat())
    cv.dilate(thick, near, kernel(lineWidth * 2, lineWidth * 2))
    const lineLabels = track(new cv.Mat())
    const lineCount = cv.connectedComponents(lines, lineLabels, 8, cv.CV_32S)
    const meetsWall = new Uint8Array(lineCount)
    const lineLabel = lineLabels.data32S
    const nearData = near.data
    for (let p = 0; p < W * H; p += 1) if (lineLabel[p] && nearData[p] && inBuilding[p]) meetsWall[lineLabel[p]] = 255
    const thickData = thick.data
    for (let p = 0; p < W * H; p += 1) if (meetsWall[lineLabel[p]] && inBuilding[p]) thickData[p] = 255

    // 4b. Furniture islands: desks, benches and sofas drawn with thick lines survive as "thick" ink and would
    // split a room's free space into fragments. Walls form one connected network (or are long and thin, like
    // a wall stub between two doors); compact free-standing pieces are furniture, so they count as floor.
    const wallLabels = track(new cv.Mat())
    const wallStats = track(new cv.Mat())
    const wallCentroids = track(new cv.Mat())
    const wallPieces = cv.connectedComponentsWithStats(thick, wallLabels, wallStats, wallCentroids, 8, cv.CV_32S)
    const isWall = new Uint8Array(wallPieces)
    for (let i = 1; i < wallPieces; i += 1) {
      const w = wallStats.intAt(i, cv.CC_STAT_WIDTH)
      const h = wallStats.intAt(i, cv.CC_STAT_HEIGHT)
      const long = Math.max(w, h)
      const short = Math.max(1, Math.min(w, h))
      isWall[i] = long >= minSpan || (long / short >= 4 && short <= lineWidth * 3) ? 255 : 0
    }
    const wallLabel = wallLabels.data32S
    for (let p = 0; p < W * H; p += 1) thickData[p] = isWall[wallLabel[p]]

    // 5. Free space shrunk by half a door width → one core per room; grow each back up to its walls
    const free = track(new cv.Mat())
    cv.bitwise_not(thick, free)
    const doorSize = Math.round(doorWidth) | 1
    const door = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(doorSize, doorSize)))
    const cores = track(new cv.Mat())
    cv.erode(free, cores, door)

    const coreLabels = track(new cv.Mat())
    const coreStats = track(new cv.Mat())
    const coreCentroids = track(new cv.Mat())
    const m = cv.connectedComponentsWithStats(cores, coreLabels, coreStats, coreCentroids, 4, cv.CV_32S)
    const coreLabel = coreLabels.data32S
    const freeData = free.data
    const grow = Math.ceil(doorWidth / 2) + 1
    const rooms = []
    for (let i = 1; i < m; i += 1) {
      const x = coreStats.intAt(i, cv.CC_STAT_LEFT)
      const y = coreStats.intAt(i, cv.CC_STAT_TOP)
      const w = coreStats.intAt(i, cv.CC_STAT_WIDTH)
      const h = coreStats.intAt(i, cv.CC_STAT_HEIGHT)
      // The outside of the building reaches the image edge
      if (x <= grow || y <= grow || x + w >= W - grow || y + h >= H - grow) continue
      if ((w + 2 * grow) * (h + 2 * grow) > W * H * 0.5) continue
      const x0 = x - grow
      const y0 = y - grow
      const rw = w + 2 * grow
      const rh = h + 2 * grow
      const core = track(cv.Mat.zeros(rh, rw, cv.CV_8UC1))
      const coreData = core.data
      for (let yy = y; yy < y + h; yy += 1) {
        for (let xx = x; xx < x + w; xx += 1) if (coreLabel[yy * W + xx] === i) coreData[(yy - y0) * rw + (xx - x0)] = 255
      }
      const mask = track(new cv.Mat())
      cv.dilate(core, mask, door)
      const maskData = mask.data
      let area = 0
      for (let yy = 0; yy < rh; yy += 1) {
        for (let xx = 0; xx < rw; xx += 1) {
          const p = yy * rw + xx
          if (maskData[p] && !freeData[(yy + y0) * W + xx + x0]) maskData[p] = 0
          else if (maskData[p]) area += 1
        }
      }
      if (area < minArea) continue
      const cx = Math.round(coreCentroids.doubleAt(i, 0))
      const cy = Math.round(coreCentroids.doubleAt(i, 1))
      if (!inBuilding[cy * W + cx]) continue
      const contours = track(new cv.MatVector())
      const hierarchy = track(new cv.Mat())
      cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      let best = null
      for (let k = 0; k < contours.size(); k += 1) {
        const c = contours.get(k)
        if (!best || cv.contourArea(c) > cv.contourArea(best)) { best?.delete(); best = c } else c.delete()
      }
      if (!best) continue
      try {
        // 6. Rectangles: growing the core back rounds the corners, so snap near-rectangles to their rectangle
        const rect = cv.minAreaRect(best)
        const fill = cv.contourArea(best) / Math.max(1, rect.size.width * rect.size.height)
        let local
        if (fill >= 0.85) {
          local = cv.RotatedRect.points(rect).map((p) => [Math.round(p.x), Math.round(p.y)])
        } else {
          const approx = new cv.Mat()
          cv.approxPolyDP(best, approx, 0.015 * cv.arcLength(best, true), true)
          local = []
          for (let k = 0; k < approx.rows; k += 1) local.push([approx.data32S[k * 2], approx.data32S[k * 2 + 1]])
          approx.delete()
        }
        const pts = local.map(([px, py]) => [Math.min(W, Math.max(0, px + x0)), Math.min(H, Math.max(0, py + y0))])
        if (pts.length >= 3) rooms.push({ pts, area, fill: Math.min(1, fill), snapped: fill >= 0.85 })
      } finally {
        best.delete()
      }
    }
    return rooms
  } finally {
    for (const mat of mats) mat.delete()
  }
}

// ---------- Tables by the chairs around them (tessera: findNestedSquares, findClosedOutlines, tablesFromChairs) ----------
// Run on the sharp image (small chair symbols keep their shape); results are scaled to room-image pixels.

const bounds = (pts) => {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}
const centreOf = (b) => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
const within = (b, [x, y]) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
function polygonArea(pts) {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1])
  return Math.abs(a / 2)
}

function contourPoints(cv, contour, epsilonRatio) {
  const approx = new cv.Mat()
  try {
    cv.approxPolyDP(contour, approx, epsilonRatio * cv.arcLength(contour, true), true)
    const pts = []
    for (let i = 0; i < approx.rows; i += 1) pts.push([approx.data32S[i * 2], approx.data32S[i * 2 + 1]])
    return pts
  } finally {
    approx.delete()
  }
}

// A 4-corner outline that is (nearly) a square: equal sides and equal diagonals. Null otherwise.
function squareOf(points) {
  if (points.length !== 4) return null
  const [a, b, c, d] = points
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
  const sides = [dist(a, b), dist(b, c), dist(c, d), dist(d, a)]
  const minS = Math.min(...sides)
  if (minS <= 0 || minS / Math.max(...sides) < 0.8) return null
  const d1 = dist(a, c)
  const d2 = dist(b, d)
  if (Math.min(d1, d2) / Math.max(d1, d2) < 0.85) return null // equal diagonals: right angles, not a rhombus
  return { cx: (a[0] + b[0] + c[0] + d[0]) / 4, cy: (a[1] + b[1] + c[1] + d[1]) / 4, side: sides.reduce((s, v) => s + v, 0) / 4 }
}

// Chairs: the outer outline of every "square inside a square", found by contour topology — the outer square's
// ink ring has a hole, and inside that hole lies another square ring. A single square never qualifies.
// Contours bigger than a chair (walls, rooms) are skipped before they are simplified.
function findNestedSquares(cv, ink, maxSide) {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  try {
    cv.findContours(ink, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE)
    const n = contours.size()
    const quads = []
    for (let i = 0; i < n; i += 1) {
      const c = contours.get(i)
      try {
        const r = cv.boundingRect(c)
        const pts = Math.max(r.width, r.height) <= maxSide * 1.5 && cv.contourArea(c) >= 12 ? contourPoints(cv, c, 0.04) : []
        quads.push(pts.length === 4 && squareOf(pts) ? pts : null)
      } finally {
        c.delete()
      }
    }
    const parent = (i) => hierarchy.data32S[i * 4 + 3]
    const outers = new Map()
    for (let k = 0; k < n; k += 1) {
      const inner = quads[k]
      if (!inner) continue
      const hole = parent(k) // the white inside of the outer square's ring
      const ring = hole >= 0 ? parent(hole) : -1 // the outer square's ink ring
      const outer = ring >= 0 ? quads[ring] : null
      if (!outer || outers.has(ring)) continue
      const so = squareOf(outer)
      const si = squareOf(inner)
      if (Math.hypot(so.cx - si.cx, so.cy - si.cy) <= so.side * 0.2 && so.side / si.side >= 1.2) outers.set(ring, outer)
    }
    return [...outers.values()]
  } finally {
    contours.delete()
    hierarchy.delete()
  }
}

// The white inside of every closed ink shape (a table outline, a chair ring, a room) as a simplified polygon
function findClosedOutlines(cv, ink, minArea) {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  try {
    cv.findContours(ink, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE)
    const out = []
    for (let i = 0; i < contours.size(); i += 1) {
      if (hierarchy.data32S[i * 4 + 3] < 0) continue // an outer edge, not a hole
      const c = contours.get(i)
      try {
        if (cv.contourArea(c) < minArea) continue
        const pts = contourPoints(cv, c, 0.02)
        if (pts.length >= 3) out.push(pts)
      } finally {
        c.delete()
      }
    }
    return out
  } finally {
    contours.delete()
    hierarchy.delete()
  }
}

// Sizes in chair sides (the chairs set the unit, so no scale is needed)
const TABLE_SHORT_MIN = 1.3
const TABLE_LONG_MAX = 10
const CHAIR_REACH = 1.5 // a chair's centre this far from the table's edge still counts as around it
const TABLE_MIN_FILL = 0.8 // rectangles and squares fill their box; L-shapes and diagonals do not
const MIN_CHAIRS_AROUND = 2

// The side of the table a chair sits on, or null beside a corner, overlapping it, or out of reach
function sideOf([cx, cy], table, reach) {
  const inX = cx >= table.minX && cx <= table.maxX
  const inY = cy >= table.minY && cy <= table.maxY
  if (inX && inY) return null
  if (Math.hypot(Math.max(table.minX - cx, 0, cx - table.maxX), Math.max(table.minY - cy, 0, cy - table.maxY)) > reach) return null
  if (inY) return cx < table.minX ? 'left' : 'right'
  if (inX) return cy < table.minY ? 'top' : 'bottom'
  return null
}

// A closed rectangle or square at least ~1.3 chairs across, holding no chair, with two or more chairs along its
// sides is a table. A shape with no chairs near it is never a table.
function tablesFromChairs(outlines, chairs) {
  if (chairs.length < MIN_CHAIRS_AROUND) return []
  const sizes = chairs.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)).sort((a, b) => a - b)
  const unit = sizes[Math.floor(sizes.length / 2)]
  const centres = chairs.map(centreOf)
  const found = []
  // Largest first, so an inner line drawn inside a table (an inset top) does not become a second table
  const area = (b) => (b.maxX - b.minX) * (b.maxY - b.minY)
  const shapes = outlines.map((points) => ({ points, box: bounds(points) })).sort((a, b) => area(b.box) - area(a.box))
  for (const { points, box } of shapes) {
    const w = box.maxX - box.minX
    const h = box.maxY - box.minY
    if (Math.min(w, h) < TABLE_SHORT_MIN * unit || Math.max(w, h) > TABLE_LONG_MAX * unit) continue
    if (polygonArea(points) < TABLE_MIN_FILL * w * h) continue
    if (centres.some((c) => within(box, c))) continue // holds a chair: a room or the chair's own symbol
    if (found.some((f) => within(f.box, centreOf(box)) || within(box, centreOf(f.box)))) continue
    let count = 0
    for (const c of centres) if (sideOf(c, box, CHAIR_REACH * unit)) count += 1
    if (count >= MIN_CHAIRS_AROUND) found.push({ box, chairs: count })
  }
  return found
}

function findTables(cv, rgba, scale, planW, planH) {
  const gray = new cv.Mat()
  const ink = new cv.Mat()
  try {
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
    cv.threshold(gray, ink, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
    const down = (pts) => pts.map(([x, y]) => [x / scale, y / scale])
    const diag = Math.hypot(planW, planH)
    const maxChair = diag * 0.04
    const chairs = findNestedSquares(cv, ink, maxChair * scale)
      .map(down)
      .filter((pts) => {
        const s = squareOf(pts)
        return s && s.side >= 6 && s.side <= maxChair
      })
      .map(bounds)
      // Each chair is found twice (its ink ring and that ring's inner edge are both squares around the inner square)
      .filter((b, i, all) => !all.some((o, j) => j < i && within(o, centreOf(b))))
    // Tables are looked for only between chairs
    if (chairs.length < MIN_CHAIRS_AROUND) return { chairs: chairs.length, tables: [] }
    const outlines = findClosedOutlines(cv, ink, 64).map(down)
    return { chairs: chairs.length, tables: tablesFromChairs(outlines, chairs) }
  } finally {
    gray.delete()
    ink.delete()
  }
}

// Same parameters as tessera without a calibrated scale: door = 3% of the plan's longest side,
// smallest room = (1.6 × door width)². Rooms are found on the plan image; tables on its sharper copy.
function detect(cv, imageData, sharpData) {
  const plan = cv.matFromImageData(imageData)
  const sharp = cv.matFromImageData(sharpData)
  try {
    const scale = sharp.cols / plan.cols
    const W = plan.cols
    const H = plan.rows
    const doorWidth = Math.max(W, H) * 0.03
    const found = findRooms(cv, plan, doorWidth, (doorWidth * 1.6) ** 2)
    const { chairs, tables } = findTables(cv, sharp, scale, W, H)
    // An outline enclosed by a table's edges is the table, not a room
    const isTable = (r) => {
      const c = centreOf(bounds(r.pts))
      return tables.some(({ box }) => within(box, c) && r.area <= (box.maxX - box.minX) * (box.maxY - box.minY) * 2)
    }
    const best = found.filter((r) => !isTable(r))
    // Reading order: top to bottom, then left to right
    const top = (r) => Math.min(...r.pts.map((p) => p[1]))
    const left = (r) => Math.min(...r.pts.map((p) => p[0]))
    best.sort((a, b) => (Math.abs(top(a) - top(b)) > H * 0.04 ? top(a) - top(b) : left(a) - left(b)))
    const frac = (v, size) => +Math.min(1, Math.max(0, v / size)).toFixed(4)
    return {
      shapes: best.map((r, i) => ({
        id: `S${i + 1}`,
        points: r.pts.flatMap(([x, y]) => [+(x / W).toFixed(4), +(y / H).toFixed(4)]),
        area: +(r.area / (W * H)).toFixed(6),
        fill: +r.fill.toFixed(3),
        snapped: r.snapped,
      })),
      tables: tables.map(({ box, chairs: around }, i) => ({
        id: `T${i + 1}`,
        x: frac(box.minX, W),
        y: frac(box.minY, H),
        w: frac(box.maxX - box.minX, W),
        h: frac(box.maxY - box.minY, H),
        chairs: around,
      })),
      chairs,
      tablesAsRooms: found.length - best.length,
    }
  } finally {
    sharp.delete()
    plan.delete()
  }
}

self.onmessage = async ({ data }) => {
  const { id, imageData, sharpData } = data
  try {
    const { cv } = await getCv()
    const t0 = performance.now()
    const result = detect(cv, imageData, sharpData)
    self.postMessage({ id, ok: true, ...result, ms: Math.round(performance.now() - t0) })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message ?? String(err) })
  }
}
