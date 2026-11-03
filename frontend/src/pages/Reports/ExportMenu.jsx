import { useEffect, useRef, useState } from 'react'
import { Download, ChevronDown, FileSpreadsheet, Printer } from 'lucide-react'

export default function ExportMenu({ csvHref, title }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="rp-export" ref={rootRef}>
      <button type="button" className="u-btn u-btn-primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download size={15} />Export<ChevronDown size={14} />
      </button>
      {open && (
        <div className="rp-menu" role="menu">
          <a role="menuitem" href={csvHref} download onClick={() => setOpen(false)}>
            <FileSpreadsheet size={15} />
            <span>CSV spreadsheet<small>{title} with the current filters</small></span>
          </a>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setTimeout(() => window.print(), 50) }}>
            <Printer size={15} />
            <span>Print / Save as PDF<small>This page as shown</small></span>
          </button>
        </div>
      )}
    </div>
  )
}
