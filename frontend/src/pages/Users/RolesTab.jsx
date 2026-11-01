import { useEffect, useState } from 'react'
import { CircleCheck, Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import RoleForm from './RoleForm'
import { request, ACCESS_SCOPES } from './api'

const ACCESS_LABEL = Object.fromEntries(ACCESS_SCOPES.map((s) => [s.value, s.label]))

function DeleteButton({ role, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(t)
  }, [confirming])

  const blocked = role.system
    ? 'The administrator role can’t be deleted'
    : role.userCount ? `Reassign its ${role.userCount} user${role.userCount > 1 ? 's' : ''} before deleting` : null

  return (
    <button type="button" className={`u-btn u-btn-sm ${confirming ? 'u-btn-danger' : 'u-btn-ghost'}`} disabled={Boolean(blocked)}
      title={blocked ?? undefined} onClick={() => (confirming ? onDelete() : setConfirming(true))}>
      <Trash2 size={13} />{confirming ? 'Confirm delete' : 'Delete'}
    </button>
  )
}

export default function RolesTab({ roles, permissions, systemRole, onChanged, notify }) {
  const [form, setForm] = useState(null) // { role? } while the dialog is open
  const label = Object.fromEntries(permissions.map((p) => [p.id, p.label]))

  const onSaved = (role, isNew) => {
    setForm(null)
    onChanged()
    notify('success', isNew ? `Role "${role.name}" created.` : `Role "${role.name}" updated.`)
  }

  const remove = async (role) => {
    try {
      await request(`/roles/${role.id}`, { method: 'DELETE' })
      onChanged()
      notify('success', `Role "${role.name}" deleted.`)
    } catch (err) {
      notify('error', err.message)
    }
  }

  return (
    <>
      <div className="u-roles-bar">
        <span className="u-muted">{roles.length} roles · Edit a role to change what its users can do</span>
        <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={() => setForm({})}>
          <Plus size={14} />New Role
        </button>
      </div>

      <div className="u-roles">
        {roles.map((r) => (
          <section key={r.id} className={`u-card u-role-card tone-${r.tone}`}>
            <header>
              <span className={`u-role tone-${r.tone}`}>{r.name}</span>
              <span className="u-muted">{r.userCount} user{r.userCount === 1 ? '' : 's'}</span>
            </header>
            {r.system && <p className="u-role-system"><ShieldCheck size={13} />Administrator role</p>}
            <p>{r.description || <span className="u-muted">No description</span>}</p>
            <p className="u-muted u-small">Default access: {ACCESS_LABEL[r.defaultAccess]}</p>
            <ul className="ud-perms">
              {r.permissions.map((id) => (
                <li key={id} className="on"><CircleCheck size={14} />{label[id]}</li>
              ))}
            </ul>
            <footer className="u-role-actions">
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setForm({ role: r })}>
                <Pencil size={13} />Edit
              </button>
              <DeleteButton role={r} onDelete={() => remove(r)} />
            </footer>
          </section>
        ))}
      </div>

      {form && (
        <RoleForm role={form.role} permissions={permissions} systemRole={systemRole}
          onClose={() => setForm(null)} onSaved={onSaved} />
      )}
    </>
  )
}
