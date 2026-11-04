import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Phone, Mail, Ellipsis, Pencil, Trash2, Info, X, CircleCheck, CircleSlash, UserX } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { useConfirm } from '../../components/ui/useConfirm'
import { request } from '../../lib/api'
import { ROLE_ICONS } from './rolesMeta'

const STATUS_TONE = { Active: 'good', Vacant: 'warning', Inactive: 'neutral' }
const EXTERNAL = '__external'
const BLANK = { title: '', subtitle: '', icon: 'briefcase', personKey: '', person: { name: '', position: '', organization: '', phone: '', email: '' }, responsibilities: '', status: 'Active' }

function RoleMenu({ role, onEdit, onStatus, onRemove }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const act = (fn) => () => { setOpen(false); fn() }
  return (
    <div className="ai-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${role.title}`} onClick={() => setOpen((o) => !o)}><Ellipsis size={16} /></button>
      {open && (
        <div className="ai-menu" role="menu">
          <button type="button" role="menuitem" onClick={act(onEdit)}><Pencil size={14} />Edit role</button>
          {role.status !== 'Active' && <button type="button" role="menuitem" onClick={act(() => onStatus('Active'))}><CircleCheck size={14} />Mark active</button>}
          {role.status !== 'Vacant' && !role.group && <button type="button" role="menuitem" onClick={act(() => onStatus('Vacant'))}><UserX size={14} />Mark vacant</button>}
          {role.status !== 'Inactive' && <button type="button" role="menuitem" onClick={act(() => onStatus('Inactive'))}><CircleSlash size={14} />Mark inactive</button>}
          <button type="button" role="menuitem" className="danger" onClick={act(onRemove)}><Trash2 size={14} />Remove role</button>
        </div>
      )}
    </div>
  )
}

function RoleDialog({ schoolId, role, people, onClose, onSaved }) {
  const [f, setF] = useState(() => (role ? {
    title: role.title, subtitle: role.subtitle ?? '', icon: role.icon, status: role.status,
    personKey: role.personKey && !role.missing ? role.personKey : role.person?.source === 'External' ? EXTERNAL : '',
    person: { ...BLANK.person, ...(role.person?.source === 'External' ? role.person : {}) },
    responsibilities: role.responsibilities.join('\n'),
  } : BLANK))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const set = (key) => (value) => setF((x) => ({ ...x, [key]: value }))
  const setPerson = (key) => (e) => setF((x) => ({ ...x, person: { ...x.person, [key]: e.target.value } }))
  const picked = people.find((p) => p.key === f.personKey)
  const options = useMemo(() => [
    { value: '', label: 'Not assigned' },
    { value: EXTERNAL, label: 'Someone not in the app…' },
    ...people.map((p) => ({ value: p.key, label: `${p.name} – ${p.position || p.source}${p.organization ? ` (${p.organization})` : ''}` })),
  ], [people])

  const save = async () => {
    setBusy(true)
    setErrors({})
    const body = {
      title: f.title, subtitle: f.subtitle, icon: f.icon, status: f.status,
      responsibilities: f.responsibilities.split('\n'),
      personKey: f.personKey && f.personKey !== EXTERNAL ? f.personKey : null,
      person: f.personKey === EXTERNAL ? f.person : null,
    }
    try {
      const saved = await request(role ? `/management-plans/${schoolId}/roles/${role.id}` : `/management-plans/${schoolId}/roles`, { method: role ? 'PUT' : 'POST', body })
      onSaved(saved)
    } catch (err) {
      setErrors({ ...(err.fields ?? {}), form: err.fields ? null : err.message })
      setBusy(false)
    }
  }

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal rl-dialog" role="dialog" aria-modal="true" aria-labelledby="rl-dialog-title">
        <header className="u-modal-head">
          <h2 id="rl-dialog-title">{role ? `Edit ${role.title}` : 'Add Role'}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          <div className="rl-grid">
            <label className={`a-field${errors.title ? ' invalid' : ''}`}><span>Role / Position *</span>
              <input value={f.title} maxLength={80} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Asbestos Responsible Person (ARP)" />
              {errors.title && <em>{errors.title}</em>}
            </label>
            <label className="a-field"><span>Description</span>
              <input value={f.subtitle} maxLength={80} onChange={(e) => set('subtitle')(e.target.value)} placeholder="e.g. Overall accountability" />
            </label>
          </div>
          <div className="a-field"><span>Icon</span>
            <div className="rl-icons" role="radiogroup" aria-label="Icon">
              {Object.entries(ROLE_ICONS).map(([key, { icon: Icon, label }]) => (
                <button key={key} type="button" role="radio" aria-checked={f.icon === key} className={f.icon === key ? 'on' : undefined} title={label} aria-label={label} onClick={() => set('icon')(key)}><Icon size={17} /></button>
              ))}
            </div>
          </div>
          {!role?.group && (
            <div className={`a-field${errors.personKey ? ' invalid' : ''}`}><span>Assigned Person</span>
              <SearchSelect variant="field" label="Assigned person" value={f.personKey} onChange={set('personKey')} searchPlaceholder="Search users and personnel…" options={options} />
              {errors.personKey && <em>{errors.personKey}</em>}
              {picked && <small className="rl-picked">{[picked.phone, picked.email].filter(Boolean).join(' · ') || 'No contact details on file'} — from {picked.source === 'User' ? 'User & Role Management' : 'Personnel'}</small>}
            </div>
          )}
          {f.personKey === EXTERNAL && (
            <div className="rl-grid">
              <label className="a-field"><span>Name *</span><input value={f.person.name} maxLength={80} onChange={setPerson('name')} /></label>
              <label className="a-field"><span>Job title</span><input value={f.person.position} maxLength={80} onChange={setPerson('position')} /></label>
              <label className="a-field"><span>Phone</span><input value={f.person.phone} maxLength={40} onChange={setPerson('phone')} /></label>
              <label className={`a-field${errors.email ? ' invalid' : ''}`}><span>Email</span><input type="email" value={f.person.email} maxLength={120} onChange={setPerson('email')} />{errors.email && <em>{errors.email}</em>}</label>
            </div>
          )}
          <label className={`a-field${errors.responsibilities ? ' invalid' : ''}`}><span>Key Responsibilities * <small>(one per line)</small></span>
            <textarea rows={4} value={f.responsibilities} onChange={(e) => set('responsibilities')(e.target.value)} placeholder={'e.g. Keep the asbestos register up to date\nArrange inspections and surveys'} />
            {errors.responsibilities && <em>{errors.responsibilities}</em>}
          </label>
          <div className="a-field"><span>Status</span>
            <SearchSelect variant="field" label="Status" value={f.status} onChange={set('status')} searchable={false}
              options={['Active', ...(role?.group ? [] : ['Vacant']), 'Inactive'].map((x) => ({ value: x, label: x }))} />
          </div>
          {errors.form && <p className="u-banner">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : role ? 'Save Changes' : 'Add Role'}</button>
        </footer>
      </div>
    </div>
  )
}

