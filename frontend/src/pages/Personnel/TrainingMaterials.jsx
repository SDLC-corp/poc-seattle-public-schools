import { useEffect, useRef, useState } from 'react'
import { X, Plus, FileText, Film, Image as ImageIcon, Link2, Pencil, Trash2, Paperclip, ExternalLink, Download } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { useConfirm } from '../../components/ui/useConfirm'
import { API_BASE, request, uploadFile, fmtDate } from '../../lib/api'

const MAX_MB = 100
const KINDS = {
  pdf: { label: 'PDF', icon: FileText },
  video: { label: 'Video', icon: Film },
  image: { label: 'Image', icon: ImageIcon },
  link: { label: 'Link', icon: Link2 },
}
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.mp4,.webm,application/pdf,image/*,video/mp4,video/webm'
export const fileUrl = (m, download) => `${API_BASE}/personnel/materials/${m.id}/file${download ? '?download=1' : ''}`
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

// Add / edit a material: a file (PDF, image, video) or a link
function MaterialForm({ material, meta, programId, onClose, onSaved }) {
  const isNew = !material
  const [form, setForm] = useState(() => ({
    programId: material?.programId ?? programId ?? meta.programs[0].id,
    title: material?.title ?? '',
    description: material?.description ?? '',
    source: material?.kind === 'link' ? 'link' : 'file',
    url: material?.url ?? '',
    file: null,
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const pick = (file) => {
    if (!file) return
    if (file.size > MAX_MB * 1048576) { setErrors((e) => ({ ...e, file: `The file is larger than ${MAX_MB} MB` })); return }
    setErrors(({ file: _drop, ...rest }) => rest)
    setForm((f) => ({ ...f, file, title: f.title || file.name.replace(/\.[^.]+$/, '') }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!form.title.trim()) errs.title = 'Title is required'
    if (isNew && form.source === 'file' && !form.file) errs.file = 'Choose a file to upload'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    setErrors({})
    const { programId: pid, title, description, url } = form
    try {
      let saved
      if (isNew && form.source === 'file') saved = await uploadFile('/personnel/materials', form.file, { programId: pid, title, description })
      else if (isNew) saved = await request('/personnel/materials/link', { method: 'POST', body: { programId: pid, title, description, url } })
      else {
        saved = await request(`/personnel/materials/${material.id}`, { method: 'PUT', body: { programId: pid, title, description, ...(material.kind === 'link' ? { url } : {}) } })
        if (form.file) saved = await uploadFile(`/personnel/materials/${material.id}/file`, form.file)
      }
      onSaved(saved, isNew)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const input = (k, props = {}) => ({ className: `u-input${errors[k] ? ' invalid' : ''}`, value: form[k], onChange: (ev) => set(k)(ev.target.value), ...props })
  const canFile = isNew ? form.source === 'file' : material.kind !== 'link'

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="u-modal" role="dialog" aria-modal="true" aria-labelledby="tm-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="tm-title">{isNew ? 'Add Training Material' : 'Edit Training Material'}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body tm-form">
          <div className="uf-field">
            <span>Training Program *</span>
            <SearchSelect variant="field" label="Training program" value={form.programId} onChange={set('programId')} searchable={false}
              options={meta.programs.map((p) => ({ value: p.id, label: p.name }))} />
            {errors.programId && <em>{errors.programId}</em>}
          </div>
          {isNew && (
            <div className="uf-field">
              <span>Material Type</span>
              <div className="p-seg tm-src" role="group" aria-label="Material type">
                <button type="button" aria-pressed={form.source === 'file'} className={form.source === 'file' ? 'on' : undefined} onClick={() => set('source')('file')}><Paperclip size={13} />Upload File</button>
                <button type="button" aria-pressed={form.source === 'link'} className={form.source === 'link' ? 'on' : undefined} onClick={() => set('source')('link')}><Link2 size={13} />Add Link</button>
              </div>
            </div>
          )}
          {canFile && (
            <div className="uf-field">
              <span>{isNew ? 'File *' : 'Replace File'}</span>
              <button type="button" className={`tm-drop${errors.file ? ' invalid' : ''}`} onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}>
                {form.file
                  ? <><Paperclip size={16} /><strong>{form.file.name}</strong><small>{size(form.file.size)} · click to change</small></>
                  : <><Paperclip size={16} /><strong>{isNew ? 'Choose or drop a file' : `Current: ${material.file?.name}`}</strong><small>PDF, images (JPG, PNG, WebP) or video (MP4, WebM), up to {MAX_MB} MB</small></>}
              </button>
              <input ref={fileInput} type="file" hidden accept={ACCEPT} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
              {errors.file && <em>{errors.file}</em>}
            </div>
          )}
          {(isNew ? form.source === 'link' : material.kind === 'link') && (
            <label className="uf-field"><span>Link *</span>
              <input type="url" {...input('url')} placeholder="https://… (online course, hosted video, document)" />
              {errors.url && <em>{errors.url}</em>}
            </label>
          )}
          <label className="uf-field"><span>Title *</span><input {...input('title')} maxLength={120} />{errors.title && <em>{errors.title}</em>}</label>
          <label className="uf-field"><span>Description</span><textarea {...input('description')} rows={3} maxLength={400} placeholder="What this covers, who should complete it…" /></label>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add Material' : 'Save Changes'}</button>
        </footer>
      </form>
    </div>
  )
}

// View a file in place: PDF, video or image
function Viewer({ material, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const src = fileUrl(material)
  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal tm-viewer" role="dialog" aria-modal="true" aria-label={material.title}>
        <header className="u-modal-head">
          <h2>{material.title}<small>{material.programName}</small></h2>
          <span className="tm-viewer-acts">
            <a className="u-btn u-btn-outline u-btn-sm" href={fileUrl(material, true)}><Download size={13} />Download</a>
            <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </span>
        </header>
        <div className="tm-viewer-body">
          {material.kind === 'pdf' && <iframe src={src} title={material.title} />}
          {material.kind === 'video' && <video src={src} controls preload="metadata" />}
          {material.kind === 'image' && <img src={src} alt={material.title} />}
        </div>
      </div>
    </div>
  )
}

/**
 * Learning modules: the material for each training program (files or links), shown for the selected
 * program or all of them, with add / edit / replace / delete.
 */
