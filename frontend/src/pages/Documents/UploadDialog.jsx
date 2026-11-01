import { useEffect, useMemo, useRef, useState } from 'react'
import { X, UploadCloud } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { FileBadge } from './docUtils'
import { fmtSize } from './docMeta'

const ACCESS_HINTS = {
  Public: 'Anyone who can sign in to the platform',
  Internal: 'District staff and assigned contractors',
  Restricted: 'EHS and facilities leads only',
}

// Upload a file with metadata. Uses XHR (not fetch) to report upload progress.
export default function UploadDialog({ facets, schools, buildings, defaultType, onClose, onUploaded }) {
  const [file, setFile] = useState(null)
  const [meta, setMeta] = useState({
    name: '', type: defaultType ?? '', schoolId: '', buildingId: '', relatedTo: '', access: 'Internal',
  })
  const [errors, setErrors] = useState({})
  const [progress, setProgress] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)
  const xhrRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && progress === null) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, progress])

  // Abort an in-flight upload if the dialog unmounts
  useEffect(() => () => xhrRef.current?.abort(), [])

  const set = (key) => (value) => setMeta((m) => ({ ...m, [key]: value, ...(key === 'schoolId' ? { buildingId: '' } : {}) }))
  const schoolBuildings = useMemo(() => buildings.filter((b) => b.schoolId === meta.schoolId), [buildings, meta.schoolId])
  const allowed = facets.allowedExtensions ?? []

  const pickFile = (f) => {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    const next = {}
    if (!allowed.includes(ext)) next.file = `.${ext} files aren't allowed (use ${allowed.join(', ')})`
    else if (f.size > facets.maxUploadBytes) next.file = `File is larger than ${fmtSize(facets.maxUploadBytes)}`
    setErrors(next)
    if (next.file) return
    setFile(f)
    setMeta((m) => ({ ...m, name: m.name || f.name }))
  }

  const submit = (e) => {
    e.preventDefault()
    const local = {}
    if (!file) local.file = 'Choose a file to upload'
    if (!meta.name.trim()) local.name = 'File name is required'
    else if (!allowed.includes(meta.name.split('.').pop().toLowerCase())) local.name = 'Keep a supported file extension'
    if (!meta.type) local.type = 'Choose a document type'
    if (Object.keys(local).length) { setErrors(local); return }

    const params = new URLSearchParams({ ...meta, name: meta.name.trim() })
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('POST', `/api/documents?${params}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100)) }
    xhr.onload = () => {
      xhrRef.current = null
      let body = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* non-JSON error */ }
      if (xhr.status === 201) onUploaded(body)
      else {
        setProgress(null)
        setErrors(body.fields ?? { form: body.error || `Upload failed (HTTP ${xhr.status})` })
      }
    }
    xhr.onerror = () => {
      xhrRef.current = null
      setProgress(null)
      setErrors({ form: 'Upload failed — is the backend running?' })
    }
    setProgress(0)
    setErrors({})
    xhr.send(file)
  }

  const uploading = progress !== null

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !uploading) onClose() }}>
      <form className="u-modal" role="dialog" aria-modal="true" aria-labelledby="up-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="up-title">Upload Document</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={uploading} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="u-modal-body">
          <div
            className={`d-drop${dragging ? ' over' : ''}${errors.file ? ' invalid' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files?.[0]) }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          >
            {file ? (
              <div className="d-drop-file">
                <FileBadge ext={file.name.split('.').pop().toLowerCase()} size={22} />
                <span><strong>{file.name}</strong><small>{fmtSize(file.size)} · click to choose a different file</small></span>
              </div>
            ) : (
              <>
                <UploadCloud size={28} />
                <strong>Drag a file here or click to browse</strong>
                <small>{allowed.map((x) => x.toUpperCase()).join(', ')} · up to {fmtSize(facets.maxUploadBytes)}</small>
              </>
            )}
            <input ref={inputRef} type="file" hidden accept={allowed.map((x) => `.${x}`).join(',')}
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {errors.file && <em className="uf-error">{errors.file}</em>}

          <div className="uf-grid d-upload-grid">
            <label className="uf-field uf-wide">
              <span>File Name *</span>
              <input className={`u-input${errors.name ? ' invalid' : ''}`} value={meta.name} onChange={(e) => set('name')(e.target.value)} />
              {errors.name && <em>{errors.name}</em>}
            </label>
            <div className="uf-field">
              <span>Document Type *</span>
              <SearchSelect variant="field" label="Document type" value={meta.type} onChange={set('type')}
                options={[{ value: '', label: 'Select a type…' }, ...facets.types.map((t) => ({ value: t, label: t }))]} />
              {errors.type && <em>{errors.type}</em>}
            </div>
            <label className="uf-field">
              <span>Related To</span>
              <input className="u-input" placeholder="e.g. Room 205, Sample #014" value={meta.relatedTo} onChange={(e) => set('relatedTo')(e.target.value)} />
            </label>
            <div className="uf-field">
              <span>School</span>
              <SearchSelect variant="field" label="School" value={meta.schoolId} onChange={set('schoolId')} searchPlaceholder="Search schools…"
                options={[{ value: '', label: 'District-wide (no school)' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
              {errors.schoolId && <em>{errors.schoolId}</em>}
            </div>
            <div className="uf-field">
              <span>Building</span>
              <SearchSelect variant="field" label="Building" value={meta.buildingId} onChange={set('buildingId')} searchable={false}
                options={[
                  { value: '', label: meta.schoolId ? 'Whole school' : 'Choose a school first' },
                  ...schoolBuildings.map((b) => ({ value: b.id, label: b.name })),
                ]} />
              {errors.buildingId && <em>{errors.buildingId}</em>}
            </div>
          </div>

          <fieldset className="uf-access">
            <legend>Access Level</legend>
            <div className="d-access-options">
              {(facets.accessLevels ?? []).map((a) => (
                <label key={a} className={`uf-scope${meta.access === a ? ' on' : ''}`}>
                  <input type="radio" name="access" checked={meta.access === a} onChange={() => set('access')(a)} />
                  <span><strong>{a}</strong><small>{ACCESS_HINTS[a]}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          {uploading && (
            <div className="d-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
              <small>{progress < 100 ? `Uploading… ${progress}%` : 'Processing…'}</small>
            </div>
          )}
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>

        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={uploading}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
        </footer>
      </form>
    </div>
  )
}
