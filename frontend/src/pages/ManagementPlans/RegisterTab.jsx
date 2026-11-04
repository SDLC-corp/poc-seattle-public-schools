import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Layers, TriangleAlert, CircleAlert, CircleCheck, Building2, MapPin, Search, Download, Plus, Eye, Pencil, Ellipsis, Info, RotateCcw, Wrench,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import AddAcmDialog from '../AcmInventory/AddAcmDialog'
import { CONDITION_TONE, RISK_TONE, floorLink } from '../AcmInventory/acmInventoryMeta'
import { request } from '../../lib/api'

const STATUS_LABEL = { 'ACM Present': 'Confirmed', 'Assumed ACM': 'Presumed' }
const STATUS_TONE = { 'ACM Present': 'critical', 'Assumed ACM': 'warning' }
const EMPTY = { q: '', building: '', type: '', risk: '', condition: '' }
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const extent = (r) => `${Number(r.quantity).toLocaleString()} ${r.unit === 'Sq ft' ? 'sq ft' : r.unit === 'Linear ft' ? 'linear ft' : r.unit?.toLowerCase() ?? ''}`.trim()

export function Tile({ icon: Icon, value, label, tone }) {
  return (
    <div className={`mp-tile ${tone}`}>
      <span className="mp-tile-icon"><Icon size={24} strokeWidth={1.8} /></span>
      <span className="mp-tile-text"><strong>{value ?? '—'}</strong><span>{label}</span></span>
    </div>
  )
}

export function RowMenu({ record }) {
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
  return (
    <div className="ai-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${record.ref}`} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={16} />
      </button>
      {open && (
        <div className="ai-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => navigate(`/operations/activities/new?material=${encodeURIComponent(record.id)}`)}><Wrench size={14} />Create O&amp;M work order</button>
          <button type="button" role="menuitem" onClick={() => navigate(floorLink(record))}><MapPin size={14} />Open room on floor plan</button>
        </div>
      )}
    </div>
  )
}

