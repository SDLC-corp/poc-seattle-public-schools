import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { X, Plus } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request } from '../../lib/api'
import { floorLink } from './acmInventoryMeta'

/**
 * ACM records belong to a room, so "Add ACM" picks the room first and then opens it on its floor plan
 * with the ACM form ready (FloorRooms reads `state.acm`). Starts from the location filters, if any.
 */
export default function AddAcmDialog({ initial, onClose }) {
  const navigate = useNavigate()
  const [pick, setPick] = useState({ school: initial.school ?? '', building: initial.building ?? '', floor: initial.floor ?? '', room: '' })
  const [lists, setLists] = useState({ schools: [], buildings: [], floors: [], rooms: [] })

  useEffect(() => {
    request('/schools').then((d) => setLists((l) => ({ ...l, schools: d.schools }))).catch(() => {})
  }, [])
  useEffect(() => {
    if (!pick.school) return
    request(`/schools/${pick.school}/buildings`).then((d) => setLists((l) => ({ ...l, buildings: d.buildings }))).catch(() => {})
  }, [pick.school])
  useEffect(() => {
    if (!pick.building) return
    request(`/floors?buildingId=${encodeURIComponent(pick.building)}`).then((d) => setLists((l) => ({ ...l, floors: d.floors }))).catch(() => {})
  }, [pick.building])
  useEffect(() => {
    if (!pick.floor) return
    request(`/rooms?floorId=${encodeURIComponent(pick.floor)}`).then((d) => setLists((l) => ({ ...l, rooms: d.rooms }))).catch(() => {})
  }, [pick.floor])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key, reset) => (value) => setPick((p) => ({ ...p, [key]: value, ...Object.fromEntries(reset.map((k) => [k, ''])) }))
  // Lists only count once their parent is picked (they may still hold the previous parent's items)
  const buildings = pick.school ? lists.buildings.filter((b) => b.schoolId === pick.school) : []
  const floors = pick.building ? lists.floors.filter((f) => f.buildingId === pick.building) : []
  const rooms = pick.floor ? lists.rooms.filter((r) => r.floorId === pick.floor) : []
  const ready = rooms.some((r) => r.id === pick.room)

  const go = () => {
    const room = rooms.find((r) => r.id === pick.room)
    navigate(floorLink({ schoolId: pick.school, buildingId: pick.building, floorId: pick.floor, roomId: room.id }), { state: { acm: { add: true } } })
  }

  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal ai-add" role="dialog" aria-modal="true" aria-labelledby="ai-add-title">
        <header className="u-modal-head ai-add-head">
          <h2 id="ai-add-title"><Plus size={18} />Add ACM Record</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          <p className="u-muted ai-add-intro">Choose the room the material is in. Its floor plan opens with the ACM form ready to fill in.</p>
          <div className="ai-add-grid">
            <div className="a-field"><span>Facility</span>
              <SearchSelect variant="field" label="Facility" value={pick.school} onChange={set('school', ['building', 'floor', 'room'])}
                searchPlaceholder="Search facilities…" options={[{ value: '', label: 'Select a facility' }, ...lists.schools.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
            <div className="a-field"><span>Building</span>
              <SearchSelect variant="field" label="Building" value={pick.building} onChange={set('building', ['floor', 'room'])}
                options={[{ value: '', label: pick.school ? 'Select a building' : 'Select a facility first' }, ...buildings.map((b) => ({ value: b.id, label: b.name }))]} />
            </div>
            <div className="a-field"><span>Floor</span>
              <SearchSelect variant="field" label="Floor" value={pick.floor} onChange={set('floor', ['room'])} searchable={false}
                options={[{ value: '', label: pick.building ? 'Select a floor' : 'Select a building first' }, ...floors.map((f) => ({ value: f.id, label: f.name }))]} />
            </div>
            <div className="a-field"><span>Room</span>
              <SearchSelect variant="field" label="Room" value={pick.room} onChange={set('room', [])} searchPlaceholder="Search rooms…"
                options={[
                  { value: '', label: !pick.floor ? 'Select a floor first' : rooms.length ? 'Select a room' : 'No rooms mapped on this floor' },
                  ...rooms.map((r) => ({ value: r.id, label: `${r.number} – ${r.name}` })),
                ]} />
            </div>
          </div>
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={!ready} onClick={go}>Continue to Room</button>
        </footer>
      </div>
    </div>
  )
}