export default function TrainingMaterials({ meta, materials, programId, onProgram, onChanged, notify }) {
  const [form, setForm] = useState(null) // { material? }
  const [viewing, setViewing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()
  const shown = (materials ?? []).filter((m) => !programId || m.programId === programId)
  const programName = meta.programs.find((p) => p.id === programId)?.name

  const remove = async (m) => {
    const ok = await confirm({ title: 'Delete training material?', message: `“${m.title}” will be removed from ${m.programName}.`, detail: m.file ? `The file ${m.file.name} is deleted too.` : undefined, confirmLabel: 'Delete', tone: 'danger' })
    if (!ok) return
    try {
      await request(`/personnel/materials/${m.id}`, { method: 'DELETE' })
      notify('success', `Deleted “${m.title}”.`)
      onChanged()
    } catch (err) {
      notify('error', `Couldn't delete “${m.title}” (${err.message}).`)
    }
  }

  const open = (m) => (m.kind === 'link' ? window.open(m.url, '_blank', 'noopener,noreferrer') : setViewing(m))

  return (
    <section className="u-card">
      <header className="u-card-head">
        <h2>Training Material {materials && <span>({shown.length})</span>}</h2>
        <span className="tm-head-acts">
          {programId && onProgram && <button type="button" className="p-link" onClick={() => onProgram('')}>Show all programs</button>}
          <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={() => setForm({})}><Plus size={14} />Add Material</button>
        </span>
      </header>
      {!materials ? <p className="u-muted">Loading…</p> : !shown.length ? (
        <div className="tm-empty">
          <FileText size={22} />
          <p>No material yet{programName ? ` for ${programName}` : ''}. Add PDFs, videos, images or links people can use to train.</p>
          <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setForm({})}><Plus size={14} />Add Material</button>
        </div>
      ) : (
        <ul className="tm-grid">
          {shown.map((m) => {
            const K = KINDS[m.kind] ?? KINDS.pdf
            return (
              <li key={m.id} className={`tm-card tm-${m.kind}`}>
                <button type="button" className="tm-thumb" onClick={() => open(m)} aria-label={`Open ${m.title}`}>
                  {m.kind === 'image' ? <img src={fileUrl(m)} alt="" loading="lazy" /> : <K.icon size={28} />}
                  <span className="tm-kind">{K.label}</span>
                </button>
                <div className="tm-body">
                  <button type="button" className="tm-title" onClick={() => open(m)}>{m.title}{m.kind === 'link' && <ExternalLink size={12} />}</button>
                  {m.sample && <span className="tm-sample" title="Sample material — replace with your district's content">Sample</span>}
                  {!programId && <small className="tm-prog">{m.programName}</small>}
                  {m.description && <p>{m.description}</p>}
                  <small className="tm-meta">{m.file ? `${m.file.name} · ${size(m.file.size)}` : m.url} · {fmtDate(m.updatedAt ?? m.createdAt)}</small>
                </div>
                <span className="tm-acts">
                  <button type="button" className="u-row-btn" aria-label={`Edit ${m.title}`} title="Edit / replace" onClick={() => setForm({ material: m })}><Pencil size={13} /></button>
                  <button type="button" className="u-row-btn" aria-label={`Delete ${m.title}`} title="Delete" onClick={() => remove(m)}><Trash2 size={13} /></button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {form && (
        <MaterialForm material={form.material} meta={meta} programId={programId} onClose={() => setForm(null)}
          onSaved={(saved, isNew) => { setForm(null); notify('success', `${isNew ? 'Added' : 'Updated'} “${saved.title}”.`); onChanged() }} />
      )}
      {viewing && <Viewer material={viewing} onClose={() => setViewing(null)} />}
      {confirmDialog}
    </section>
  )
}
