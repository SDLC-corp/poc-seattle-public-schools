import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ShieldCheck, CircleCheck, RefreshCw, TriangleAlert, Clock, Search, Plus, Eye, Pencil, Ellipsis, Info, X, Wrench, MapPin, RotateCcw,
  ChartColumn, Layers,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { RISK_TONE, floorLink } from '../AcmInventory/acmInventoryMeta'
import { fmtDay } from '../Surveillance/survMeta'
import { request } from '../../lib/api'
import { Tile } from './RegisterTab'

const STATUS = {
  implemented: { label: 'Implemented', tone: 'good', icon: CircleCheck },
  inProgress: { label: 'In Progress', tone: 'primary', icon: RefreshCw },
  notStarted: { label: 'Not Started', tone: 'neutral', icon: Clock },
  overdue: { label: 'Overdue', tone: 'critical', icon: TriangleAlert },
}
const EMPTY = { q: '', building: '', risk: '', status: '' }

function RowMenu({ r, onReset }) {
  const navigate = useNavigate()
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
  const go = (to) => () => { setOpen(false); navigate(to) }
  return (
    <div className="ai-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${r.ref}`} onClick={() => setOpen((o) => !o)}><Ellipsis size={16} /></button>
      {open && (
        <div className="ai-menu" role="menu">
          {r.work && <button type="button" role="menuitem" onClick={go(`/operations/activities/${r.work.id}`)}><Wrench size={14} />Open work order {r.work.id}</button>}
          <button type="button" role="menuitem" onClick={go(floorLink(r))}><MapPin size={14} />Open room on floor plan</button>
          {r.customised && <button type="button" role="menuitem" onClick={() => { setOpen(false); onReset() }}><RotateCcw size={14} />Reset to standard</button>}
        </div>
      )}
    </div>
  )
}

function ControlDialog({ schoolId, data, record, onClose, onSaved }) {
  const [id, setId] = useState(record?.id ?? '')
  const rec = data.records.find((r) => r.id === id)
  const fromRecord = (r) => ({ measures: r?.measures ?? [], notes: r?.notes ?? '', roleId: r?.roleId ?? '', target: r?.target ?? '', status: r?.setStatus ?? 'notStarted' })
  const [f, setF] = useState(() => fromRecord(record))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const set = (key) => (v) => setF((x) => ({ ...x, [key]: typeof v === 'string' ? v : v.target.value }))
  const toggle = (m) => setF((x) => ({ ...x, measures: x.measures.includes(m) ? x.measures.filter((y) => y !== m) : [...x.measures, m] }))
  const pick = (value) => { setId(value); setF(fromRecord(data.records.find((r) => r.id === value))) }
  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      await request(`/management-plans/${schoolId}/controls/${encodeURIComponent(id)}`, { method: 'PUT', body: f })
      onSaved()
    } catch (err) {
      setErrors({ ...(err.fields ?? {}), form: err.fields ? null : err.message })
      setBusy(false)
    }
  }
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal em-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-dialog-title">
        <header className="u-modal-head">
          <h2 id="cm-dialog-title">{record ? `Control Measures – ${record.ref}` : 'Add Control Measure'}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          {!record && (
            <div className="a-field"><span>ACM record *</span>
              <SearchSelect variant="field" label="ACM record" value={id} onChange={pick} searchPlaceholder="Search ACMs…"
                options={[{ value: '', label: 'Select an ACM' }, ...data.records.map((r) => ({ value: r.id, label: `${r.ref} – ${r.name} (${r.building} / ${r.room})` }))]} />
            </div>
          )}
          {rec && (
            <p className="rk-dialog-acm"><strong>{rec.name}</strong> · {rec.building} / {rec.room} · {rec.condition} · {rec.risk} risk
              {rec.work && <> · O&amp;M <Link to={`/operations/activities/${rec.work.id}`}>{rec.work.id}</Link> ({rec.work.type})</>}</p>
          )}
          <fieldset className={`em-roles cm-measures${errors.measures ? ' invalid' : ''}`}>
            <legend>Control measures *</legend>
            {data.types.map((t) => (
              <label key={t.id}><input type="checkbox" checked={f.measures.includes(t.id)} onChange={() => toggle(t.id)} disabled={!rec} />
                <span><strong>{t.label}</strong><small>{t.text}</small></span></label>
            ))}
          </fieldset>
          {errors.measures && <p className="cm-err">{errors.measures}</p>}
          <label className="a-field"><span>Other action</span>
            <input value={f.notes} maxLength={300} onChange={set('notes')} disabled={!rec} placeholder="e.g. Re-inspect every 3 months until removal" />
          </label>
          <div className="rl-grid">
            <div className={`a-field${errors.roleId ? ' invalid' : ''}`}><span>Responsible *</span>
              <SearchSelect variant="field" label="Responsible" value={f.roleId} onChange={set('roleId')} searchable={false}
                options={[{ value: '', label: 'Select a role' }, ...data.roles.map((r) => ({ value: r.id, label: `${r.title}${r.name ? ` – ${r.name}` : ''}` }))]} />
              {errors.roleId && <em>{errors.roleId}</em>}
            </div>
            <label className={`a-field${errors.target ? ' invalid' : ''}`}><span>Target date *</span>
              <input type="date" value={f.target} onChange={set('target')} disabled={!rec} />
              {errors.target && <em>{errors.target}</em>}
            </label>
            <div className={`a-field${errors.status ? ' invalid' : ''}`}><span>Status *</span>
              <SearchSelect variant="field" label="Status" value={f.status} onChange={set('status')} searchable={false}
                options={['notStarted', 'inProgress', 'implemented'].map((s) => ({ value: s, label: STATUS[s].label }))} />
              <small>Shown as Overdue when the target date passes before it's implemented</small>
            </div>
          </div>
          {errors.form && <p className="u-banner">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={!rec || busy} onClick={save}>{busy ? 'Saving…' : 'Save Control Measures'}</button>
        </footer>
      </div>
    </div>
  )
}

