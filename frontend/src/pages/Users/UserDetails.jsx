import { useState } from 'react'
import { Pencil, CircleCheck, CircleMinus, Search, X } from 'lucide-react'
import { initials, fmtDateTime, accessSummary } from './api'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'roles', label: 'Roles & Permissions' },
  { id: 'access', label: 'School Access' },
]

function Field({ label, children }) {
  return (
    <div className="ud-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function UserDetails({ user, role, permissions, schoolName, onEdit, onClose }) {
  const [tab, setTab] = useState('profile')
  const [filter, setFilter] = useState('')

  if (!user) {
    return <aside className="u-card u-details u-details-empty">Select a user to see their details.</aside>
  }

  const granted = new Set(role?.permissions ?? [])
  const schoolsForUser = user.access.schoolIds.map((id) => ({ id, name: schoolName(id) }))
    .filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <aside className="u-card u-details" aria-label="User details">
      <header className="u-card-head">
        <h2>User Details</h2>
        <span className="ud-head-actions">
          <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={onEdit}><Pencil size={13} />Edit</button>
          {/* Close is only shown when the panel is a drawer (small screens) */}
          <button type="button" className="u-row-btn ud-close" onClick={onClose} aria-label="Close details"><X size={15} /></button>
        </span>
      </header>

      <div className="ud-hero">
        <span className="ud-avatar">{initials(user.name)}</span>
        <div className="ud-hero-text">
          <div className="ud-name">
            <strong>{user.name}</strong>
            <span className={`u-status ${user.status}`}>{user.status === 'active' ? 'Active' : 'Inactive'}</span>
          </div>
          <span>{user.email}</span>
          <span>{user.jobTitle}</span>
        </div>
      </div>

      <nav className="ud-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'profile' && (
        <dl className="ud-fields">
          <Field label="Full Name">{user.name}</Field>
          <Field label="Email Address">{user.email}</Field>
          <Field label="Phone Number">{user.phone || '—'}</Field>
          <Field label="Department">{user.department || '—'}</Field>
          <Field label="Job Title">{user.jobTitle || '—'}</Field>
          <Field label="Status"><span className={`u-status ${user.status}`}>{user.status === 'active' ? 'Active' : 'Inactive'}</span></Field>
          <Field label="Last Login">{fmtDateTime(user.lastLogin)}</Field>
          <Field label="Account Created">{fmtDateTime(user.createdAt)}</Field>
        </dl>
      )}

      {(tab === 'profile' || tab === 'roles') && role && (
        <div className="ud-section">
          <h3>Roles &amp; Permissions</h3>
          <dl className="ud-fields">
            <Field label="Assigned Role"><span className={`u-role tone-${role.tone}`}>{role.name}</span></Field>
          </dl>
          {tab === 'roles' && <p className="ud-desc">{role.description}</p>}
          <ul className="ud-perms">
            {(tab === 'roles' ? permissions : permissions.filter((p) => granted.has(p.id))).map((p) => (
              <li key={p.id} className={granted.has(p.id) ? 'on' : 'off'}>
                {granted.has(p.id) ? <CircleCheck size={15} /> : <CircleMinus size={15} />}
                {p.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'access' && (
        <div className="ud-section">
          <dl className="ud-fields">
            <Field label="Access">{accessSummary(user.access, schoolName)}</Field>
          </dl>
          {user.access.schoolIds.length > 0 && (
            <>
              {user.access.schoolIds.length > 6 && (
                <label className="u-search ud-filter">
                  <Search size={14} />
                  <input type="search" placeholder="Filter schools…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter schools" />
                </label>
              )}
              <ul className="ud-schools">
                {schoolsForUser.map((s) => <li key={s.id}>{s.name}</li>)}
              </ul>
            </>
          )}
          {user.access.scope === 'all' && <p className="ud-desc">This user can see every school in the district.</p>}
          {user.access.scope === 'lab' && <p className="ud-desc">This user can only upload lab results and sees no school data.</p>}
        </div>
      )}
    </aside>
  )
}
