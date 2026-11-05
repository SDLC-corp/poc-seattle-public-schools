// Shared MapLibre setup for every map in the app: worker, basemap styles (with fallbacks) and a check of what
// the browser's graphics can do.
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// MapLibre locates its worker relative to its own module URL, which breaks once Vite
// pre-bundles or bundles it. Point it at the (self-contained) worker file explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

export { maplibregl }

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const maptiler = (id) => `https://api.maptiler.com/maps/${id}/style.json?key=${MAPTILER_KEY}`

// MapTiler (needs the key in frontend/.env) serves tiles from a fast CDN; OpenFreeMap is free and keyless but
// often takes several seconds per tile, so it's only the fallback. Each list is tried in order.
export const STYLE_URLS = {
  streets: [...(MAPTILER_KEY ? [maptiler('streets-v2')] : []), 'https://tiles.openfreemap.org/styles/liberty'],
  light: [...(MAPTILER_KEY ? [maptiler('dataviz-light')] : []), 'https://tiles.openfreemap.org/styles/positron'],
  satellite: MAPTILER_KEY ? [maptiler('hybrid')] : [],
}

/**
 * What the browser can draw, checked once:
 * - webgl: false → no map can be drawn (WebGL off or blocked)
 * - software: true → no graphics acceleration (drawn on the CPU, very slow): keep the map light
 */
let support = null
export function mapSupport() {
  if (support) return support
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return (support = { webgl: false, software: false })
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return (support = { webgl: true, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer) })
  } catch {
    return (support = { webgl: false, software: false })
  }
}

// Sharp enough on high-DPI screens without drawing 4x the pixels (and 1x when drawing on the CPU)
export const mapPixelRatio = () => (mapSupport().software ? 1 : Math.min(window.devicePixelRatio || 1, 1.5))

/**
 * Loads a style, moving on to the next URL when one fails (blocked by the browser or an extension, offline, quota).
 * Tile errors after the style loaded are left to MapLibre (it retries and keeps what it has).
 */
export function withStyleFallback(map, urls, onAllFailed) {
  let i = 0
  let loaded = false
  map.on('style.load', () => { loaded = true })
  map.on('error', (e) => {
    if (loaded || e?.sourceId || e?.tile) return // a tile, not the style
    i += 1
    if (i < urls.length) map.setStyle(urls[i], { diff: false })
    else onAllFailed?.()
  })
  return {
    // A new basemap: start again at its first URL
    setUrls(next) { urls = next; i = 0; loaded = false; map.setStyle(urls[0], { diff: false }) },
  }
}
