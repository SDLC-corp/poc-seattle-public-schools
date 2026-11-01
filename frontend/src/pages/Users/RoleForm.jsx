import { useEffect, useRef, useState } from 'react'
import { X, Lock } from 'lucide-react'
import { request, ACCESS_SCOPES } from './api'

const TONES = [
  { id: 'primary', label: 'Blue' },
  { id: 'good', label: 'Green' },
  { id: 'violet', label: 'Violet' },
  { id: 'warning', label: 'Amber' },
  { id: 'critical', label: 'Red' },
  { id: 'teal', label: 'Teal' },
]

// Add / edit role dialog. `systemRole` = { id, required: [permissionIds] } that can't be removed.
export default function RoleForm({ role, permissions, systemRole, onClose, onSaved }) {
  const isNew = !role
  const [draft, setDraft] = useState(() => ({
    name: role?.name ?? '',
    description: role?.description ?? '',
    tone: role?.tone ?? 'primary',
    defaultAccess: role?.defaultAccess ?? 'schools',
    permissions: role?.permissions ?? [],
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const locked = new Set(role?.id === systemRole?.id ? systemRole.required : [])
  const has = (id) => draft.permissions.includes(id)
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }))
  const togglePerm = (id) => {
    if (locked.has(id)) return
    set('permissions')(has(id) ? draft.permissions.filter((p) => p !== id) : [...draft.permissions, id])
  }
  const groups = [...new Set(permissions.map((p) => p.group))]
  const toggleGroup = (group) => {
    const ids = permissions.filter((p) => p.group === group).map((p) => p.id)
    const allOn = ids.every(has)
    set('permissions')(allOn
      ? draft.permissions.filter((p) => !ids.includes(p) || locked.has(p))
      : [...new Set([...draft.permissions, ...ids])])
  }

  const submit = async (e) => {
    e.preventDefault()
    const local = {}
    if (!draft.name.trim()) local.name = 'Role name is required'
    if (!draft.permissions.length) local.permissions = 'Grant at least one permission'
    if (Object.keys(local).length) { setErrors(local); return }
    setSaving(true)
    try {
      const saved = isNew
        ? await request('/roles', { method: 'POST', body: draft })
        : await request(`/roles/${role.id}`, { method: 'PUT', body: draft })
      onSaved(saved, isNew)
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="u-modal" role="dialog" aria-modal="true" aria-labelledby="rf-title" onSubmit={submit} noValidate>
        <header className="u-modal-head">
          <h2 id="rf-title">{isNew ? 'New Role' : `Edit ${role.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>

        <div className="u-modal-body">
          <div className="uf-grid">
            <label className="uf-field">
              <span>Role Name *</span>
              <input ref={nameRef} className={`u-input${errors.name ? ' invalid' : ''}`} value={draft.name} maxLength={40}
                onChange={(e) => set('name')(e.target.value)} />
              {errors.name && <em>{errors.name}</em>}
            </label>
            <div className="uf-field">
              <span>Badge Colour</span>
              <div className="rf-tones" role="radiogroup" aria-label="Badge colour">
                {TONES.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={draft.tone === t.id} aria-label={t.label} title={t.label}
                    className={`rf-tone tone-${t.id}${draft.tone === t.id ? ' on' : ''}`} onClick={() => set('tone')(t.id)} />
                ))}
                <span className={`u-role tone-${draft.tone}`}>{draft.name.trim() || 'Preview'}</span>
              </div>
            </div>
            <label className="uf-field uf-wide">
              <span>Description</span>
              <textarea className="u-input rf-desc" rows={2} value={draft.description} onChange={(e) => set('description')(e.target.value)} />
            </label>
          </div>

          <fieldset className="uf-access">
            <legend>Default School Access <small className="u-muted">(pre-selected when assigning this role)</small></legend>
            <div className="uf-scopes">
              {ACCESS_SCOPES.map((s) => (
                <label key={s.value} className={`uf-scope${draft.defaultAccess === s.value ? ' on' : ''}`}>
                  <input type="radio" name="defaultAccess" checked={draft.defaultAccess === s.value} onChange={() => set('defaultAccess')(s.value)} />
                  <span><strong>{s.label}</strong><small>{s.hint}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="uf-access">
            <legend>Permissions * <small className="u-muted">({draft.permissions.length} of {permissions.length})</small></legend>
            <div className="rf-groups">
              {groups.map((g) => {
                const items = permissions.filter((p) => p.group === g)
                const allOn = items.every((p) => has(p.id))
                return (
                  <div key={g} className="rf-group">
                    <label className="rf-group-head">
                      <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = !allOn && items.some((p) => has(p.id)) }}
                        onChange={() => toggleGroup(g)} />
                      {g}
                    </label>
                    {items.map((p) => (
                      <label key={p.id} className={`rf-perm${locked.has(p.id) ? ' locked' : ''}`}
                        title={locked.has(p.id) ? 'Required for the administrator role' : undefined}>
                        <input type="checkbox" checked={has(p.id)} disabled={locked.has(p.id)} onChange={() => togglePerm(p.id)} />
                        {p.label}
                        {locked.has(p.id) && <Lock size={12} />}
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
            {errors.permissions && <em className="uf-error">{errors.permissions}</em>}
          </fieldset>

          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>

        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create Role' : 'Save Changes'}
          </button>
        </footer>
      </form>
    </div>
  )
}
