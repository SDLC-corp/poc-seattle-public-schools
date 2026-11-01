import { useEffect, useState } from 'react'
import { X, Download, Trash2, FileX2, Info, ArrowLeft } from 'lucide-react'
import { ActionBadge } from '../Audit/ActionBadge'
import { FileBadge, SourceLabel } from './docUtils'
import { fmtSize, isPreviewable } from './docMeta'
import { fmtDateTime } from '../../lib/api'

const TABS = [{ id: 'details', label: 'Details' }, { id: 'activity', label: 'Activity Log' }]

function Row({ label, children }) {
  return (
    <div className="ad-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Preview({ doc }) {
  const src = `/api/documents/${doc.id}/file`
  if (!doc.hasFile) {
    return (
      <div className="dp-empty">
        <FileX2 size={30} />
        <strong>No file stored</strong>
        <span>{doc.sample ? 'This is a sample record created for the demo, so there is no file to preview.' : 'The stored file is missing.'}</span>
      </div>
    )
  }
  if (!isPreviewable(doc)) {
    return (
      <div className="dp-empty">
        <FileBadge ext={doc.ext} size={30} />
        <strong>Preview not available</strong>
        <span>{doc.ext.toUpperCase()} files can't be shown in the browser. Download to open it.</span>
      </div>
    )
  }
  if (['png', 'jpg', 'jpeg', 'webp'].includes(doc.ext)) return <img className="dp-image" src={src} alt={doc.name} />
  // PDFs and text open in the browser's own viewer. (No iframe sandbox: Chrome refuses to render
  // PDFs inside one. Safety comes from the server only storing whitelisted types and sending
  // a fixed Content-Type with nosniff, so nothing uploaded can be served as HTML/script.)
  return <iframe className="dp-frame" src={src} title={`Preview of ${doc.name}`} />
}

export default function DocumentPreview({ doc, onClose, onDelete }) {
  const [tab, setTab] = useState('details')
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 4000)
    return () => clearTimeout(t)
  }, [confirm])

  if (!doc) return <aside className="u-card d-preview d-preview-empty">Select a document to preview it.</aside>

  return (
    <aside className="u-card d-preview" aria-label="Document preview">
      <header className="dp-head">
        <button type="button" className="u-row-btn dp-back" onClick={onClose} aria-label="Close preview"><ArrowLeft size={15} /></button>
        <h2 title={doc.name}>{doc.name}</h2>
        <button type="button" className="u-row-btn dp-close" onClick={onClose} aria-label="Close preview"><X size={15} /></button>
      </header>

      <div className="dp-viewer"><Preview doc={doc} /></div>

      <nav className="ud-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'details' && (
        <dl className="dp-details">
          <Row label="File Name">{doc.name}</Row>
          <Row label="Document Type">{doc.type}</Row>
          <Row label="School">{doc.schoolName ?? 'District-wide'}</Row>
          <Row label="Building">{doc.buildingName ?? '—'}</Row>
          <Row label="Related To">{doc.relatedTo}</Row>
          <Row label="File Size">{fmtSize(doc.size)}</Row>
          <Row label="Uploaded On">{fmtDateTime(doc.uploadedAt)}</Row>
          <Row label="Uploaded By">{doc.uploadedBy?.name ?? '—'}</Row>
          <Row label="Source"><SourceLabel source={doc.source} /></Row>
          <Row label="Access Level"><span className={`d-access ${doc.access.toLowerCase()}`}>{doc.access}</span></Row>
          {doc.sharepointPath && <Row label="SharePoint Path"><span className="a-mono dp-path">{doc.sharepointPath}</span></Row>}
          <Row label="Document ID"><span className="a-mono">{doc.id}</span></Row>
        </dl>
      )}
      {doc.sample && tab === 'details' && <p className="ad-sample"><Info size={13} />Sample record generated for this demo</p>}

      {tab === 'activity' && (
        doc.activity?.length ? (
          <ul className="dp-activity">
            {doc.activity.map((a) => (
              <li key={a.id}>
                <ActionBadge action={a.action} />
                <span>{a.summary}<small>{a.user} · {fmtDateTime(a.at)}</small></span>
              </li>
            ))}
          </ul>
        ) : <p className="u-muted u-small">No recorded activity for this document yet.</p>
      )}

      <footer className="dp-actions">
        <a className={`u-btn u-btn-primary u-btn-sm${doc.hasFile ? '' : ' disabled'}`}
          href={doc.hasFile ? `/api/documents/${doc.id}/file?download=1` : undefined}
          aria-disabled={!doc.hasFile} title={doc.hasFile ? undefined : 'No file stored for this record'}>
          <Download size={14} />Download
        </a>
        <button type="button" className={`u-btn u-btn-sm ${confirm ? 'u-btn-danger' : 'u-btn-ghost'}`}
          onClick={() => (confirm ? onDelete(doc) : setConfirm(true))}>
          <Trash2 size={14} />{confirm ? 'Confirm delete' : 'Delete'}
        </button>
      </footer>
    </aside>
  )
}
