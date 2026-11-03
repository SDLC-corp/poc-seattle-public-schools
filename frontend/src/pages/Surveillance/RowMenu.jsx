import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

// "⋯" row menu; items: [{ icon: Icon, label, onClick, danger? }]
export default function RowMenu({ label, items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="ai-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="ai-menu" role="menu">
          {items.filter(Boolean).map(({ icon: Icon, label: text, onClick, danger }) => (
            <button key={text} type="button" role="menuitem" className={danger ? 'danger' : undefined}
              onClick={(e) => { e.stopPropagation(); setOpen(false); onClick() }}>
              <Icon size={14} />{text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
