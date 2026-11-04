import { useEffect, useRef, useState } from 'react'
import { X, Plus, Info, Pencil, Link2, FileText, Paperclip, Trash2 } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { TrainingStatus, CategoryBadge, personStatus } from './personnelMeta'
import { API_BASE, request, uploadFile } from '../../lib/api'

const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const MAX_FILE_MB = 10

// Expiry from the program's renewal period (the form fills it in; the user may change it)
function defaultExpiry(prog, completedOn) {
  if (!prog?.renewalMonths || !completedOn) return ''
  const d = new Date(`${completedOn}T00:00:00`)
  d.setMonth(d.getMonth() + prog.renewalMonths)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Records saved before certificates had ids are addressed by program + completion date
const recordPath = (personId, r) => (r.id
  ? `/personnel/${personId}/records/${r.id}`
  : `/personnel/${personId}/records/legacy?${new URLSearchParams({ programId: r.programId, completedOn: r.completedOn })}`)
const fileHref = (personId, r) => `${API_BASE}/personnel/${personId}/records/${r.id}/certificate`

function CertLinks({ personId, record }) {
  if (!record?.certificateUrl && !record?.certificateFile) return null
  return (
    <span className="p-cert-links">
      {record.certificateUrl && <a href={record.certificateUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Link2 size={12} />Link</a>}
      {record.certificateFile && <a href={fileHref(personId, record)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><FileText size={12} />Certificate</a>}
    </span>
  )
}

/**
 * Right-side drawer: a person's required certificates and history, with a form to add or update a certificate
 * (type, number, issue / expiry dates, provider, link and file). People themselves sync from school data.
 * startOnForm: open straight on the certificate form — true (the list's "Update certificate" action) or a record
 * { id, programId, completedOn } to update (Training Records' "Update").
 */
export default function PersonDrawer({ personId, meta, startOnForm, onClose, onChanged, notify }) {
  const [person, setPerson] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [form, setForm] = useState(null) // { record?, programId, certificateNo, completedOn, expiresOn, provider, certificateUrl, file, removeFile }
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [maxDay] = useState(today)
  const fileInput = useRef(null)
  const opened = useRef(false)

  useEffect(() => {
    let cancelled = false
    request(`/personnel/${personId}`).then((p) => { if (!cancelled) setPerson(p) }).catch(() => {})
    return () => { cancelled = true }
  }, [personId, reloadKey])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const programs = meta.programs
  const prog = (id) => programs.find((p) => p.id === id)

  const openForm = (programId, record = null) => {
    setErrors({})
    const p = prog(record?.programId ?? programId)
    setForm(record
      ? { record, programId: record.programId, certificateNo: record.certificateNo ?? '', completedOn: record.completedOn, expiresOn: record.expiresOn ?? '',
          provider: record.provider ?? '', certificateUrl: record.certificateUrl ?? '', file: null, removeFile: false }
      : { record: null, programId: p.id, certificateNo: '', completedOn: maxDay, expiresOn: defaultExpiry(p, maxDay), provider: '', certificateUrl: '', file: null, removeFile: false })
  }

  // Opened from the list for a specific person: start on their first certificate that needs attention
  useEffect(() => {
    if (!person || opened.current || !startOnForm) return
    opened.current = true
    // A specific certificate (from Training Records), else the first one that needs attention
    const pick = typeof startOnForm === 'object'
      && person.history.find((r) => (startOnForm.id ? r.id === startOnForm.id : r.programId === startOnForm.programId && r.completedOn === startOnForm.completedOn))
    if (pick) { openForm(null, pick); return }
    const need = person.required.find((r) => r.status !== 'valid') ?? person.required[0]
    if (need?.record) openForm(null, need.record)
    else openForm(need?.programId ?? programs[0].id)
  }, [person, startOnForm])

  const set = (k) => (v) => setForm((f) => {
    const next = { ...f, [k]: v }
    // Keep the suggested expiry in step with the type / completion date unless the user changed it
    if ((k === 'programId' || k === 'completedOn') && f.expiresOn === defaultExpiry(prog(f.programId), f.completedOn)) {
      next.expiresOn = defaultExpiry(prog(next.programId), next.completedOn)
    }
    return next
  })

  const pickFile = (file) => {
    if (!file) return
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setErrors((e) => ({ ...e, file: `The file is larger than ${MAX_FILE_MB} MB` })); return }
    setErrors(({ file: _drop, ...rest }) => rest)
    setForm((f) => ({ ...f, file, removeFile: false }))
  }

  const save = async () => {
    setSaving(true)
    setErrors({})
    const { record, file, removeFile, ...body } = form
    try {
      const saved = record
        ? await request(recordPath(personId, record), { method: 'PUT', body })
        : await request(`/personnel/${personId}/records`, { method: 'POST', body })
      let fileNote = ''
      try {
        if (file) await uploadFile(`/personnel/${personId}/records/${saved.recordId}/certificate`, file)
        else if (removeFile && record?.certificateFile) await request(`/personnel/${personId}/records/${saved.recordId}/certificate`, { method: 'DELETE' })
      } catch (err) {
        fileNote = ` The certificate file wasn't saved (${err.message}).`
      }
      notify(fileNote ? 'error' : 'success', `${record ? 'Updated' : 'Recorded'} ${prog(form.programId).name} for ${saved.name}.${fileNote}`)
      setForm(null)
      setReloadKey((k) => k + 1)
      onChanged()
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const p = form && prog(form.programId)
  const currentFile = form?.record?.certificateFile && !form.removeFile ? form.record.certificateFile : null

  return (
    <>
      <div className="p-drawer-backdrop" onClick={onClose} />
      <aside className="u-card p-drawer" aria-label="Person details">
        <header className="u-card-head">
          <h2>Training &amp; Certificates</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </header>
        {!person ? <p className="c-details-empty">Loading…</p> : (
          <>
            <div className="p-hero">
              <span className="ud-avatar">{person.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
              <div>
                <strong>{person.name}</strong>
                <span>{person.organization}</span>
                <span className="p-hero-badges"><CategoryBadge person={person} /><TrainingStatus status={personStatus(person)} /></span>
              </div>
            </div>
            <dl className="cd-facts">
              <div className="cd-row"><dt>Person ID</dt><dd className="a-mono">{person.id}</dd></div>
              <div className="cd-row"><dt>Email</dt><dd>{person.email ?? '—'}</dd></div>
              <div className="cd-row"><dt>School</dt><dd>{person.schoolName ?? 'District-wide'}</dd></div>
            </dl>

            <h3 className="cd-h">Required Certificates</h3>
            <ul className="p-req">
              {person.required.map((r) => (
                <li key={r.programId}>
                  <div>
                    <strong>{r.programName}</strong>
                    <small>
                      {r.record ? `Issued ${fmt(r.record.completedOn)} · ${r.record.expiresOn ? `expires ${fmt(r.record.expiresOn)}` : 'no expiry'}` : 'No certificate on file'}
                      {r.record?.certificateNo && ` · No. ${r.record.certificateNo}`}
                    </small>
                    <CertLinks personId={person.id} record={r.record} />
                  </div>
                  <TrainingStatus status={r.status} />
                  <span className="p-req-acts">
                    {r.record && <button type="button" className="p-link" onClick={() => openForm(null, r.record)}>Update</button>}
                    {r.status !== 'valid' && <button type="button" className="p-link" onClick={() => openForm(r.programId)}>{r.record ? 'Renew' : 'Add'}</button>}
                  </span>
                </li>
              ))}
            </ul>

            {form ? (
              <div className="p-add">
                <h3 className="cd-h">{form.record ? 'Update Certificate' : 'Add Certificate'}</h3>
                <div className="uf-field">
                  <span>Certificate Type *</span>
                  <SearchSelect variant="field" label="Certificate type" value={form.programId} searchable={false} onChange={set('programId')}
                    options={programs.map((x) => ({ value: x.id, label: x.name }))} />
                  {errors.programId && <em>{errors.programId}</em>}
                </div>
                <label className="uf-field">
                  <span>Certificate No.{p?.accredited ? ' *' : ''}</span>
                  <input className={`u-input${errors.certificateNo ? ' invalid' : ''}`} value={form.certificateNo} placeholder={p?.accredited ? 'e.g. WA-INS-12345' : 'Optional'}
                    onChange={(e) => set('certificateNo')(e.target.value)} />
                  {errors.certificateNo && <em>{errors.certificateNo}</em>}
                </label>
                <div className="p-add-row">
                  <label className="uf-field">
                    <span>Issued / Completed *</span>
                    <input type="date" className={`u-input${errors.completedOn ? ' invalid' : ''}`} max={maxDay} value={form.completedOn}
                      onChange={(e) => set('completedOn')(e.target.value)} />
                    {errors.completedOn && <em>{errors.completedOn}</em>}
                  </label>
                  <label className="uf-field">
                    <span>Expiry Date</span>
                    <input type="date" className={`u-input${errors.expiresOn ? ' invalid' : ''}`} min={form.completedOn || undefined} value={form.expiresOn}
                      onChange={(e) => set('expiresOn')(e.target.value)} />
                    {errors.expiresOn && <em>{errors.expiresOn}</em>}
                  </label>
                </div>
                <label className="uf-field">
                  <span>Training Provider</span>
                  <input className="u-input" value={form.provider} placeholder="Optional" onChange={(e) => set('provider')(e.target.value)} />
                </label>
                <label className="uf-field">
                  <span>Certificate Link</span>
                  <input type="url" className={`u-input${errors.certificateUrl ? ' invalid' : ''}`} value={form.certificateUrl} placeholder="https://… (verification page or shared file)"
                    onChange={(e) => set('certificateUrl')(e.target.value)} />
                  {errors.certificateUrl && <em>{errors.certificateUrl}</em>}
                </label>
                <div className="uf-field">
                  <span>Certificate File</span>
                  <div className="p-file">
                    {form.file ? (
                      <span className="p-file-name"><Paperclip size={13} />{form.file.name}
                        <button type="button" className="u-row-btn" aria-label="Remove selected file" onClick={() => setForm((f) => ({ ...f, file: null }))}><X size={13} /></button>
                      </span>
                    ) : currentFile ? (
                      <span className="p-file-name"><FileText size={13} />
                        <a href={fileHref(person.id, form.record)} target="_blank" rel="noopener noreferrer">{currentFile.name}</a>
                        <button type="button" className="u-row-btn" aria-label="Remove certificate file" onClick={() => setForm((f) => ({ ...f, removeFile: true }))}><Trash2 size={13} /></button>
                      </span>
                    ) : <span className="u-muted">{form.removeFile ? 'File will be removed on save' : 'No file attached'}</span>}
                    <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileInput.current?.click()}>
                      <Paperclip size={13} />{form.file || currentFile ? 'Replace' : 'Attach'}
                    </button>
                    <input ref={fileInput} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                      onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
                  </div>
                  {errors.file ? <em>{errors.file}</em> : <small className="p-sub">PDF, JPG, PNG or WebP, up to {MAX_FILE_MB} MB</small>}
                </div>
                <p className="p-hint"><Info size={13} />{p?.renewalMonths ? `Renews every ${p.renewalMonths} months — expiry is filled in from the issue date.` : 'This certificate does not expire.'} {p?.basis}</p>
                {errors.form && <p className="uf-error">{errors.form}</p>}
                <div className="p-add-actions">
                  <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setForm(null)}>Cancel</button>
                  <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : form.record ? 'Save Changes' : 'Save Certificate'}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="u-btn u-btn-outline p-add-btn" onClick={() => openForm(person.required[0]?.programId ?? programs[0].id)}>
                <Plus size={15} />Add Certificate
              </button>
            )}

            <h3 className="cd-h">Certificate History ({person.history.length})</h3>
            <ul className="p-history">
              {person.history.map((r, i) => (
                <li key={r.id ?? `${r.programId}${r.completedOn}${i}`}>
                  <div>
                    <strong>{prog(r.programId)?.name ?? r.programId}</strong>
                    <small>
                      {fmt(r.completedOn)} – {r.expiresOn ? fmt(r.expiresOn) : 'No expiry'}
                      {r.certificateNo ? ` · No. ${r.certificateNo}` : ''}{r.provider ? ` · ${r.provider}` : ''}
                    </small>
                    <CertLinks personId={person.id} record={r} />
                  </div>
                  <button type="button" className="u-row-btn" aria-label={`Update ${prog(r.programId)?.name ?? 'certificate'}`} onClick={() => openForm(null, r)}><Pencil size={13} /></button>
                </li>
              ))}
              {!person.history.length && <li className="u-muted u-small">No certificates recorded yet.</li>}
            </ul>
            {person.sample && <p className="ad-sample"><Info size={13} />Sample person generated for this demo</p>}
          </>
        )}
      </aside>
    </>
  )
}
