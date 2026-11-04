import { useEffect, useState } from 'react'
import { X, Upload, FileText } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { isoToday } from '../Surveillance/survMeta'
import { uploadFile } from '../../lib/api'

const Err = ({ msg }) => (msg ? <em className="uf-error">{msg}</em> : null)

// Upload a new asbestos-safe work procedure (PDF + title, category, version)
export default function SopDialog({ categories, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', category: categories[0] ?? 'Work Practice', version: '1.0', effectiveDate: isoToday(), description: '' })
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })) }
  const save = async () => {
    const errs = {}
    if (!form.title.trim()) errs.title = 'Title is required'
    if (!file) errs.file = 'Choose the PDF'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      onSaved(await uploadFile('/om/procedures', file, form))
    } catch (e) {
      setErrors(e.fields ?? { form: e.message })
      setSaving(false)
    }
  }

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal ai-add" role="dialog" aria-modal="true" aria-labelledby="om-sop-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="om-sop-title"><Upload size={18} />Upload O&amp;M Procedure (SOP)</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <div className="ai-add-grid">
            <label className="uf-field uf-wide"><span>Title *</span><input className={`u-input${errors.title ? ' invalid' : ''}`} value={form.title} maxLength={120} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Glove-bag removal of pipe insulation" /><Err msg={errors.title} /></label>
            <div className="uf-field"><span>Category *</span>
              <SearchSelect variant="field" label="Category" value={form.category} onChange={set('category')} searchable={false} options={categories.map((c) => ({ value: c, label: c }))} /><Err msg={errors.category} />
            </div>
            <label className="uf-field"><span>Version</span><input className="u-input" value={form.version} maxLength={20} onChange={(e) => set('version')(e.target.value)} /></label>
            <label className="uf-field"><span>Effective Date</span><input type="date" className="u-input" value={form.effectiveDate} onChange={(e) => set('effectiveDate')(e.target.value)} /><Err msg={errors.effectiveDate} /></label>
            <label className="uf-field uf-wide"><span>Summary</span><textarea className="u-input sv-textarea" rows={2} maxLength={300} value={form.description} onChange={(e) => set('description')(e.target.value)} /></label>
            <label className="uf-field uf-wide om-file-pick">
              <span>Procedure document (PDF, up to 10 MB) *</span>
              <input type="file" accept=".pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors((x) => ({ ...x, file: undefined })) }} />
              {file && <small className="sv-hint"><FileText size={12} /> {file.name} · {(file.size / 1024).toFixed(0)} KB</small>}
              <Err msg={errors.file} />
            </label>
          </div>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={saving} onClick={save}><Upload size={14} />{saving ? 'Uploading…' : 'Upload SOP'}</button>
        </footer>
      </div>
    </div>
  )
}
