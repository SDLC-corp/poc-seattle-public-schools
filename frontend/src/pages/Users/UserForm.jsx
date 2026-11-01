import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Toggle from '../../components/ui/Toggle'
import { request, ACCESS_SCOPES } from './api'

const EMPTY = {
  name: '', email: '', phone: '', department: '', jobTitle: '',
  roleId: '', status: 'active', access: { scope: 'schools', schoolIds: [] },
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clientErrors(u) {
  const e = {}
  if (!u.name.trim()) e.name = 'Name is required'
  if (!EMAIL.test(u.email.trim())) e.email = 'Enter a valid email'
  if (!u.roleId) e.roleId = 'Choose a role'
  if (['schools', 'assigned'].includes(u.access.scope) && !u.access.schoolIds.length) e.access = 'Select at least one school'
  return e
}

// Add / edit user dialog
export default function UserForm({ user, roles, schools, onClose, onSaved }) {
  const isNew = !user
  const [draft, setDraft] = useState(() => (user ? structuredClone(user) : structuredClone(EMPTY)))
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [schoolFilter, setSchoolFilter] = useState('')
  const dialogRef = useRef(null)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }))
  const setScope = (scope) => setDraft((d) => ({ ...d, access: { ...d.access, scope } }))
  const toggleSchool = (id) => setDraft((d) => {
    const ids = d.access.schoolIds.includes(id) ? d.access.schoolIds.filter((x) => x !== id) : [...d.access.schoolIds, id]
    return { ...d, access: { ...d.access, schoolIds: ids } }
  })

  // Picking a role pre-selects that role's usual school access
  const onRole = (roleId) => {
    const role = roles.find((r) => r.id === roleId)
    setDraft((d) => ({ ...d, roleId, access: { ...d.access, scope: role?.defaultAccess ?? d.access.scope } }))
  }

  const visibleSchools = useMemo(
    () => schools.filter((s) => s.name.toLowerCase().includes(schoolFilter.toLowerCase())),
    [schools, schoolFilter],
  )
  const needsSchools = ['schools', 'assigned'].includes(draft.access.scope)
  const shown = touched ? { ...clientErrors(draft), ...errors } : errors

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    const local = clientErrors(draft)
    if (Object.keys(local).length) return
    setSaving(true)
    setErrors({})
    try {
      const body = { ...draft, access: needsSchools ? draft.access : { scope: draft.access.scope, schoolIds: [] } }
      const saved = isNew
        ? await request('/users', { method: 'POST', body })
        : await request(`/users/${user.id}`, { method: 'PUT', body })
      onSaved(saved, isNew)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  const text = (key, props = {}) => ({
    id: `uf-${key}`,
    className: `u-input${shown[key] ? ' invalid' : ''}`,
    value: draft[key],
    onChange: (e) => set(key)(e.target.value),
    ...props,
  })

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form ref={dialogRef} className="u-modal" role="dialog" aria-modal="true" aria-labelledby="uf-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="uf-title">{isNew ? 'Add User' : `Edit ${user.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="u-modal-body">
          <div className="uf-grid">
            <label className="uf-field">
              <span>Full Name *</span>
              <input ref={firstFieldRef} {...text('name')} />
              {shown.name && <em>{shown.name}</em>}
            </label>
            <label className="uf-field">
              <span>Email *</span>
              <input type="email" {...text('email')} />
              {shown.email && <em>{shown.email}</em>}
            </label>
            <label className="uf-field">
              <span>Phone</span>
              <input type="tel" {...text('phone')} />
            </label>
            <label className="uf-field">
              <span>Job Title</span>
              <input {...text('jobTitle')} />
            </label>
            <label className="uf-field uf-wide">
              <span>Department</span>
              <input {...text('department')} />
            </label>
            <div className="uf-field">
              <span>Role *</span>
              <SearchSelect variant="field" label="Role" value={draft.roleId} onChange={onRole} searchable={false}
                options={[{ value: '', label: 'Select a role…' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]} />
              {shown.roleId && <em>{shown.roleId}</em>}
            </div>
            <div className="uf-field">
              <span>Status</span>
              <div className="uf-status">
                <Toggle checked={draft.status === 'active'} onChange={(on) => set('status')(on ? 'active' : 'inactive')} label="Active" />
                {draft.status === 'active' ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>

          <fieldset className="uf-access">
            <legend>School Access</legend>
            <div className="uf-scopes">
              {ACCESS_SCOPES.map((s) => (
                <label key={s.value} className={`uf-scope${draft.access.scope === s.value ? ' on' : ''}`}>
                  <input type="radio" name="scope" checked={draft.access.scope === s.value} onChange={() => setScope(s.value)} />
                  <span><strong>{s.label}</strong><small>{s.hint}</small></span>
                </label>
              ))}
            </div>

            {needsSchools && (
              <div className="uf-schools">
                <div className="uf-schools-head">
                  <label className="u-search">
                    <Search size={14} />
                    <input type="search" placeholder="Filter schools…" value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} aria-label="Filter schools" />
                  </label>
                  <span className="u-muted">{draft.access.schoolIds.length} selected</span>
                </div>
                <ul className="uf-school-list">
                  {visibleSchools.map((s) => (
                    <li key={s.id}>
                      <label>
                        <input type="checkbox" checked={draft.access.schoolIds.includes(s.id)} onChange={() => toggleSchool(s.id)} />
                        {s.name}
                      </label>
                    </li>
                  ))}
                  {!visibleSchools.length && <li className="u-muted">No schools match.</li>}
                </ul>
              </div>
            )}
            {shown.access && <em className="uf-error">{shown.access}</em>}
          </fieldset>

          {shown.form && <p className="uf-error">{shown.form}</p>}
        </div>

        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add User' : 'Save Changes'}
          </button>
        </footer>
      </form>
    </div>
  )
}
