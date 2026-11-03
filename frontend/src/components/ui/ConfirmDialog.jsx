import { useEffect, useRef } from 'react'
import { TriangleAlert, CircleHelp, X } from 'lucide-react'
import '../../pages/Users/users.css'
import './confirm-dialog.css'

/**
 * In-app confirmation dialog (replaces the browser's window.confirm).
 * tone: 'danger' (red confirm button, warning icon) | 'default'
 * Escape or a click outside cancels; Cancel has focus first, so Enter never deletes by accident.
 */
export default function ConfirmDialog({ title, message, detail, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', onClose }) {
  const cancelRef = useRef(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Icon = tone === 'danger' ? TriangleAlert : CircleHelp
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false) }}>
      <div className={`u-modal cd-dialog ${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="cd-title" aria-describedby="cd-message">
        <button type="button" className="cd-close" onClick={() => onClose(false)} aria-label="Close"><X size={16} /></button>
        <div className="cd-body">
          <span className="cd-icon"><Icon size={22} /></span>
          <div>
            <h2 id="cd-title">{title}</h2>
            <p id="cd-message">{message}</p>
            {detail && <p className="cd-detail">{detail}</p>}
          </div>
        </div>
        <footer className="u-modal-foot cd-foot">
          <button ref={cancelRef} type="button" className="u-btn u-btn-outline" onClick={() => onClose(false)}>{cancelLabel}</button>
          <button type="button" className={`u-btn ${tone === 'danger' ? 'u-btn-danger' : 'u-btn-primary'}`} onClick={() => onClose(true)}>{confirmLabel}</button>
        </footer>
      </div>
    </div>
  )
}
