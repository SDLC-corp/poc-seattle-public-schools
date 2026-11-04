import { useEffect, useRef, useState } from 'react'
import { X, Milestone, Paperclip, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, uploadFile } from '../../lib/api'

// Stages that can be set by hand (the earlier ones follow the form workflow)
const MANUAL = ['lab', 'action', 'followUp', 'closed']
// Usual document type for each stage's reports
const STAGE_DOC = { lab: 'Laboratory Report', action: 'Work Completion Report', followUp: 'Supporting Document', closed: 'Supporting Document' }
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10
const isImage = (f) => /^image\//.test(f.type)
const size = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/**
 * Change an inspection's stage by hand, with a reason (kept in the stage history and timeline), and/or add
 * reports and photos for the stage. "Automatic" drops a manual stage. Closing needs an approved inspection.
 */
export default function StageDialog({ record, lifecycle, meta, onClose, onDone }) {
  const [stage, setStage] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  const [category, setCategory] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const label = (id) => lifecycle.stages.find((s) => s.id === id)?.label ?? id
  const options = [
    ...(lifecycle.override ? [{ id: 'auto', title: `Automatic – ${label(lifecycle.override.auto)}`, hint: 'Follow the inspection’s findings again' }] : []),
    ...MANUAL.map((id) => ({
      id, title: label(id), hint: lifecycle.stages.find((s) => s.id === id)?.hint,
      disabled: id === lifecycle.current || (id === 'closed' && record.state !== 'approved'),
      why: id === lifecycle.current ? 'Current stage' : id === 'closed' && record.state !== 'approved' ? 'Needs approval first' : null,
    })),
  ]
  const targetStage = stage && stage !== 'auto' ? stage : lifecycle.current
  const docType = category || STAGE_DOC[targetStage] || 'Supporting Document'
  const changing = Boolean(stage)

  const addFiles = (list) => {
    const picked = [...list]
    const bad = picked.filter((f) => !/\.(pdf|jpe?g|png|webp)$/i.test(f.name) || f.size > MAX_BYTES)
    const ok = picked.filter((f) => !bad.includes(f))
    setFiles((cur) => [...cur, ...ok].slice(0, MAX_FILES))
    setErrors((e) => ({ ...e, files: bad.length ? `${bad.map((f) => f.name).join(', ')}: use a PDF, JPG, PNG or WebP of up to 10 MB` : undefined }))
  }

  const save = async () => {
    setErrors({})
    let res = null
    try {
      if (changing) {
        setSaving('stage')
        res = await request(`/inspection-records/records/${record.id}/stage`, { method: 'POST', body: { stage, note } })
      }
      const failed = []
      for (const [i, f] of files.entries()) {
        setSaving(`Uploading ${i + 1} of ${files.length}…`)
        try {
          await uploadFile(`/inspection-records/records/${record.id}/stage-documents`, f, { category: isImage(f) && docType.endsWith('Report') ? 'After Work Photo' : docType })
        } catch (e) {
          failed.push(`${f.name} (${e.message})`)
        }
      }
      // Reload the record so the documents and stage show up
      const fresh = await request(`/inspection-records/records/${record.id}`)
      const parts = [changing && `Stage changed to ${stage === 'auto' ? 'automatic' : label(stage)}`, files.length - failed.length > 0 && `${files.length - failed.length} file${files.length - failed.length === 1 ? '' : 's'} uploaded`]
      onDone(fresh, `${parts.filter(Boolean).join(' · ')}.`, failed)
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
      if (res) onDone(await request(`/inspection-records/records/${record.id}`), 'Stage changed; the files could not be uploaded.', [])
    } finally {
      setSaving('')
    }
  }

  const canSave = !saving && (changing ? stage === 'auto' || note.trim() : files.length > 0)

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal ai-add in-stage-modal" role="dialog" aria-modal="true" aria-labelledby="in-stage-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="in-stage-title"><Milestone size={18} />Change Stage – {record.id}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <p className="u-muted ai-add-intro">
            Current stage: <strong>{label(lifecycle.current)}</strong>{lifecycle.override ? ' (set manually)' : ''}.
            A manual stage holds until the inspection’s findings change it (e.g. a lab result or completed action items).
          </p>
          <div className="in-stage-opts" role="radiogroup" aria-label="New stage">
            {options.map((o) => (
              <label key={o.id} className={`in-stage-opt${stage === o.id ? ' on' : ''}${o.disabled ? ' disabled' : ''}`}>
                <input type="radio" name="stage" value={o.id} checked={stage === o.id} disabled={o.disabled} onChange={() => setStage(o.id)} />
                <span><strong>{o.title}</strong>{o.why ? <em>{o.why}</em> : <small>{o.hint}</small>}</span>
              </label>
            ))}
          </div>
          {errors.stage && <em className="uf-error">{errors.stage}</em>}
          {changing && stage !== 'auto' && (
            <label className="uf-field in-stage-note">
              <span>Reason *</span>
              <textarea className={`u-input sv-textarea${errors.note ? ' invalid' : ''}`} rows={3} maxLength={500} value={note}
                onChange={(e) => setNote(e.target.value)} placeholder="Why the stage is being changed…" />
              {errors.note && <em className="uf-error">{errors.note}</em>}
            </label>
          )}

          <div className="in-stage-docs">
            <div className="in-stage-docs-head">
              <span><Paperclip size={14} />Reports &amp; Photos <small className="u-muted">(optional)</small></span>
              <div className="in-stage-docs-type">
                <SearchSelect variant="field" label="Document type" value={docType} onChange={setCategory} searchable={false}
                  options={(meta?.docCategories ?? [docType]).map((c) => ({ value: c, label: c }))} />
              </div>
            </div>
            <div className={`in-stage-drop${files.length ? ' has-files' : ''}`}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
                <Paperclip size={13} />Add files
              </button>
              <span className="u-muted">or drop them here · PDF, JPG, PNG or WebP, up to 10 MB each</span>
              <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            </div>
            {files.length > 0 && (
              <ul className="in-stage-files">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    {isImage(f) ? <ImageIcon size={14} /> : <FileText size={14} />}
                    <span className="in-stage-file-name" title={f.name}>{f.name}</span>
                    <small className="u-muted">{size(f.size)}</small>
                    <button type="button" className="u-row-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            {errors.files && <em className="uf-error">{errors.files}</em>}
            {files.length > 0 && <small className="u-muted">Saved as “{docType}”{docType.endsWith('Report') && files.some(isImage) ? ' (photos as “After Work Photo”)' : ''} under {label(targetStage)}.</small>}
          </div>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={!canSave} onClick={save}>
            {saving ? (saving === 'stage' ? 'Saving…' : saving) : changing ? (files.length ? 'Change Stage & Upload' : 'Change Stage') : 'Upload Files'}
          </button>
        </footer>
      </div>
    </div>
  )
}
