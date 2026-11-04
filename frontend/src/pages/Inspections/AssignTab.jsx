import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search, UserRoundPlus, CalendarClock } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import LocationFilters from '../Surveillance/LocationFilters'
import { fmtDay, isoToday, addDays, shortAcm } from '../Surveillance/survMeta'
import { CONDITION_TONE, fmtTime } from './inspMeta'
import { request } from '../../lib/api'

const STATUS_TONE = { 'ACM Present': 'critical', 'Assumed ACM': 'warning', 'No ACM': 'good', 'Not Yet Assessed': 'neutral' }
// Targeted inspections pick specific materials (with search); the other types cover every ACM in a place
const PICK_TYPES = ['Pre-Renovation Inspection']
const isAcm = (m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM'

/**
 * Initial / 3-year / follow-up inspections: choose a facility (building, floor) and every ACM there is assigned.
 * Targeted types: pick the materials one by one. Materials with an inspection under way are skipped.
 */
export default function AssignTab({ meta, onToast, onDone }) {
  const [materials, setMaterials] = useState(null)
  const [tree, setTree] = useState(null)
  const [location, setLocation] = useState({ school: '', building: '', floor: '' })
  const [acm, setAcm] = useState('ACM')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [form, setForm] = useState({ type: '3-Year Reinspection', inspectorId: '', scheduledDate: addDays(isoToday(), 7), scheduledTime: '09:00', notes: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    request('/inspection-records/materials').then(setMaterials).catch((e) => onToast({ kind: 'error', text: e.message }))
    request('/acm-inventory/tree').then(setTree).catch(() => {})
  }, [onToast])

  const today = isoToday()
  const pickMode = PICK_TYPES.includes(form.type)
  const shown = useMemo(() => {
    if (!materials) return []
    const term = pickMode ? q.trim().toLowerCase() : ''
    return materials.filter((m) => (!location.school || m.schoolId === location.school)
      && (!location.building || m.buildingId === location.building) && (!location.floor || m.floorId === location.floor)
      && (!pickMode ? isAcm(m) : acm === 'all' || (acm === 'ACM' ? isAcm(m) : m.acmStatus === acm))
      && (!term || [m.id, m.name, m.roomNumber, m.roomName, m.schoolName].some((v) => String(v ?? '').toLowerCase().includes(term))))
  }, [materials, location, acm, q, pickMode])

  const pickable = shown.filter((m) => !m.openInspection)
  // Location mode assigns every free ACM in the chosen facility / building / floor
  const targets = pickMode ? [...picked] : location.school ? pickable.map((m) => m.id) : []
  const rooms = new Set(shown.map((m) => m.roomId)).size
  const placeName = (() => {
    const s = tree?.find((x) => x.id === location.school)
    const b = s?.buildings.find((x) => x.id === location.building)
    const f = b?.floors.find((x) => x.id === location.floor)
    return [s?.name, b?.name, f?.name].filter(Boolean).join(' / ')
  })()
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
      const res = await request('/inspection-records/assign', { method: 'POST', body: { ...form, materialIds: targets } })
      const inspector = meta?.inspectors.find((u) => u.id === form.inspectorId)?.name
      onDone(`Assigned ${res.created.length} inspection${res.created.length === 1 ? '' : 's'} to ${inspector} for ${fmtDay(form.scheduledDate)} at ${fmtTime(form.scheduledTime)}${res.skipped.length ? ` (${res.skipped.length} skipped: already open)` : ''}.`)
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
          <h2 className="ai-records-title">{pickMode ? '1. Choose the ACM to inspect' : '1. Choose where to inspect'}</h2>
          <span className="u-muted">{pickMode ? `${picked.size} selected` : location.school ? `${targets.length} ACM` : ''}</span>
        </header>
        <div className={`ai-filters in-assign-filters${pickMode ? '' : ' no-search'}`}>
          <div className="a-field">
            <span>Inspection Type *</span>
            <SearchSelect variant="field" label="Inspection type" value={form.type} onChange={set('type')} searchable={false} options={(meta?.types ?? []).map((t) => ({ value: t, label: t }))} />
            {errors.type && <em className="uf-error">{errors.type}</em>}
          </div>
          <LocationFilters tree={tree} value={location} onChange={setLocation} />
          {pickMode && (
            <>
              <div className="a-field">
                <span>ACM Status</span>
                <SearchSelect variant="field" label="ACM status" value={acm} onChange={setAcm} searchable={false}
                  options={[{ value: 'ACM', label: 'ACM Present + Assumed' }, { value: 'all', label: 'All materials' }, { value: 'No ACM', label: 'No ACM' }, { value: 'Not Yet Assessed', label: 'Not Yet Assessed' }]} />
              </div>
              <div className="a-field in-search-field">
                <span>Search</span>
                <label className="u-search"><Search size={15} /><input type="search" placeholder="Material, room or ACM ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search materials" /></label>
              </div>
            </>
          )}
        </div>

        {!pickMode && (
          <div className="in-scope">
            {!materials ? <p className="u-muted">Loading materials…</p>
              : !location.school ? (
                <p className="u-muted">Choose a facility. A {form.type.toLowerCase()} covers every ACM there; narrow it to a building or floor if needed.</p>
              ) : (
                <>
                  <p>
                    <strong>{targets.length} ACM</strong> in {rooms} room{rooms === 1 ? '' : 's'} at <strong>{placeName}</strong> will each get a {form.type.toLowerCase()}.
                  </p>
                  {shown.length > targets.length && (
                    <p className="u-muted">{shown.length - targets.length} already have an inspection open and will be skipped.</p>
                  )}
                </>
              )}
          </div>
        )}

        {pickMode && <div className="u-table-wrap in-assign-table">
          <table className="u-table ai-table in-assign-grid">
            <colgroup>
              <col className="w-check" /><col className="w-material" /><col className="w-location" /><col className="w-status" /><col className="w-condition" /><col className="w-due" />
            </colgroup>
            <thead>
              <tr>
                <th className="in-col-check"><input type="checkbox" checked={allShownPicked} disabled={!pickable.length} onChange={toggleAll} aria-label="Select all shown" /></th>
                <th>Material / ACM</th><th>Location</th><th>ACM Status</th><th>Condition</th><th>Reinspection Due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id} className={picked.has(m.id) ? 'selected' : undefined}>
                  <td className="in-col-check">
                    <input type="checkbox" checked={picked.has(m.id)} disabled={!!m.openInspection} onChange={() => toggle(m.id)} aria-label={`Select ${m.name} in ${m.roomNumber}`} />
                  </td>
                  <td className="in-cell" title={`${m.name} · ${m.materialType} · ${m.id}`}>
                    <strong>{m.name}</strong><small><span className="in-acm-id">{shortAcm(m.id, m.schoolId)}</span> · {m.materialType}</small>
                  </td>
                  <td className="in-cell" title={`${m.roomNumber} – ${m.roomName}, ${m.schoolName} · ${m.buildingName} · ${m.floorName}`}>
                    <strong>{m.roomNumber} – {m.roomName}</strong><small>{m.schoolName} · {m.buildingName} · {m.floorName}</small>
                  </td>
                  <td><Badge tone={STATUS_TONE[m.acmStatus]}>{m.acmStatus}</Badge></td>
                  <td><Badge tone={CONDITION_TONE[m.condition]}>{m.condition}</Badge></td>
                  <td className="in-cell in-due">
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
              {materials && !shown.length && <tr><td colSpan={6} className="u-empty">No materials match. Try another facility or ACM status.</td></tr>}
              {!materials && <tr><td colSpan={6} className="u-empty">Loading materials…</td></tr>}
            </tbody>
          </table>
        </div>}
        {pickMode && shown.length > 200 && <p className="u-muted in-more">Showing the first 200 of {shown.length.toLocaleString('en-US')} materials — narrow by facility to see the rest.</p>}
        {errors.materialIds && <p className="uf-error">{errors.materialIds}</p>}
      </section>

      <aside className="u-card sv-side-card in-assign-side">
        <h3><UserRoundPlus size={16} />2. Assign</h3>
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
          <span>Inspection Time *</span>
          <input type="time" step={900} className={`u-input${errors.scheduledTime ? ' invalid' : ''}`} value={form.scheduledTime} onChange={(e) => set('scheduledTime')(e.target.value)} />
          {errors.scheduledTime && <em className="uf-error">{errors.scheduledTime}</em>}
        </label>
        <label className="uf-field">
          <span>Notes for the Inspector</span>
          <textarea className="u-input sv-textarea" rows={3} maxLength={500} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Access arrangements, contact on site…" />
        </label>
        <button type="button" className="u-btn u-btn-primary in-assign-btn" disabled={saving || !targets.length || !form.scheduledTime} onClick={assign}>
          <CalendarClock size={15} />{saving ? 'Assigning…' : `Assign ${targets.length || ''} Inspection${targets.length === 1 ? '' : 's'}`}
        </button>
        <p className="sv-hint">Each material gets its own inspection record, assigned and scheduled. The inspector finds them under My Assignments.</p>
      </aside>
    </div>
  )
}
