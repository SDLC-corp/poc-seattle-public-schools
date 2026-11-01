import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { STATUS } from './mockData'

// MapLibre locates its worker relative to its own module URL, which breaks once Vite
// pre-bundles or bundles it. Point it at the (self-contained) worker file explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY

// Basemaps. OpenFreeMap needs no key; satellite needs a MapTiler key in frontend/.env
const BASEMAPS = [
  {
    id: 'streets', label: 'Streets',
    url: 'https://tiles.openfreemap.org/styles/liberty',
    cityBuildings: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#ece6dd', 40, '#ddd5c9', 150, '#c9c0b3'],
    labelColor: '#1c2b40', labelHalo: '#ffffff',
  },
  {
    id: 'light', label: 'Light',
    url: 'https://tiles.openfreemap.org/styles/positron',
    cityBuildings: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#e4e8ed', 60, '#cdd4dc'],
    labelColor: '#1c2b40', labelHalo: '#ffffff',
  },
  ...(MAPTILER_KEY ? [{
    id: 'satellite', label: 'Satellite',
    url: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
    cityBuildings: ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0], 0, '#e3e6ea', 60, '#c9ced6'],
    labelColor: '#ffffff', labelHalo: 'rgba(0, 0, 0, 0.75)',
  }] : []),
]

const SEATTLE = [-122.335, 47.61]
const PITCH_3D = 55
const BUILDINGS_MIN_ZOOM = 14
const LABEL_FONT = ['Noto Sans Bold'] // served by both OpenFreeMap and MapTiler
const STORAGE_KEY = 'school-map-basemap'

// MapLibre paint properties can't read CSS variables, so resolve them once
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const statusColor = () => [
  'match', ['get', 'status'],
  'compliant', cssVar('--status-good'),
  'dueSoon', cssVar('--status-warning'),
  cssVar('--status-critical'),
]
// Deeper tones of the same status hues for 3D walls, so lighting reads as shading
// rather than flat neon; hover lifts them back toward the pin colour.
const buildingColor = (hover) => [
  'match', ['get', 'status'],
  'compliant', hover ? '#3dbb47' : '#239a3a',
  'dueSoon', hover ? '#ffc23d' : '#e79a16',
  hover ? '#e05a5a' : '#c23a3a',
]

function readBasemap() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return BASEMAPS.some((b) => b.id === saved) ? saved : 'streets'
  } catch {
    return 'streets'
  }
}

function schoolsGeoJson(schools) {
  return {
    type: 'FeatureCollection',
    features: schools
      .filter((s) => s.location)
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.location.lng, s.location.lat] },
        properties: {
          id: s.id, name: s.name, address: s.address.full, status: s.status,
          type: s.type, phone: s.phone, buildingCount: s.buildingCount,
        },
      })),
  }
}

function buildingsGeoJson(buildings) {
  return {
    type: 'FeatureCollection',
    features: buildings
      .filter((b) => b.footprint)
      .map((b) => ({
        type: 'Feature',
        geometry: b.footprint,
        properties: {
          id: b.id, schoolId: b.schoolId, name: b.name, schoolName: b.schoolName, code: b.code,
          yearBuilt: b.yearBuilt, floors: b.floors, areaSqFt: b.areaSqFt, heightM: b.heightM,
          presumedAcm: b.presumedAcm, status: b.status,
        },
      })),
  }
}

// Basemap buildings within this distance of a school building's centre are flattened, so
// they can't occupy the same space as the (mock) school footprints. Overlapping extrusions
// z-fight: they flicker and bleed into each other as the camera moves. 70 m covers the
// largest generated footprint (main buildings are up to ~85 x 55 m).
const CAMPUS_CLEARANCE_M = 70

// Evaluated per feature when tiles are parsed, so unlike feature-state or id filters it needs
// no bookkeeping. Point inputs are used deliberately: `distance` to large polygon inputs
// returned wrong results in testing (every building matched).
function cityHeight(buildings) {
  const height = ['coalesce', ['get', 'render_height'], 0]
  const centres = buildings.filter((b) => b.location).map((b) => [b.location.lng, b.location.lat])
  const value = centres.length
    ? ['case', ['<', ['distance', { type: 'MultiPoint', coordinates: centres }], CAMPUS_CLEARANCE_M], 0, height]
    : height
  return ['interpolate', ['linear'], ['zoom'], BUILDINGS_MIN_ZOOM, 0, BUILDINGS_MIN_ZOOM + 0.6, value]
}

