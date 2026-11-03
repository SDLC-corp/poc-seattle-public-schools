import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search, UserRoundPlus, CalendarClock } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import LocationFilters from '../Surveillance/LocationFilters'
import { fmtDay, isoToday, addDays, shortAcm } from '../Surveillance/survMeta'
import { CONDITION_TONE } from './inspMeta'
import { request } from '../../lib/api'

const STATUS_TONE = { 'ACM Present': 'critical', 'Assumed ACM': 'warning', 'No ACM': 'good', 'Not Yet Assessed': 'neutral' }
const DUE = [
  { value: '', label: 'Any due date' },
  { value: 'overdue', label: 'Reinspection overdue' },
  { value: '90', label: 'Due within 90 days' },
  { value: '365', label: 'Due within a year' },
]

/**
 * Pick ACM by location (and how soon its 3-year reinspection is due), then assign them to an inspector
 * for a date. Materials that already have an inspection under way can't be picked again.
 */
export default function AssignTab({ meta, onToast, onDone }) {
  const [materials, setMaterials] = useState(null)
  const [tree, setTree] = useState(null)
  const [location, setLocation] = useState({ school: '', building: '', floor: '' })
  const [acm, setAcm] = useState('ACM')
  const [due, setDue] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [form, setForm] = useState({ type: '3-Year Reinspection', inspectorId: '', scheduledDate: addDays(isoToday(), 7), notes: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    request('/inspection-records/materials').then(setMaterials).catch((e) => onToast({ kind: 'error', text: e.message }))
    request('/acm-inventory/tree').then(setTree).catch(() => {})
  }, [onToast])

  const today = isoToday()
  const shown = useMemo(() => {
    if (!materials) return []
    const term = q.trim().toLowerCase()
    const limit = due === '90' ? addDays(today, 90) : due === '365' ? addDays(today, 365) : null
    return materials.filter((m) => (!location.school || m.schoolId === location.school)
      && (!location.building || m.buildingId === location.building) && (!location.floor || m.floorId === location.floor)
      && (acm === 'all' || (acm === 'ACM' ? m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM' : m.acmStatus === acm))
      && (!due || (due === 'overdue' ? m.reinspectionDue && m.reinspectionDue < today : m.reinspectionDue && m.reinspectionDue <= limit))
      && (!term || [m.id, m.name, m.roomNumber, m.roomName, m.schoolName].some((v) => String(v ?? '').toLowerCase().includes(term))))
  }, [materials, location, acm, due, q, today])

  const pickable = shown.filter((m) => !m.openInspection)
  const visible = shown.slice(0, 200)
  const allShownPicked = pickable.length > 0 && pickable.every((m) => picked.has(m.id))
  const toggle = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setPicked((cur) => {
    const n = new Set(cur)
    pickable.slice(0, 200).forEach((m) => (allShownPicked ? n.delete(m.id) : n.add(m.id)))
    return n
  })
  const set = (key) => (v) => { setForm((f) => ({ ...f, [key]: v })); setErrors((e) => ({ ...e, [key]: undefined })) }

  const assign = async () => {
    setSaving(true)
    setErrors({})
    try {
      const res = await request('/inspection-records/assign', { method: 'POST', body: { ...form, materialIds: [...picked] } })
      const inspector = meta?.inspectors.find((u) => u.id === form.inspectorId)?.name
      onDone(`Assigned ${res.created.length} inspection${res.created.length === 1 ? '' : 's'} to ${inspector} for ${fmtDay(form.scheduledDate)}${res.skipped.length ? ` (${res.skipped.length} skipped: already open)` : ''}.`)
    } catch (e) {
      setErrors(e.fields ?? {})
      onToast({ kind: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const cert = meta?.inspectors.find((u) => u.id === form.inspectorId)?.certification
  const certLapses = cert?.expiresOn && form.scheduledDate && cert.expiresOn < form.scheduledDate

  return (
    <div className="in-assign">
      <section className="u-card ai-records">
        <header className="ai-group-head">
          <h2 className="ai-records-title">1. Choose the ACM to inspect</h2>
          <span className="u-muted">{picked.size} selected</span>
        </header>
        <div className="ai-filters in-assign-filters">
          <LocationFilters tree={tree} value={location} onChange={setLocation} />
          <div className="a-field">
            <span>ACM Status</span>
            <SearchSelect variant="field" label="ACM status" value={acm} onChange={setAcm} searchable={false}
              options={[{ value: 'ACM', label: 'ACM Present + Assumed' }, { value: 'all', label: 'All materials' }, { value: 'No ACM', label: 'No ACM' }, { value: 'Not Yet Assessed', label: 'Not Yet Assessed' }]} />
          </div>
          <div className="a-field">
            <span>Reinspection Due</span>
            <SearchSelect variant="field" label="Reinspection due" value={due} onChange={setDue} searchable={false} options={DUE} />
          </div>
          <div className="a-field">
            <span>Search</span>
            <label className="u-search"><Search size={15} /><input type="search" placeholder="Material, room or ACM ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search materials" /></label>
          </div>
        </div>

        <div className="u-table-wrap in-assign-table">
          <table className="u-table ai-table">
            <thead>
              <tr>
                <th className="in-col-check"><input type="checkbox" checked={allShownPicked} disabled={!pickable.length} onChange={toggleAll} aria-label="Select all shown" /></th>
                <th>ACM</th><th>Material</th><th>Location</th><th>ACM Status</th><th>Condition</th><th>Reinspection Due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id} className={picked.has(m.id) ? 'selected' : undefined}>
                  <td className="in-col-check">
                    <input type="checkbox" checked={picked.has(m.id)} disabled={!!m.openInspection} onChange={() => toggle(m.id)} aria-label={`Select ${m.name} in ${m.roomNumber}`} />
                  </td>
                  <td className="ai-id" title={m.id}>{shortAcm(m.id, m.schoolId)}</td>
                  <td className="ai-material"><strong>{m.name}</strong><small>{m.materialType}</small></td>
                  <td className="ai-room"><strong>{m.roomNumber} – {m.roomName}</strong><small>{m.schoolName} · {m.buildingName} · {m.floorName}</small></td>
                  <td><Badge tone={STATUS_TONE[m.acmStatus]}>{m.acmStatus}</Badge></td>
                  <td><Badge tone={CONDITION_TONE[m.condition]}>{m.condition}</Badge></td>
                  <td className="ai-room in-due">
                    {m.openInspection
                      ? <><Link to={`/inspections/records/${m.openInspection.id}`} className="sv-id">{m.openInspection.id}</Link><small>Already open</small></>
                      : (
                        <>
                          <strong className={`in-plain${m.reinspectionDue && m.reinspectionDue < today ? ' sv-late' : ''}`}>
                            {fmtDay(m.reinspectionDue)}{m.reinspectionDue && m.reinspectionDue < today && ' · overdue'}
                          </strong>
                          <small>{m.lastInspected ? `Last inspected ${fmtDay(m.lastInspected)}` : 'From inventory assessment'}</small>
                        </>
                      )}
                  </td>
                </tr>
              ))}
              {materials && !shown.length && <tr><td colSpan={7} className="u-empty">No materials match. Try another facility or due date.</td></tr>}
              {!materials && <tr><td colSpan={7} className="u-empty">Loading materials…</td></tr>}
            </tbody>
          </table>
        </div>
        {shown.length > 200 && <p className="u-muted in-more">Showing the first 200 of {shown.length.toLocaleString('en-US')} materials — narrow by facility to see the rest.</p>}
        {errors.materialIds && <p className="uf-error">{errors.materialIds}</p>}
      </section>

      <aside className="u-card sv-side-card in-assign-side">
        <h3><UserRoundPlus size={16} />2. Assign</h3>
        <div className="uf-field">
          <span>Inspection Type *</span>
          <SearchSelect variant="field" label="Inspection type" value={form.type} onChange={set('type')} searchable={false} options={(meta?.types ?? []).map((t) => ({ value: t, label: t }))} />
          {errors.type && <em className="uf-error">{errors.type}</em>}
        </div>
        <div className="uf-field">
          <span>Inspector *</span>
          <SearchSelect variant="field" label="Inspector" value={form.inspectorId} onChange={set('inspectorId')} searchable={false}
            options={[{ value: '', label: 'Choose an accredited inspector' }, ...(meta?.inspectors ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
          {cert && <small className={`sv-hint${certLapses ? ' sv-late' : ''}`}>{cert.number} · {certLapses ? 'expires before the scheduled date' : `valid to ${fmtDay(cert.expiresOn)}`}</small>}
          {errors.inspectorId && <em className="uf-error">{errors.inspectorId}</em>}
        </div>
        <label className="uf-field">
          <span>Scheduled Date *</span>
          <input type="date" className={`u-input${errors.scheduledDate ? ' invalid' : ''}`} value={form.scheduledDate} min={today} onChange={(e) => set('scheduledDate')(e.target.value)} />
          {errors.scheduledDate && <em className="uf-error">{errors.scheduledDate}</em>}
        </label>
        <label className="uf-field">
          <span>Notes for the Inspector</span>
          <textarea className="u-input sv-textarea" rows={3} maxLength={500} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Access arrangements, contact on site…" />
        </label>
        <button type="button" className="u-btn u-btn-primary in-assign-btn" disabled={saving || !picked.size} onClick={assign}>
          <CalendarClock size={15} />{saving ? 'Assigning…' : `Assign ${picked.size || ''} Inspection${picked.size === 1 ? '' : 's'}`}
        </button>
        <p className="sv-hint">Each material gets its own inspection record, assigned and scheduled. The inspector finds them under My Assignments.</p>
      </aside>
    </div>
  )
}