function ViewDialog({ r, onClose, onEdit }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const s = STATUS[r.status]
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal rl-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-view-title">
        <header className="u-modal-head">
          <h2 id="cm-view-title">{r.ref} – {r.name}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rl-dialog-body">
          <p className="rk-dialog-acm">{r.building} / {r.room} · {r.condition} · <Badge tone={RISK_TONE[r.risk] ?? 'neutral'}>{r.risk ?? 'Not ranked'}</Badge></p>
          <dl className="cm-dl">
            <dt>Control measures</dt><dd><ul className="rl-duties">{r.actions.map((a) => <li key={a}>{a}</li>)}</ul></dd>
            <dt>Responsible</dt><dd>{r.responsible}{r.responsiblePerson && ` – ${r.responsiblePerson}`}</dd>
            <dt>Target date</dt><dd>{fmtDay(r.target)}</dd>
            <dt>Status</dt><dd><Badge tone={s.tone}>{s.label}</Badge>{!r.customised && <small className="u-muted"> worked out from the ACM’s condition and O&amp;M work</small>}</dd>
            {r.work && <><dt>O&amp;M work</dt><dd><Link to={`/operations/activities/${r.work.id}`}>{r.work.id}</Link> – {r.work.type}{r.work.assignee && `, ${r.work.assignee}`}{r.work.completedAt && ` (completed ${fmtDay(r.work.completedAt)})`}</dd></>}
          </dl>
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Close</button>
          <button type="button" className="u-btn u-btn-primary" onClick={onEdit}><Pencil size={14} />Edit</button>
        </footer>
      </div>
    </div>
  )
}