// Management plan › Asbestos Register: the school's confirmed and presumed ACMs with their control action
export default function RegisterTab({ schoolId, schoolName }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [f, setF] = useState(EMPTY)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    request(`/management-plans/${schoolId}/register`).then(setData).catch((e) => setError(e.message))
  }, [schoolId])

  const records = data?.records
  const options = useMemo(() => {
    const uniq = (key) => [...new Set((records ?? []).map((r) => r[key]).filter(Boolean))].sort()
    return { buildings: [...new Map((records ?? []).map((r) => [r.buildingId, r.building]))].sort((a, b) => a[1].localeCompare(b[1])), types: uniq('materialType'), conditions: uniq('condition') }
  }, [records])
  const rows = useMemo(() => {
    const term = f.q.trim().toLowerCase()
    return (records ?? []).filter((r) => (!f.building || r.buildingId === f.building)
      && (!f.type || r.materialType === f.type)
      && (!f.risk || r.risk === f.risk)
      && (!f.condition || r.condition === f.condition)
      && (!term || [r.id, r.ref, r.room, r.location, r.description, r.materialType, r.building].some((v) => String(v ?? '').toLowerCase().includes(term))))
  }, [records, f])
  const set = (key) => (value) => setF((x) => ({ ...x, [key]: value }))
  const active = Object.values(f).some(Boolean)

  const exportCsv = () => {
    const head = ['Reference ID', 'Building', 'Floor', 'Location / Room', 'Position', 'ACM Description', 'Material Type', 'Extent', 'Condition', 'Risk Level', 'Control Action', 'Status']
    const lines = rows.map((r) => [r.id, r.building, r.floor, r.room, r.location, r.description, r.materialType, extent(r), r.condition, r.risk ?? '', r.control.text, STATUS_LABEL[r.status]].map(csvCell).join(','))
    const blob = new Blob([[head.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `asbestos-register-${schoolId}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (error) return <div className="u-banner">Couldn't load the asbestos register ({error}).</div>
  const s = data?.stats

  return (
    <section className="mp-card mp-register">
      <header className="mp-reg-head">
        <div>
          <h2>Asbestos Register</h2>
          <p>A complete record of all known or presumed asbestos-containing materials (ACMs) at {schoolName}, including location, type, condition, and current action.</p>
        </div>
        <button type="button" className="u-btn u-btn-primary" onClick={() => setAdding(true)}><Plus size={15} />Add ACM</button>
      </header>

      <div className="mp-tiles">
        <Tile icon={Layers} value={s?.total} label="Total ACMs" tone="blue" />
        <Tile icon={TriangleAlert} value={s?.high} label="High Risk" tone="red" />
        <Tile icon={CircleAlert} value={s?.medium} label="Medium Risk" tone="amber" />
        <Tile icon={CircleCheck} value={s?.low} label="Low Risk" tone="green" />
        <Tile icon={Building2} value={s?.buildings} label="Buildings" tone="sky" />
        <Tile icon={MapPin} value={s?.locations} label="Locations" tone="purple" />
      </div>

      <div className="mp-reg-filters">
        <label className="u-search mp-reg-search">
          <Search size={15} />
          <input type="search" placeholder="Search by location, ACM, or reference ID…" value={f.q} onChange={(e) => set('q')(e.target.value)} aria-label="Search the asbestos register" />
        </label>
        <SearchSelect variant="field" label="Building" value={f.building} onChange={set('building')} searchable={false}
          options={[{ value: '', label: 'All Buildings' }, ...options.buildings.map(([id, name]) => ({ value: id, label: name }))]} />
        <SearchSelect variant="field" label="ACM type" value={f.type} onChange={set('type')} searchable={false}
          options={[{ value: '', label: 'All ACM Types' }, ...options.types.map((x) => ({ value: x, label: x }))]} />
        <SearchSelect variant="field" label="Risk level" value={f.risk} onChange={set('risk')} searchable={false}
          options={[{ value: '', label: 'All Risk Levels' }, ...['High', 'Medium', 'Low'].map((x) => ({ value: x, label: x }))]} />
        <SearchSelect variant="field" label="Condition" value={f.condition} onChange={set('condition')} searchable={false}
          options={[{ value: '', label: 'All Conditions' }, ...options.conditions.map((x) => ({ value: x, label: x }))]} />
        <button type="button" className="u-btn u-btn-outline mp-reg-reset" disabled={!active} onClick={() => setF(EMPTY)} aria-label="Reset filters" title="Reset filters"><RotateCcw size={14} /></button>
        <button type="button" className="u-btn u-btn-outline" onClick={exportCsv} disabled={!rows.length}><Download size={15} />Export</button>
      </div>

      <div className="mp-reg-scroll">
        <table className="mp-table mp-reg-table">
          <thead>
            <tr>
              <th className="num">#</th><th>Reference ID</th><th>Building</th><th>Location / Room</th><th>ACM Description</th><th>Material Type</th>
              <th>Extent (Approx.)</th><th>Condition</th><th>Risk Level</th><th>Control Action</th><th>Status</th><th className="mp-reg-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!data && <tr><td colSpan={12} className="u-muted">Loading the register…</td></tr>}
            {data && !rows.length && <tr><td colSpan={12} className="u-muted">{records.length ? 'No ACMs match these filters.' : 'No asbestos-containing materials are recorded for this school.'}</td></tr>}
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="num">{i + 1}</td>
                <td><span className="mp-reg-ref" title={r.id}>{r.ref}</span></td>
                <td>{r.building}</td>
                <td><strong className="mp-reg-room">{r.room}</strong><small>{r.location}</small></td>
                <td>{r.description}</td>
                <td>{r.materialType}{r.friability && <small>{r.friability}</small>}</td>
                <td className="u-nowrap">{extent(r)}</td>
                <td><Badge tone={CONDITION_TONE[r.condition] ?? 'neutral'}>{r.condition}</Badge></td>
                <td>{r.risk ? <Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge> : '—'}</td>
                <td className="mp-reg-control">{r.control.link ? <Link to={r.control.link} className="mp-link">{r.control.text}</Link> : r.control.text}</td>
                <td><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                <td className="mp-reg-actions">
                  <button type="button" className="u-row-btn" title="View on floor plan" aria-label={`View ${r.ref} on the floor plan`} onClick={() => navigate(floorLink(r))}><Eye size={16} /></button>
                  <button type="button" className="u-row-btn" title="Edit ACM record" aria-label={`Edit ${r.ref}`} onClick={() => navigate(floorLink(r), { state: { acm: { materialId: r.id } } })}><Pencil size={15} /></button>
                  <RowMenu record={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <p className="mp-reg-count">Showing {rows.length} of {records.length} ACMs</p>}

      <div className="mp-reg-note">
        <Info size={20} />
        <p><strong>Note</strong>The Asbestos Register is a live record and must be updated after surveys, inspections, maintenance works, or any change in ACM condition.</p>
      </div>

      {adding && <AddAcmDialog initial={{ school: schoolId }} onClose={() => setAdding(false)} />}
    </section>
  )
}
