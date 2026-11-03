import SearchSelect from '../../components/ui/SearchSelect'

// Facility → building → floor, from the ACM inventory tree (only places that have ACM records)
export default function LocationFilters({ tree, value, onChange }) {
  const school = tree?.find((s) => s.id === value.school)
  const building = school?.buildings.find((b) => b.id === value.building)
  const set = (key) => (v) => onChange({
    ...value,
    [key]: v,
    ...(key === 'school' ? { building: '', floor: '' } : {}),
    ...(key === 'building' ? { floor: '' } : {}),
  })
  return (
    <>
      <div className="a-field">
        <span>Facility</span>
        <SearchSelect variant="field" label="Facility" value={value.school} onChange={set('school')} searchPlaceholder="Search facilities…"
          options={[{ value: '', label: 'All Facilities' }, ...(tree ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </div>
      <div className="a-field">
        <span>Building</span>
        <SearchSelect variant="field" label="Building" value={value.building} onChange={set('building')}
          options={[{ value: '', label: school ? 'All Buildings' : 'Select a facility first' }, ...(school?.buildings ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </div>
      <div className="a-field">
        <span>Floor</span>
        <SearchSelect variant="field" label="Floor" value={value.floor} onChange={set('floor')} searchable={false}
          options={[{ value: '', label: building ? 'All Floors' : 'Select a building first' }, ...(building?.floors ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
      </div>
    </>
  )
}