// Management plan › Control Measures: what is being done about each ACM, by whom and by when
export default function ControlsTab({ schoolId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [types, setTypes] = useState([]) // Typical Control Measures filter
  const [dialog, setDialog] = useState(null) // { mode: 'add' | 'edit' | 'view', record }
  const [notice, setNotice] = useState(null)

  const load = () => request(`/management-plans/${schoolId}/controls`).then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    request(`/management-plans/${schoolId}/controls`).then(setData).catch((e) => setError(e.message))
  }, [schoolId])

  const records = data?.records
  const buildingsList = useMemo(() => [...new Map((records ?? []).map((r) => [r.buildingId, r.building]))].sort((a, b) => a[1].localeCompare(b[1])), [records])
  const rows = useMemo(() => {
    const term = f.q.trim().toLowerCase()
    return (records ?? []).filter((r) => (!f.building || r.buildingId === f.building)
      && (!f.risk || r.risk === f.risk) && (!f.status || r.status === f.status)
      && (!types.length || types.some((t) => r.measures.includes(t)))
      && (!term || [r.id, r.ref, r.name, r.building, r.room, r.responsible, r.responsiblePerson, ...r.actions].some((v) => String(v ?? '').toLowerCase().includes(term))))
  }, [records, f, types])

  if (error) return <div className="u-banner">Couldn't load control measures ({error}).</div>
  if (!data) return <div className="mp-loading">Loading control measures…</div>
  const s = data.stats
  const set = (key) => (value) => setF((x) => ({ ...x, [key]: value }))
  const filtered = Object.values(f).some(Boolean) || types.length > 0
  const reset = async (r) => {
    try {
      await request(`/management-plans/${schoolId}/controls/${encodeURIComponent(r.id)}`, { method: 'PUT', body: { reset: true } })
      load()
    } catch (err) {
      setNotice(err.message)
    }
  }

  return (
    <section className="mp-card cm">
      <header className="mp-reg-head">
        <div>
          <h2>Control Measures</h2>
          <p>Define and manage the actions to control, minimize, and monitor the risk from asbestos-containing materials (ACMs).</p>
        </div>
        <button type="button" className="u-btn u-btn-primary" onClick={() => setDialog({ mode: 'add' })}><Plus size={15} />Add Control Measure</button>
      </header>
      {notice && <p className="u-banner">{notice}</p>}

      <div className="cm-layout">
        <div className="cm-main">
          <div className="cm-tiles">
            <Tile icon={ShieldCheck} value={s.total} label="Total ACMs" tone="blue" />
            <Tile icon={CircleCheck} value={s.implemented} label="Controls Implemented" tone="green" />
            <Tile icon={RefreshCw} value={s.inProgress} label="Controls In Progress" tone="purple" />
            <Tile icon={TriangleAlert} value={s.overdue} label="Controls Overdue" tone="amber" />
          </div>

          <div className="cm-filters">
            <label className="u-search"><Search size={15} />
              <input type="search" placeholder="Search by ACM, location or control…" value={f.q} onChange={(e) => set('q')(e.target.value)} aria-label="Search control measures" />
            </label>
            <SearchSelect variant="field" label="Building" value={f.building} onChange={set('building')} searchable={false}
              options={[{ value: '', label: 'All Buildings' }, ...buildingsList.map(([id, name]) => ({ value: id, label: name }))]} />
            <SearchSelect variant="field" label="Risk level" value={f.risk} onChange={set('risk')} searchable={false}
              options={[{ value: '', label: 'All Risk Levels' }, ...['High', 'Medium', 'Low'].map((x) => ({ value: x, label: x }))]} />
            <SearchSelect variant="field" label="Status" value={f.status} onChange={set('status')} searchable={false}
              options={[{ value: '', label: 'All Status' }, ...Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
            <button type="button" className="u-btn u-btn-outline mp-reg-reset" disabled={!filtered} onClick={() => { setF(EMPTY); setTypes([]) }} aria-label="Reset filters" title="Reset filters"><RotateCcw size={14} /></button>
          </div>

          <div className="mp-reg-scroll">
            <table className="mp-table cm-table">
              <colgroup><col className="cm-col-num" /><col className="cm-col-acm" /><col className="cm-col-risk" /><col /><col className="cm-col-resp" /><col className="cm-col-date" /><col className="cm-col-status" /><col className="cm-col-actions" /></colgroup>
              <thead><tr><th className="num">#</th><th>ACM / Location</th><th>Risk Level</th><th>Control Measure (Action)</th><th>Responsible</th><th>Target Date</th><th>Status</th><th className="ms-actions">Actions</th></tr></thead>
              <tbody>
                {!rows.length && <tr><td colSpan={8} className="u-muted">No control measures match these filters.</td></tr>}
                {rows.map((r, i) => {
                  const st = STATUS[r.status]
                  return (
                    <tr key={r.id}>
                      <td className="num">{i + 1}</td>
                      <td><strong className="mp-reg-room">{r.name}</strong><small>{r.building} › {r.room}</small></td>
                      <td>{r.risk ? <Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge> : '—'}</td>
                      <td><ul className="rl-duties cm-actions">{r.actions.map((a) => <li key={a}>{a}</li>)}</ul></td>
                      <td>{r.responsible}{r.responsiblePerson && <small>{r.responsiblePerson}</small>}</td>
                      <td className={`u-nowrap${r.status === 'overdue' ? ' mp-late' : ''}`}>{fmtDay(r.target)}</td>
                      <td><span className="ms-status"><Badge tone={st.tone}><st.icon size={13} />{st.label}</Badge>{r.work && <small>{r.work.id}</small>}</span></td>
                      <td className="ms-actions"><div>
                        <button type="button" className="u-row-btn" title="View" aria-label={`View control measures for ${r.ref}`} onClick={() => setDialog({ mode: 'view', record: r })}><Eye size={16} /></button>
                        <button type="button" className="u-row-btn" title="Edit" aria-label={`Edit control measures for ${r.ref}`} onClick={() => setDialog({ mode: 'edit', record: r })}><Pencil size={15} /></button>
                        <RowMenu r={r} onReset={() => reset(r)} />
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mp-reg-count">Showing {rows.length} of {records.length} ACMs</p>
        </div>

        <aside className="ms-side cm-side">
          <section className="ms-panel">
            <h3><ChartColumn size={18} />Control Measure Summary</h3>
            <ul className="cm-summary">
              {Object.entries(STATUS).map(([k, v]) => (
                <li key={k}>
                  <button type="button" className={f.status === k ? 'on' : undefined} onClick={() => set('status')(f.status === k ? '' : k)} aria-pressed={f.status === k}>
                    <span className={`cm-sum-icon tone-${v.tone}`}><v.icon size={15} /></span>{v.label}<strong className={k === 'overdue' && s.overdue ? 'late' : undefined}>{s[k]}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="ms-panel">
            <h3><Layers size={18} />Typical Control Measures</h3>
            <p className="u-muted cm-hint">Tick to show ACMs using a measure</p>
            <ul className="cm-types">
              {data.types.map((t) => {
                const n = records.filter((r) => r.measures.includes(t.id)).length
                return (
                  <li key={t.id}>
                    <label><input type="checkbox" checked={types.includes(t.id)} onChange={() => setTypes((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))} />
                      {t.label}<span className="cm-count">{n}</span></label>
                  </li>
                )
              })}
            </ul>
          </section>
        </aside>
      </div>

      <div className="mp-reg-note">
        <Info size={20} />
        <p><strong>Note</strong>Control measures are based on the risk assessment outcome and should be reviewed after inspections, incidents, or any change in ACM condition.</p>
      </div>

      {(dialog?.mode === 'add' || dialog?.mode === 'edit') && (
        <ControlDialog schoolId={schoolId} data={data} record={dialog.mode === 'edit' ? dialog.record : null} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />
      )}
      {dialog?.mode === 'view' && <ViewDialog r={dialog.record} onClose={() => setDialog(null)} onEdit={() => setDialog({ mode: 'edit', record: dialog.record })} />}
    </section>
  )
}
