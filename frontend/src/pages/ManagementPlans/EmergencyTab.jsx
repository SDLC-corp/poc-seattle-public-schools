import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  TriangleAlert, Hand, Users, Construction, Phone, PhoneCall, UserSearch, ClipboardList, CircleCheck, ShieldCheck, Package, FileText, Download,
  ArrowUp, ArrowDown, Trash2, Plus, Pencil, X, Siren,
} from 'lucide-react'
import { request, API_BASE } from '../../lib/api'

const STEP_ICONS = {
  stop: { icon: Hand, label: 'Stop' }, people: { icon: Users, label: 'People' }, secure: { icon: Construction, label: 'Isolate' },
  notify: { icon: Phone, label: 'Notify' }, assess: { icon: UserSearch, label: 'Assess' }, record: { icon: ClipboardList, label: 'Record' },
  clearance: { icon: CircleCheck, label: 'Clearance' }, alert: { icon: TriangleAlert, label: 'Warning' }, phone: { icon: PhoneCall, label: 'Call' },
  shield: { icon: ShieldCheck, label: 'Protect' },
}
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const telHref = (p) => `tel:${p.replace(/[^\d+]/g, '')}`

function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
}

function StepsDialog({ schoolId, data, onClose, onSaved }) {
  const [steps, setSteps] = useState(() => data.steps.map((s) => ({ ...s })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEscape(onClose)
  const set = (i, key, value) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, [key]: value } : s)))
  const move = (i, d) => setSteps((list) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; return next })
  const send = async (body) => {
    setBusy(true)
    setError(null)
    try {
      await request(`/management-plans/${schoolId}/emergency/steps`, { method: 'PUT', body })
      onSaved()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal em-dialog" role="dialog" aria-modal="true" aria-labelledby="em-steps-title">
        <header className="u-modal-head">
          <h2 id="em-steps-title">Edit Emergency Response Steps</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          <ol className="em-edit-steps">
            {steps.map((s, i) => (
              <li key={i}>
                <span className="em-num">{i + 1}</span>
                <div className="em-edit-fields">
                  <div className="rl-icons" role="radiogroup" aria-label={`Icon for step ${i + 1}`}>
                    {Object.entries(STEP_ICONS).map(([key, { icon: Icon, label }]) => (
                      <button key={key} type="button" role="radio" aria-checked={s.icon === key} className={s.icon === key ? 'on' : undefined} title={label} aria-label={label} onClick={() => set(i, 'icon', key)}><Icon size={15} /></button>
                    ))}
                  </div>
                  <input value={s.title} maxLength={80} onChange={(e) => set(i, 'title', e.target.value)} placeholder="Step title" aria-label={`Step ${i + 1} title`} />
                  <textarea rows={2} value={s.text} maxLength={240} onChange={(e) => set(i, 'text', e.target.value)} placeholder="What to do" aria-label={`Step ${i + 1} description`} />
                </div>
                <div className="em-edit-actions">
                  <button type="button" className="u-row-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`} title="Move up"><ArrowUp size={14} /></button>
                  <button type="button" className="u-row-btn" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`} title="Move down"><ArrowDown size={14} /></button>
                  <button type="button" className="u-row-btn" disabled={steps.length === 1} onClick={() => setSteps((list) => list.filter((_, j) => j !== i))} aria-label={`Remove step ${i + 1}`} title="Remove"><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="u-btn u-btn-outline em-add" disabled={steps.length >= 15} onClick={() => setSteps((list) => [...list, { icon: 'alert', title: '', text: '' }])}><Plus size={14} />Add step</button>
          {error && <p className="u-banner">{error}</p>}
        </div>
        <footer className="u-modal-foot">
          {data.stepsCustomised && <button type="button" className="u-btn u-btn-ghost ms-reset" disabled={busy} onClick={() => send({ steps: null })}>Reset to standard</button>}
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={busy} onClick={() => send({ steps })}>{busy ? 'Saving…' : 'Save Steps'}</button>
        </footer>
      </div>
    </div>
  )
}

function ContactsDialog({ schoolId, data, onClose, onSaved }) {
  const [roleIds, setRoleIds] = useState(data.roleIds)
  const [extra, setExtra] = useState(() => data.extra.map((c) => ({ ...c })))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEscape(onClose)
  const toggle = (id) => setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const set = (i, key) => (e) => setExtra((list) => list.map((c, j) => (j === i ? { ...c, [key]: e.target.value } : c)))
  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      // keep the plan's role order
      await request(`/management-plans/${schoolId}/emergency/contacts`, { method: 'PUT', body: { roleIds: data.roleOptions.map((r) => r.id).filter((id) => roleIds.includes(id)), extra } })
      onSaved()
    } catch (err) {
      setErrors({ ...(err.fields ?? {}), form: err.fields ? 'Check the highlighted fields' : err.message })
      setBusy(false)
    }
  }
  const input = (i, key, label, props = {}) => (
    <label className={`a-field${errors[`extra${i}.${key}`] ? ' invalid' : ''}`}><span>{label}</span>
      <input value={extra[i][key] ?? ''} onChange={set(i, key)} {...props} />
      {errors[`extra${i}.${key}`] && <em>{errors[`extra${i}.${key}`]}</em>}
    </label>
  )
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal em-dialog" role="dialog" aria-modal="true" aria-labelledby="em-contacts-title">
        <header className="u-modal-head">
          <h2 id="em-contacts-title">Edit Emergency Contacts</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          <fieldset className="em-roles">
            <legend>Roles to list <small>(names and phone numbers come from Roles &amp; Responsibilities)</small></legend>
            {data.roleOptions.map((r) => (
              <label key={r.id}>
                <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggle(r.id)} />
                <span><strong>{r.title}</strong><small>{r.status === 'Vacant' ? 'Vacant' : r.name ?? 'Not assigned'}</small></span>
              </label>
            ))}
          </fieldset>
          <div className="em-extra">
            <strong>Other contacts</strong>
            {extra.map((c, i) => (
              <div key={i} className="em-extra-row">
                <div className="rl-grid">
                  {input(i, 'role', 'Role *', { maxLength: 80, placeholder: 'e.g. Approved Asbestos Contractor' })}
                  {input(i, 'name', 'Name / Organization', { maxLength: 80 })}
                  {input(i, 'phone', 'Phone', { maxLength: 40 })}
                  {input(i, 'email', 'Email', { maxLength: 120, type: 'email' })}
                </div>
                <button type="button" className="u-row-btn" onClick={() => setExtra((list) => list.filter((_, j) => j !== i))} aria-label={`Remove contact ${i + 1}`} title="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="u-btn u-btn-outline em-add" disabled={extra.length >= 10} onClick={() => setExtra((list) => [...list, { role: '', name: '', phone: '', email: '' }])}><Plus size={14} />Add contact</button>
          </div>
          <p className="u-muted em-note">Emergency services (911) are always listed.</p>
          {errors.form && <p className="u-banner">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Contacts'}</button>
        </footer>
      </div>
    </div>
  )
}

// Management plan › Emergency Procedures
export default function EmergencyTab({ schoolId, schoolName }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // 'steps' | 'contacts'

  const load = () => request(`/management-plans/${schoolId}/emergency`).then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    request(`/management-plans/${schoolId}/emergency`).then(setData).catch((e) => setError(e.message))
  }, [schoolId])

  if (error) return <div className="u-banner">Couldn't load emergency procedures ({error}).</div>
  if (!data) return <div className="mp-loading">Loading emergency procedures…</div>

  const downloadContacts = () => {
    const lines = [['Role', 'Name', 'Organization', 'Phone', 'Email'], ...data.contacts.map((c) => [c.role, c.name, c.organization, c.phone, c.email])]
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `emergency-contacts-${schoolId}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="mp-card em">
      <header className="mp-reg-head">
        <div>
          <h2>Emergency Procedures</h2>
          <p>Define the actions to take in the event of suspected or actual disturbance, damage, or unexpected release of asbestos at {schoolName}.</p>
        </div>
        <Link to="/inspections/new" className="u-btn u-btn-primary em-report"><Siren size={15} />Report an Incident</Link>
      </header>

      <div className="em-layout">
        <div className="em-col">
          <div className="em-alert" role="note">
            <TriangleAlert size={30} />
            <div>
              <strong>In Case of <span>Asbestos Disturbance</span> or <span>Suspected Release</span></strong>
              <p>Follow the steps below immediately to keep people safe, contain the area, and get professional support.</p>
            </div>
          </div>

          <section className="ms-panel em-steps-card">
            <div className="em-card-head">
              <h3>Emergency Response Steps</h3>
              <button type="button" className="u-btn u-btn-outline" onClick={() => setDialog('steps')}><Pencil size={14} />Edit Steps</button>
            </div>
            <ol className="em-steps">
              {data.steps.map((s, i) => {
                const meta = STEP_ICONS[s.icon] ?? STEP_ICONS.alert
                return (
                  <li key={i}>
                    <span className="em-num">{i + 1}</span>
                    <span className={`em-step-icon i-${s.icon}`}><meta.icon size={20} /></span>
                    <span className="em-step-text"><strong>{s.title}</strong>{s.text && <small>{s.text}</small>}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>

        <div className="em-col">
          <section className="ms-panel">
            <div className="em-card-head">
              <h3><Phone size={18} />Key Emergency Contacts</h3>
              <button type="button" className="u-btn u-btn-primary" onClick={() => setDialog('contacts')}><Pencil size={14} />Edit Contacts</button>
            </div>
            <table className="mp-table em-contacts">
              <thead><tr><th>Role</th><th>Name</th><th>Contact</th></tr></thead>
              <tbody>
                {data.contacts.map((c) => (
                  <tr key={c.key} className={c.source === 'emergency' ? 'em-911' : undefined}>
                    <td><strong>{c.role}</strong></td>
                    <td>{c.name}{c.organization && c.source !== 'emergency' && <small>{c.organization}</small>}</td>
                    <td>{c.phone ? <a className="em-phone" href={telHref(c.phone)}><Phone size={14} />{c.phone}</a>
                      : c.email ? <a className="em-phone" href={`mailto:${c.email}`}>{c.email}</a> : <span className="u-muted">No contact on file</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="ms-panel">
            <h3><Package size={18} />Emergency Resources</h3>
            <ul className="em-resources">
              {data.resources.map((r) => (
                <li key={r.id}>
                  <FileText size={18} />
                  <span><strong>{r.title}</strong><small>{r.id} · {r.category} · v{r.version}</small></span>
                  {r.hasFile
                    ? <a className="u-row-btn" href={`${API_BASE}/om/procedures/${r.id}/file`} title={`Download ${r.fileName}`} aria-label={`Download ${r.title}`}><Download size={16} /></a>
                    : <span className="u-muted" title="No file attached yet">No file</span>}
                </li>
              ))}
              <li>
                <FileText size={18} />
                <span><strong>Emergency Contact List</strong><small>CSV · from the contacts above</small></span>
                <button type="button" className="u-row-btn" onClick={downloadContacts} title="Download" aria-label="Download the emergency contact list"><Download size={16} /></button>
              </li>
            </ul>
          </section>
        </div>
      </div>

      {dialog === 'steps' && <StepsDialog schoolId={schoolId} data={data} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
      {dialog === 'contacts' && <ContactsDialog schoolId={schoolId} data={data} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
    </section>
  )
}
