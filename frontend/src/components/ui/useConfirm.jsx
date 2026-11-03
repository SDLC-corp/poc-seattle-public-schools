import { useCallback, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

/**
 * const [confirm, confirmDialog] = useConfirm()
 * if (!(await confirm({ title, message, detail, confirmLabel, tone: 'danger' }))) return
 * …and render {confirmDialog} somewhere in the page.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), [])
  const close = useCallback((ok) => {
    request?.resolve(ok)
    setRequest(null)
  }, [request])
  const dialog = request ? <ConfirmDialog {...request} onClose={close} /> : null
  return [confirm, dialog]
}
