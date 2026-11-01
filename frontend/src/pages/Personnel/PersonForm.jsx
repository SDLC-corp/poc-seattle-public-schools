import { useEffect, useState } from 'react'
import { X, Info } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'

// Add / edit a person. Required training follows from the category.
export default function PersonForm({ person, meta, schools, onClose, onSaved }) {
  const isNew = !person
  const [form, setForm] = useState(() => ({
    name: person?.name ?? '',
    category: person?.category ?? 'employee-custodial',
    organization: person?.organization ?? 'Seattle Public Schools',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
    schoolId: person?.schoolId ?? '',
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const cat = meta.categories.find((c) => c.id === form.category)
  const programName = (id) => meta.programs.find((p) => p.id === id)?.name ?? id

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    try {
      const saved = isNew
        ? await request('/personnel', { method: 'POST', body: form })
        : await request(`/personnel/${person.id}`, { method: 'PUT', body: form })
      onSaved(saved, isNew)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const input = (k, props = {}) => ({ className: `u-input${errors[k] ? ' invalid' : ''}`, value: form[k], onChange: (ev) => set(k)(ev.target.value), ...props })

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="u-modal" role="dialog" aria-modal="true" aria-labelledby="pf-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="pf-title">{isNew ? 'Add Person' : `Edit ${person.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <div className="uf-grid">
            <label className="uf-field"><span>Full Name *</span><input {...input('name')} autoFocus />{errors.name && <em>{errors.name}</em>}</label>
            <div className="uf-field">
              <span>Role / Category *</span>
              <SearchSelect variant="field" label="Role / category" value={form.category} onChange={set('category')} searchable={false}
                options={meta.categories.map((c) => ({ value: c.id, label: c.label }))} />
            </div>
            <label className="uf-field"><span>Organization *</span><input {...input('organization')} />{errors.organization && <em>{errors.organization}</em>}</label>
            <div className="uf-field">
              <span>School</span>
              <SearchSelect variant="field" label="School" value={form.schoolId} onChange={set('schoolId')} searchPlaceholder="Search schools…"
                options={[{ value: '', label: 'District-wide' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
            <label className="uf-field"><span>Email</span><input type="email" {...input('email')} />{errors.email && <em>{errors.email}</em>}</label>
            <label className="uf-field"><span>Phone</span><input type="tel" {...input('phone')} /></label>
          </div>
          {cat && (
            <p className="p-hint p-hint-box">
              <Info size={14} />Required training for {cat.label}: <strong>{cat.required.map(programName).join(', ')}</strong>
            </p>
          )}
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add Person' : 'Save Changes'}</button>
        </footer>
      </form>
    </div>
  )
}