// Management plan › Roles & Responsibilities
export default function RolesTab({ schoolId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // { role } (null role = add)
  const [notice, setNotice] = useState(null)
  const [confirm, confirmDialog] = useConfirm()

  const load = () => request(`/management-plans/${schoolId}/roles`).then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    request(`/management-plans/${schoolId}/roles`).then(setData).catch((e) => setError(e.message))
  }, [schoolId])

  if (error) return <div className="u-banner">Couldn't load roles ({error}).</div>

  const setStatus = async (role, status) => {
    try {
      await request(`/management-plans/${schoolId}/roles/${role.id}`, {
        method: 'PUT',
        body: { ...role, status, personKey: role.missing ? null : role.personKey, person: role.person?.source === 'External' ? role.person : null },
      })
      load()
    } catch (err) {
      setNotice(err.message)
    }
  }
  const remove = async (role) => {
    if (!(await confirm({ title: `Remove ${role.title}?`, message: 'The role and its responsibilities will be removed from this management plan.', confirmLabel: 'Remove Role', tone: 'danger' }))) return
    try {
      await request(`/management-plans/${schoolId}/roles/${role.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setNotice(err.message)
    }
  }

  return (
    <section className="mp-card rl">
      <header className="mp-reg-head">
        <div>
          <h2>Roles &amp; Responsibilities</h2>
          <p>Define key roles, assigned personnel, and their responsibilities for asbestos management at the school.</p>
        </div>
        <button type="button" className="u-btn u-btn-primary" onClick={() => setDialog({ role: null })} disabled={!data}><Plus size={15} />Add Role</button>
      </header>
      {notice && <p className="u-banner">{notice}</p>}

      <div className="mp-reg-scroll">
        <table className="mp-table rl-table">
          <thead><tr><th>Role / Position</th><th>Assigned Person</th><th>Key Responsibilities</th><th>Contact</th><th>Status</th><th className="mp-reg-actions"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {!data && <tr><td colSpan={6} className="u-muted">Loading roles…</td></tr>}
            {data?.roles.map((r) => {
              const Icon = ROLE_ICONS[r.icon]?.icon ?? ROLE_ICONS.briefcase.icon
              return (
                <tr key={r.id} className={r.status === 'Inactive' ? 'rl-inactive' : undefined}>
                  <td><div className="rl-role"><span className={`rl-icon i-${r.icon}`}><Icon size={19} /></span><span><strong>{r.title}</strong>{r.subtitle && <small>({r.subtitle})</small>}</span></div></td>
                  <td>{r.person ? <><strong className="rl-name">{r.person.name}</strong><small>{r.person.position || r.person.organization}</small></>
                    : r.group ? <span className="u-muted">–</span> : <span className="rl-unassigned">{r.missing ? 'Person no longer on file' : 'Not assigned'}</span>}</td>
                  <td><ul className="rl-duties">{r.responsibilities.map((x) => <li key={x}>{x}</li>)}</ul></td>
                  <td>
                    {r.person?.phone || r.person?.email ? (
                      <ul className="rl-contact">
                        {r.person.phone && <li><Phone size={14} /><a href={`tel:${r.person.phone.replace(/[^\d+]/g, '')}`}>{r.person.phone}</a></li>}
                        {r.person.email && <li><Mail size={14} /><a href={`mailto:${r.person.email}`}>{r.person.email}</a></li>}
                      </ul>
                    ) : <span className="u-muted">–</span>}
                  </td>
                  <td><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                  <td className="mp-reg-actions"><RoleMenu role={r} onEdit={() => setDialog({ role: r })} onStatus={(s) => setStatus(r, s)} onRemove={() => remove(r)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mp-reg-note">
        <Info size={20} />
        <p><strong>Note</strong>Roles and responsibilities are part of the Asbestos Management Plan and should be reviewed whenever there is a change in personnel, contractor, or site arrangements.</p>
      </div>

      {dialog && data && <RoleDialog schoolId={schoolId} role={dialog.role} people={data.people} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
      {confirmDialog}
    </section>
  )
}
