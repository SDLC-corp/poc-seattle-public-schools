import { useEffect, useRef } from 'react'

/**
 * Draw-to-sign box. `value` is a PNG data URL (or null); `onChange` gets the new image after each stroke.
 * A saved signature is shown as an image until it's cleared.
 */
export default function SignaturePad({ value, onChange, invalid, label }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)

  // Size the canvas to its box (sharp on high-DPI screens) whenever the pad is shown empty
  useEffect(() => {
    if (value) return
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b1f33'
  }, [value])

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...point(e))
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(...point(e))
    ctx.stroke()
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div className={`sv-sign${invalid ? ' invalid' : ''}`}>
      {value
        ? <img src={value} alt={`Signature of ${label}`} />
        : (
          <canvas ref={canvasRef} aria-label={`Sign here${label ? ` (${label})` : ''}`} role="img"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        )}
      {!value && <span className="sv-sign-hint" aria-hidden="true">Sign here</span>}
    </div>
  )
}