function popupCard({ title, subtitle, rows, status }) {
  const el = document.createElement('div')
  el.className = `map-popup status-${status}`
  const head = document.createElement('div')
  head.className = 'map-popup-head'
  const h = document.createElement('strong')
  h.textContent = title
  head.append(h)
  if (subtitle) {
    const sub = document.createElement('span')
    sub.textContent = subtitle
    head.append(sub)
  }
  const dl = document.createElement('dl')
  rows.filter(([, v]) => v != null && v !== '').forEach(([k, v]) => {
    const dt = document.createElement('dt')
    dt.textContent = k
    const dd = document.createElement('dd')
    dd.textContent = v
    dl.append(dt, dd)
  })
  const badge = document.createElement('span')
  badge.className = 'map-popup-status'
  badge.textContent = STATUS[status].label
  el.append(head, dl, badge)
  return el
}

// (Re)build our layers. Runs on every style load, since switching basemaps wipes custom layers.
function addLayers(map, basemap) {
  const style = map.getStyle()
  const firstSymbol = style.layers.find((l) => l.type === 'symbol')?.id

  // Hide the basemap's own 3D buildings; ours below are styled to match the dashboard
  style.layers.filter((l) => l.type === 'fill-extrusion').forEach((l) => map.setLayoutProperty(l.id, 'visibility', 'none'))

  map.setSky({
    'sky-color': '#7fb4dc',
    'horizon-color': '#dcebf5',
    'fog-color': '#f2f6f9',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.85,
  })
  map.setLight({ anchor: 'map', color: '#ffffff', intensity: 0.55, position: [1.3, 225, 40] })

  // Both OpenFreeMap and MapTiler tiles follow the OpenMapTiles schema
  const vectorSource = ['openmaptiles', 'maptiler_planet'].find((id) => style.sources[id])
  if (vectorSource) {
    map.addLayer({
      id: 'city-buildings-3d',
      type: 'fill-extrusion',
      source: vectorSource,
      'source-layer': 'building',
      minzoom: BUILDINGS_MIN_ZOOM,
      paint: {
        'fill-extrusion-color': basemap.cityBuildings,
        'fill-extrusion-height': cityHeight([]),
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        // Opaque on purpose: translucent extrusions blend through each other and smear while zooming
        'fill-extrusion-opacity': 1,
      },
    }, firstSymbol)
  }

  map.addSource('schools', { type: 'geojson', data: schoolsGeoJson([]), promoteId: 'id' })
  map.addSource('school-buildings', { type: 'geojson', data: buildingsGeoJson([]), promoteId: 'id' })

  // Soft status-coloured glow on the ground around each campus. It must sit *below* every
  // 3D layer: flat layers drawn after extrusions ignore depth and tint the buildings.
  map.addLayer({
    id: 'school-glow',
    type: 'circle',
    source: 'schools',
    paint: {
      'circle-color': statusColor(),
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 7, 14, 45, 18, 700],
      'circle-blur': 0.9,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 15, 0.22],
      'circle-pitch-alignment': 'map',
    },
  }, map.getLayer('city-buildings-3d') ? 'city-buildings-3d' : firstSymbol)

  map.addLayer({
    id: 'school-buildings-3d',
    type: 'fill-extrusion',
    source: 'school-buildings',
    minzoom: 13,
    paint: {
      'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'hover'], false], buildingColor(true), buildingColor(false)],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, ['get', 'heightM']],
      'fill-extrusion-opacity': 1,
      'fill-extrusion-vertical-gradient': true,
    },
  }, firstSymbol)

  // Pins: drop shadow, selected pulse ring, then the pin itself
  map.addLayer({
    id: 'school-pin-shadow',
    type: 'circle',
    source: 'schools',
    paint: { 'circle-radius': 8, 'circle-color': '#000', 'circle-opacity': 0.22, 'circle-blur': 0.8, 'circle-translate': [0, 2] },
  })
  map.addLayer({
    id: 'school-pulse',
    type: 'circle',
    source: 'schools',
    filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 10, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': statusColor(), 'circle-stroke-opacity': 0.8 },
  })
  map.addLayer({
    id: 'schools',
    type: 'circle',
    source: 'schools',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        10, ['case', ['boolean', ['feature-state', 'selected'], false], 9, 5.5],
        15, ['case', ['boolean', ['feature-state', 'selected'], false], 12, 9]],
      'circle-color': statusColor(),
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
    },
  })

  map.addLayer({
    id: 'school-labels',
    type: 'symbol',
    source: 'schools',
    minzoom: 12.5,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': LABEL_FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 12.5, 11, 17, 14],
      'text-anchor': 'top',
      'text-offset': [0, 1.1],
      'text-max-width': 9,
      'text-padding': 4,
    },
    paint: { 'text-color': basemap.labelColor, 'text-halo-color': basemap.labelHalo, 'text-halo-width': 1.6 },
  })
}

