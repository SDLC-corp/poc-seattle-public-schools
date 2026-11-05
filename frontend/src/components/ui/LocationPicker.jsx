import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { maplibregl, STYLE_URLS, mapSupport, mapPixelRatio, withStyleFallback } from '../../lib/mapSetup'
import './location-picker.css'

const SEATTLE = { lat: 47.61, lng: -122.335 }

/**
 * Small map for choosing a point: click (or drag the pin) to set it.
 * value: { lat, lng } | null · center: where to start when there's no value (e.g. the school)
 * footprints: GeoJSON polygons drawn for context (e.g. the school's other buildings)
 */
export default function LocationPicker({ value, center, footprints = [], onChange, label = 'Location map' }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [error, setError] = useState(() => (mapSupport().webgl ? null : "This browser can't draw maps (WebGL is off or blocked) — type the latitude and longitude instead."))

  useEffect(() => {
    if (!mapSupport().webgl) return undefined
    const start = value ?? center ?? SEATTLE
    let m
    try {
      m = new maplibregl.Map({
        container: box.current, style: STYLE_URLS.streets[0], center: [start.lng, start.lat], zoom: value || center ? 17 : 11,
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, pixelRatio: mapPixelRatio(), fadeDuration: 0,
      })
    } catch (err) {
      setError(`The map could not start in this browser (${err.message}) — type the latitude and longitude instead.`)
      return undefined
    }
    withStyleFallback(m, STYLE_URLS.streets, () => setError('The map could not be loaded — type the latitude and longitude instead.'))
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.getCanvas().style.cursor = 'crosshair'
    m.on('click', (e) => onChangeRef.current({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) }))
    map.current = m
    return () => { m.remove(); map.current = null; marker.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- the map is created once; value changes move the pin below

  // The pin follows the value (typed in, clicked or dragged)
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!value) { marker.current?.remove(); marker.current = null; return }
    if (!marker.current) {
      marker.current = new maplibregl.Marker({ color: '#c03030', draggable: true }).setLngLat([value.lng, value.lat]).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current.getLngLat()
        onChangeRef.current({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })
      })
    } else marker.current.setLngLat([value.lng, value.lat])
    if (!m.getBounds().contains([value.lng, value.lat])) m.easeTo({ center: [value.lng, value.lat] })
  }, [value])

  // A new starting point (e.g. another school chosen in the form) moves the map there, unless a point is already picked
  const centerKey = center ? `${center.lat},${center.lng}` : ''
  useEffect(() => {
    const m = map.current
    if (!m || !center || value) return
    m.flyTo({ center: [center.lng, center.lat], zoom: 17, duration: 900 })
  }, [centerKey]) // eslint-disable-line react-hooks/exhaustive-deps -- follow the center only when it changes

  // Context outlines (the school's other buildings)
  useEffect(() => {
    const m = map.current
    if (!m) return undefined
    const data = { type: 'FeatureCollection', features: footprints.map((g) => ({ type: 'Feature', geometry: g, properties: {} })) }
    const draw = () => {
      if (m.getSource('lp-footprints')) { m.getSource('lp-footprints').setData(data); return }
      m.addSource('lp-footprints', { type: 'geojson', data })
      m.addLayer({ id: 'lp-fill', type: 'fill', source: 'lp-footprints', paint: { 'fill-color': '#0a66a8', 'fill-opacity': 0.25 } })
      m.addLayer({ id: 'lp-line', type: 'line', source: 'lp-footprints', paint: { 'line-color': '#0a66a8', 'line-width': 1.5 } })
    }
    if (m.isStyleLoaded()) draw()
    else m.once('load', draw)
    return undefined
  }, [footprints])

  return (
    <div ref={box} className="lp-map" role="application" aria-label={label}>
      {error && <div className="lp-error" role="alert">{error}</div>}
    </div>
  )
}
