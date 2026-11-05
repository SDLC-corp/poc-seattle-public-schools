import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, FileX2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { authHeaders } from '../../lib/api'
import './pdf-pages.css'

/**
 * A PDF drawn with pdf.js (loaded on first use), every page fitted to the width of the box — the same in every
 * browser, without the browser viewer's side panel or zoom. Zoom in/out from the small toolbar; "Fit" goes back.
 */
export default function PdfPages({ src, title }) {
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState(null)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1) // 1 = fit to width
  const [el, setEl] = useState(null)
  const boxRef = useCallback((node) => setEl(node), [])

  useEffect(() => {
    let cancelled = false
    let loaded = null
    setDoc(null)
    setError(null)
    setZoom(1)
    ;(async () => {
      try {
        const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const res = await fetch(src, { headers: await authHeaders() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        loaded = await pdfjs.getDocument({ data: await res.arrayBuffer(), isEvalSupported: false }).promise
        if (cancelled) loaded.destroy()
        else setDoc(loaded)
      } catch (e) {
        if (!cancelled) setError(e.message)
      }
    })()
    return () => { cancelled = true; loaded?.destroy() }
  }, [src])

  // Fit to the box's width (re-drawn when the box resizes)
  useEffect(() => {
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return (
    <div className="pdfp">
      <div className="pdfp-bar">
        <span className="pdfp-title" title={title}>{title}</span>
        {doc && <span className="pdfp-pages">{doc.numPages} page{doc.numPages === 1 ? '' : 's'}</span>}
        <button type="button" onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))} disabled={zoom <= 1} aria-label="Zoom out"><ZoomOut size={15} /></button>
        <span className="pdfp-zoom">{zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} disabled={zoom >= 3} aria-label="Zoom in"><ZoomIn size={15} /></button>
        <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit to width"><Maximize2 size={14} /></button>
      </div>
      <div className="pdfp-scroll" ref={boxRef}>
        {error && <p className="pdfp-msg"><FileX2 size={22} />Couldn&apos;t open the PDF ({error}).</p>}
        {!error && !doc && <p className="pdfp-msg"><Loader2 size={20} className="pdfp-spin" />Loading document…</p>}
        {doc && width > 0 && Array.from({ length: doc.numPages }, (_, i) => <Page key={i} doc={doc} number={i + 1} width={Math.round(width * zoom)} />)}
      </div>
    </div>
  )
}

function Page({ doc, number, width }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    let task = null
    let cancelled = false
    doc.getPage(number).then((page) => {
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const ratio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: (width / base.width) * ratio })
      const canvas = canvasRef.current
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      canvas.style.width = `${width}px`
      canvas.style.height = `${Math.round(viewport.height / ratio)}px`
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport })
      task.promise.catch(() => {}) // a newer render replaced this one
    })
    return () => { cancelled = true; task?.cancel() }
  }, [doc, number, width])
  return <canvas ref={canvasRef} className="pdfp-page" aria-label={`Page ${number}`} />
}