// In 3D the extruded buildings replace the pins once zoomed in
function applyMode(map, is3d) {
  const fade = is3d ? ['interpolate', ['linear'], ['zoom'], 14.5, 1, 15.5, 0] : 1
  for (const layer of ['schools', 'school-pin-shadow']) {
    map.setPaintProperty(layer, 'circle-opacity', layer === 'schools' ? fade : (is3d ? ['interpolate', ['linear'], ['zoom'], 14.5, 0.22, 15.5, 0] : 0.22))
  }
  map.setPaintProperty('schools', 'circle-stroke-opacity', fade)
  for (const layer of ['city-buildings-3d', 'school-buildings-3d']) {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', is3d ? 'visible' : 'none')
  }
}

export default function SchoolMap({ schools, buildings, selectedId }) {
  const wrapperRef = useRef(null)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [styleVersion, setStyleVersion] = useState(0) // bumps after each style (re)load
  const [basemapId, setBasemapId] = useState(readBasemap)
  const [is3d, setIs3d] = useState(true)
  const [zoom, setZoom] = useState(10.3)
  const basemap = BASEMAPS.find((b) => b.id === basemapId) ?? BASEMAPS[0]
  const basemapRef = useRef(basemap)
  basemapRef.current = basemap

  // Create the map once
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapRef.current.url,
      center: SEATTLE,
      zoom: 10.3,
      maxPitch: 70,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left')
    map.addControl(new maplibregl.FullscreenControl({ container: wrapperRef.current }), 'top-left')

    map.on('style.load', () => {
      addLayers(map, basemapRef.current)
      setStyleVersion((v) => v + 1)
    })

    const popup = new maplibregl.Popup({ closeButton: false, offset: 12, maxWidth: '280px' })
    map.on('click', 'schools', (e) => {
      const p = e.features[0].properties
      popup.setLngLat(e.lngLat).setDOMContent(popupCard({
        title: p.name,
        subtitle: p.address,
        rows: [['Type', p.type], ['Phone', p.phone], ['Buildings', p.buildingCount]],
        status: p.status,
      })).addTo(map)
    })
    map.on('click', 'school-buildings-3d', (e) => {
      const p = e.features[0].properties
      popup.setLngLat(e.lngLat).setDOMContent(popupCard({
        title: p.name,
        subtitle: `${p.schoolName} · ${p.code}`,
        rows: [
          ['Built', p.yearBuilt],
          ['Floors', p.floors],
          ['Area', `${Number(p.areaSqFt).toLocaleString('en-US')} sq ft`],
          ['Asbestos', p.presumedAcm ? 'Presumed (pre-1981)' : 'Not presumed'],
        ],
        status: p.status,
      })).addTo(map)
    })

    let hoveredId = null
    const clearHover = () => {
      if (hoveredId != null && map.getSource('school-buildings')) {
        map.setFeatureState({ source: 'school-buildings', id: hoveredId }, { hover: false })
      }
      hoveredId = null
    }
    map.on('mousemove', 'school-buildings-3d', (e) => {
      const id = e.features[0]?.id
      if (id === hoveredId) return
      clearHover()
      hoveredId = id
      map.setFeatureState({ source: 'school-buildings', id }, { hover: true })
    })
    map.on('mouseleave', 'school-buildings-3d', clearHover)

    for (const layer of ['schools', 'school-buildings-3d']) {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }
    map.on('zoomend', () => setZoom(map.getZoom()))

    mapRef.current = map
    return () => map.remove()
  }, [])

  // Switch basemap; the style.load handler re-adds our layers afterwards
  const loadedBasemapRef = useRef(basemapId)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, basemapId) } catch { /* not persisted */ }
    if (loadedBasemapRef.current === basemapId) return
    loadedBasemapRef.current = basemapId
    mapRef.current.setStyle(basemap.url, { diff: false })
  }, [basemapId, basemap.url])

  const ready = styleVersion > 0

  // Push data and mode after every style load
  useEffect(() => {
    if (!styleVersion) return
    const map = mapRef.current
    map.getSource('schools').setData(schoolsGeoJson(schools))
    map.getSource('school-buildings').setData(buildingsGeoJson(buildings))
    map.setFilter('school-pulse', ['==', ['get', 'id'], selectedId || ''])
    if (selectedId) map.setFeatureState({ source: 'schools', id: selectedId }, { selected: true })
    applyMode(map, is3d)
  }, [styleVersion, schools, buildings, selectedId, is3d])

  // Clear basemap buildings off the visible school campuses
  useEffect(() => {
    if (!styleVersion) return
    const map = mapRef.current
    if (map.getLayer('city-buildings-3d')) {
      map.setPaintProperty('city-buildings-3d', 'fill-extrusion-height', cityHeight(buildings))
    }
  }, [styleVersion, buildings])

  // Camera for 2D / 3D toggle
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current
    map.easeTo({ pitch: is3d ? PITCH_3D : 0, bearing: is3d ? map.getBearing() : 0, duration: 800 })
  }, [ready, is3d])

  // Camera: fly to the selected school, or fit all schools
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !schools.length) return
    map.removeFeatureState({ source: 'schools' })

    const school = schools.find((s) => s.id === selectedId)
    if (school?.location) {
      map.setFeatureState({ source: 'schools', id: school.id }, { selected: true })
      map.flyTo({
        center: [school.location.lng, school.location.lat],
        zoom: is3d ? 16.6 : 15,
        pitch: is3d ? 60 : 0,
        bearing: is3d ? -25 : 0,
        duration: 2200,
        essential: true,
      })
    } else {
      const bounds = new maplibregl.LngLatBounds()
      schools.forEach((s) => s.location && bounds.extend([s.location.lng, s.location.lat]))
      map.fitBounds(bounds, { padding: 30, pitch: is3d ? 40 : 0, bearing: 0 })
    }
    // Only re-run when the selection or data changes, not on style reloads or mode toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, schools, selectedId])

  // Pulse ring around the selected school
  useEffect(() => {
    if (!styleVersion || !selectedId) return
    const map = mapRef.current
    let frame
    const start = performance.now()
    const tick = (now) => {
      const t = ((now - start) % 1800) / 1800
      // Like the pins, the ring hides once 3D buildings take over (it would draw over them)
      const zoomFade = is3d ? Math.min(1, Math.max(0, 15.5 - map.getZoom())) : 1
      if (map.getLayer('school-pulse')) {
        map.setPaintProperty('school-pulse', 'circle-radius', 10 + t * 22)
        map.setPaintProperty('school-pulse', 'circle-stroke-opacity', 0.8 * (1 - t) * zoomFade)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [selectedId, styleVersion, is3d])

  return (
    <div ref={wrapperRef} className="school-map">
      <div ref={containerRef} className="school-map-canvas" />

      <div className="map-toolbar">
        <div className="map-seg" role="group" aria-label="Basemap">
          {BASEMAPS.map((b) => (
            <button key={b.id} type="button" className={b.id === basemapId ? 'active' : ''}
              aria-pressed={b.id === basemapId} onClick={() => setBasemapId(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
        <div className="map-seg" role="group" aria-label="Map view">
          <button type="button" className={!is3d ? 'active' : ''} aria-pressed={!is3d} onClick={() => setIs3d(false)}>2D</button>
          <button type="button" className={is3d ? 'active' : ''} aria-pressed={is3d} onClick={() => setIs3d(true)}>3D</button>
        </div>
      </div>

      {is3d && zoom < BUILDINGS_MIN_ZOOM && (
        <div className="map-hint">Zoom in or pick a school to see 3D buildings</div>
      )}

      <ul className="map-legend">
        {Object.entries(STATUS).map(([key, s]) => (
          <li key={key}><span className="map-legend-dot" style={{ background: s.color }} />{s.label}</li>
        ))}
      </ul>
    </div>
  )
}
