import { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, PenSquare, Send, ExternalLink, X, Paperclip, Inbox } from 'lucide-react'
import { useGraph } from '../../auth/useGraph'
import { useConfirm } from '../../components/ui/useConfirm'
import ConnectGate from './ConnectGate'

const SELECT = 'subject,from,receivedDateTime,isRead,bodyPreview,webLink,hasAttachments,importance'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const fmt = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Compose({ g, onClose, onSent }) {
  const [confirm, confirmDialog] = useConfirm()
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '' })
  const [errors, setErrors] = useState({})
  const [sending, setSending] = useState(false)
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  const list = (v) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean)

  const send = async () => {
    const to = list(form.to)
    const cc = list(form.cc)
    const errs = {}
    if (!to.length) errs.to = 'Add at least one recipient'
    else if (to.some((x) => !EMAIL.test(x))) errs.to = 'Check the email addresses'
    if (cc.some((x) => !EMAIL.test(x))) errs.cc = 'Check the email addresses'
    if (!form.subject.trim()) errs.subject = 'Add a subject'
    if (Object.keys(errs).length) { setErrors(errs); return }
    // Email leaves the organization's control once sent, so confirm the recipients
    if (!(await confirm({ title: 'Send this email?', message: `“${form.subject.trim()}” will be sent from your mailbox to ${[...to, ...cc].join(', ')}.`, confirmLabel: 'Send' }))) return
    setSending(true)
    try {
      await g.call('/me/sendMail', {
        method: 'POST',
        body: {
          message: {
            subject: form.subject.trim(),
            body: { contentType: 'Text', content: form.body },
            toRecipients: to.map((address) => ({ emailAddress: { address } })),
            ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: true,
        },
      })
      onSent(`Email sent to ${to.join(', ')}`)
    } catch (e) {
      setErrors({ form: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="u-card m365-compose" aria-label="New email">
      <header className="m365-pane-head">
        <h3><PenSquare size={16} />New Email</h3>
        <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
      </header>
      <label className="uf-field"><span>To</span><input className={`u-input${errors.to ? ' invalid' : ''}`} value={form.to} onChange={set('to')} placeholder="name@district.example; …" />{errors.to && <em className="uf-error">{errors.to}</em>}</label>
      <label className="uf-field"><span>Cc</span><input className={`u-input${errors.cc ? ' invalid' : ''}`} value={form.cc} onChange={set('cc')} />{errors.cc && <em className="uf-error">{errors.cc}</em>}</label>
      <label className="uf-field"><span>Subject</span><input className={`u-input${errors.subject ? ' invalid' : ''}`} value={form.subject} maxLength={255} onChange={set('subject')} />{errors.subject && <em className="uf-error">{errors.subject}</em>}</label>
      <label className="uf-field"><span>Message</span><textarea className="u-input sv-textarea" rows={8} value={form.body} onChange={set('body')} /></label>
      {errors.form && <p className="uf-error">{errors.form}</p>}
      <footer className="m365-compose-foot">
        <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Discard</button>
        <button type="button" className="u-btn u-btn-primary" onClick={send} disabled={sending}><Send size={14} />{sending ? 'Sending…' : 'Send'}</button>
      </footer>
      {confirmDialog}
    </section>
  )
}

export default function MailTab({ onToast }) {
  const g = useGraph('outlook')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)
  const [composing, setComposing] = useState(false)
  const [reload, setReload] = useState(0)

  const { call } = g
  const load = useCallback(async (term) => {
    const path = term
      ? `/me/messages?$search="${encodeURIComponent(term.replace(/"/g, ''))}"&$top=25&$select=${SELECT}`
      : `/me/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime desc&$select=${SELECT}`
    return (await call(path)).value
  }, [call])

  useEffect(() => {
    if (g.status !== 'connected') return undefined
    let cancelled = false
    load(search).then((v) => { if (!cancelled) { setData(v); setError(null) } }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [g.status, load, search, reload])

  const selected = data?.find((m) => m.id === open)

  return (
    <ConnectGate g={g} name="Outlook" what="Read your inbox and send email from your own mailbox.">
      <div className="m365-toolbar">
        <form className="u-search m365-search" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()) }}>
          <Search size={15} />
          <input type="search" placeholder="Search mail…" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setSearch('') }} aria-label="Search mail" />
        </form>
        <button type="button" className="u-btn u-btn-outline" onClick={() => setReload((n) => n + 1)}><RefreshCw size={14} />Refresh</button>
        <button type="button" className="u-btn u-btn-primary" onClick={() => setComposing(true)}><PenSquare size={14} />New Email</button>
      </div>
      {error && <div className="u-banner">Couldn't load mail ({error}).</div>}

      <div className={`m365-mail${composing || selected ? ' with-pane' : ''}`}>
        <section className="u-card m365-list">
          <h3 className="m365-list-title"><Inbox size={16} />{search ? `Results for “${search}”` : 'Inbox'}</h3>
          {!data && !error && <p className="u-muted sv-empty-line">Loading…</p>}
          {data && !data.length && <p className="u-muted sv-empty-line">No messages.</p>}
          <ul>
            {data?.map((m) => (
              <li key={m.id}>
                <button type="button" className={`m365-msg${m.isRead ? '' : ' unread'}${m.id === open ? ' active' : ''}`} onClick={() => { setOpen(m.id); setComposing(false) }}>
                  <span className="m365-msg-top">
                    <strong>{m.from?.emailAddress?.name || m.from?.emailAddress?.address || '(no sender)'}</strong>
                    <time>{fmt(m.receivedDateTime)}</time>
                  </span>
                  <span className="m365-msg-subject">{m.hasAttachments && <Paperclip size={12} />}{m.subject || '(no subject)'}</span>
                  <span className="m365-msg-preview">{m.bodyPreview}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {composing && <Compose g={g} onClose={() => setComposing(false)} onSent={(text) => { setComposing(false); onToast({ kind: 'success', text }) }} />}
        {!composing && selected && (
          <section className="u-card m365-reader">
            <header className="m365-pane-head">
              <h3>{selected.subject || '(no subject)'}</h3>
              <button type="button" className="u-row-btn" onClick={() => setOpen(null)} aria-label="Close"><X size={15} /></button>
            </header>
            <p className="m365-from">{selected.from?.emailAddress?.name} &lt;{selected.from?.emailAddress?.address}&gt; · {new Date(selected.receivedDateTime).toLocaleString('en-US')}</p>
            <p className="m365-preview">{selected.bodyPreview}</p>
            <a href={selected.webLink} target="_blank" rel="noreferrer" className="u-btn u-btn-outline u-btn-sm"><ExternalLink size={13} />Open in Outlook</a>
          </section>
        )}
      </div>
    </ConnectGate>
  )
}
