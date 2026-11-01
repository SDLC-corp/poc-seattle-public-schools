import { useMemo, useState } from 'react'
import { Lock, Save, Undo2 } from 'lucide-react'
import { request } from './api'

const toMatrix = (roles) => Object.fromEntries(roles.map((r) => [r.id, [...r.permissions]]))

// Editable role × permission grid. Changes are held locally until Save.
export default function PermissionsTab({ roles, permissions, systemRole, onChanged, notify }) {
  const saved = useMemo(() => toMatrix(roles), [roles])
  const [draft, setDraft] = useState(saved)
  const [base, setBase] = useState(saved)
  const [saving, setSaving] = useState(false)

  // Roles reloaded (e.g. after editing a role elsewhere): restart from the new data
  if (base !== saved) {
    setBase(saved)
    setDraft(saved)
  }

  const groups = [...new Set(permissions.map((p) => p.group))]
  const isLocked = (roleId, permId) => roleId === systemRole?.id && systemRole.required.includes(permId)
  const changedRoles = roles.filter((r) => {
    const a = [...saved[r.id]].sort().join()
    const b = [...(draft[r.id] ?? [])].sort().join()
    return a !== b
  })
  const changeCount = roles.reduce((n, r) => {
    const before = new Set(saved[r.id])
    const after = new Set(draft[r.id])
    return n + [...before].filter((p) => !after.has(p)).length + [...after].filter((p) => !before.has(p)).length
  }, 0)

  const toggle = (roleId, permId) => {
    if (isLocked(roleId, permId)) return
    setDraft((d) => {
      const list = d[roleId]
      return { ...d, [roleId]: list.includes(permId) ? list.filter((p) => p !== permId) : [...list, permId] }
    })
  }

  const save = async () => {
    const empty = changedRoles.find((r) => !draft[r.id].length)
    if (empty) { notify('error', `${empty.name} needs at least one permission.`); return }
    setSaving(true)
    try {
      const matrix = Object.fromEntries(changedRoles.map((r) => [r.id, draft[r.id]]))
      await request('/roles/matrix', { method: 'PUT', body: { matrix } })
      onChanged()
      notify('success', `Saved ${changeCount} permission change${changeCount === 1 ? '' : 's'}.`)
    } catch (err) {
      notify('error', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="u-card">
      <header className="u-card-head">
        <div>
          <h2>Permission Matrix</h2>
          <span className="u-muted u-small">Click a cell to grant or remove a permission, then save.</span>
        </div>
        <div className="u-matrix-actions">
          {changeCount > 0 && <span className="u-pending">{changeCount} unsaved change{changeCount === 1 ? '' : 's'}</span>}
          <button type="button" className="u-btn u-btn-outline u-btn-sm" disabled={!changeCount || saving} onClick={() => setDraft(saved)}>
            <Undo2 size={13} />Discard
          </button>
          <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={!changeCount || saving} onClick={save}>
            <Save size={13} />{saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </header>
      <div className="u-table-wrap">
        <table className="u-table u-matrix">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r) => (
                <th key={r.id} className={`u-center${changedRoles.includes(r) ? ' changed' : ''}`}>
                  <span className={`u-role tone-${r.tone}`}>{r.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g} className="u-group-row"><td colSpan={roles.length + 1}>{g}</td></tr>,
              ...permissions.filter((p) => p.group === g).map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  {roles.map((r) => {
                    const on = draft[r.id]?.includes(p.id)
                    const dirty = on !== saved[r.id].includes(p.id)
                    const locked = isLocked(r.id, p.id)
                    return (
                      <td key={r.id} className={`u-center u-cell${dirty ? ' dirty' : ''}`}>
                        <label className={`u-check${locked ? ' locked' : ''}`}
                          title={locked ? 'Required for the administrator role' : `${on ? 'Remove' : 'Grant'} "${p.label}" for ${r.name}`}>
                          <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(r.id, p.id)}
                            aria-label={`${p.label} for ${r.name}`} />
                          {locked && <Lock size={11} />}
                        </label>
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  )
}
