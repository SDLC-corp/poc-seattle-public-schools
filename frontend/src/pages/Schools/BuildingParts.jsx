import { Link } from 'react-router'
import {
  Building2, Layers, DoorOpen, TriangleAlert, ShieldCheck, ShieldQuestion, CircleCheck, CircleDashed, Eye, Pencil, X,
  CalendarDays, FolderOpen, Info,
} from 'lucide-react'
import { buildingTotals, fmtNum, PRESUMED_ACM_BEFORE } from './buildingUtils'

const ACM_BADGE = {
  'ACM Present': { cls: 'present', icon: TriangleAlert },
  'Assumed ACM': { cls: 'assumed', icon: ShieldQuestion },
  'No ACM': { cls: 'none', icon: CircleCheck },
  'Not Assessed': { cls: 'na', icon: CircleDashed },
  'Not Yet Assessed': { cls: 'na', icon: CircleDashed },
}

export function AcmBadge({ status }) {
  const s = ACM_BADGE[status] ?? ACM_BADGE['No ACM']
  const Icon = s.icon
  return <span className={`b-acm ${s.cls}`}><Icon size={12} />{status}</span>
}

function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag {...(onClick ? { type: 'button', onClick, 'aria-pressed': active } : {})}
      className={`kpi-card${onClick ? ' kpi-clickable' : ''} tone-${tone}${active ? ' active' : ''}`}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{fmtNum(value)}</strong>
        <span className="kpi-label">{label}</span>
      </span>
    </Tag>
  )
}

// Buildings · Total Floors · Total Rooms · Rooms with ACM · Rooms No ACM. `filter` is an ACM_FILTERS key.
export function BuildingKpis({ buildings, filter, onFilter }) {
  const t = buildings ? buildingTotals(buildings) : {}
  const pick = (key) => () => onFilter(filter === key ? '' : key)
  return (
    <div className="b-kpis">
      <Kpi icon={Building2} value={t.buildings} label="Buildings" tone="primary" active={!filter} onClick={() => onFilter('')} />
      <Kpi icon={Layers} value={t.floors} label="Total Floors" tone="violet" />
      <Kpi icon={DoorOpen} value={t.rooms} label="Total Rooms" tone="teal" />
      <Kpi icon={TriangleAlert} value={t.withAcm} label="Rooms with ACM" tone="warning" active={filter === 'acm'} onClick={pick('acm')} />
      <Kpi icon={ShieldCheck} value={t.noAcm} label="Rooms No ACM" tone="good" active={filter === 'No ACM'} onClick={pick('No ACM')} />
    </div>
  )
}

export function BuildingsTable({ buildings, selectedId, onView, onEdit, showSchool = false, emptyText = 'No buildings match.' }) {
  return (
    <div className="u-table-wrap">
      <table className="u-table c-table b-table">
        <thead>
          <tr>
            <th>Building Name</th>
            {showSchool && <th className="b-col-school">School</th>}
            <th>Building Code</th><th className="c-num">Year Built</th><th className="c-num">No. of Floors</th>
            <th className="c-num">No. of Rooms</th><th className="c-num b-col-acmrooms">Rooms with ACM</th><th>ACM Status</th><th className="b-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => (
            <tr key={b.id} className={b.id === selectedId ? 'selected' : ''} tabIndex={0}
              onClick={() => onView(b)} onKeyDown={(e) => { if (e.key === 'Enter') onView(b) }}>
              <td>
                <span className="b-name">
                  <span className={`b-thumb f${b.floors}`} aria-hidden="true"><Building2 size={16} /></span>
                  <span><Link className="b-link" to={`/schools/${b.schoolId}/buildings/${b.id}/floors`} onClick={(e) => e.stopPropagation()}>{b.name}</Link><small className="p-sub">{b.construction} · {fmtNum(b.areaSqFt)} sq ft</small></span>
                </span>
              </td>
              {showSchool && (
                <td className="b-col-school">
                  <Link to={`/schools/${b.schoolId}/buildings`} onClick={(e) => e.stopPropagation()}>{b.schoolName}</Link>
                </td>
              )}
              <td className="u-nowrap b-code">{b.code}</td>
              <td className="c-num">{b.yearBuilt}</td>
              <td className="c-num">{b.floors}</td>
              <td className="c-num">{fmtNum(b.rooms)}</td>
              <td className="c-num b-col-acmrooms">{b.roomsWithAcm ? fmtNum(b.roomsWithAcm) : '—'}</td>
              <td><AcmBadge status={b.acmStatus} /></td>
              <td className="b-col-actions">
                <span className="b-actions">
                  <button type="button" className="u-row-btn" title="View" aria-label={`View ${b.name}`} onClick={(e) => { e.stopPropagation(); onView(b) }}><Eye size={14} /></button>
                  {onEdit && <button type="button" className="u-row-btn" title="Edit" aria-label={`Edit ${b.name}`} onClick={(e) => { e.stopPropagation(); onEdit(b) }}><Pencil size={14} /></button>}
                </span>
              </td>
            </tr>
          ))}
          {!buildings.length && <tr><td colSpan={showSchool ? 9 : 8} className="u-empty">{emptyText}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// Right-hand panel: floor stack (max 3 floors), ACM room split and key facts
export function BuildingDetails({ building: b, onClose, onEdit, showSchoolLink = false }) {
  const perFloor = Math.round(b.rooms / b.floors)
  const acmPct = b.rooms ? Math.round((b.roomsWithAcm / b.rooms) * 100) : 0
  const floors = Array.from({ length: b.floors }, (_, i) => b.floors - i)

  return (
    <aside className="u-card sch-details b-details" aria-label="Building details">
      <header className="u-card-head">
        <h2>Building Details</h2>
        <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </header>

      <div className="sch-hero">
        <span className="cd-icon"><Building2 size={18} /></span>
        <div>
          <strong>{b.name}</strong>
          <span>{b.code}{showSchoolLink ? <> · <Link to={`/schools/${b.schoolId}/buildings`}>{b.schoolName}</Link></> : ''}</span>
        </div>
        <AcmBadge status={b.acmStatus} />
      </div>

      <div className="b-stack" aria-label={`${b.floors} floor${b.floors > 1 ? 's' : ''}`}>
        {floors.map((f) => (
          <div key={f} className="b-floor">
            <span>Floor {f}</span>
            <small>~{perFloor} rooms</small>
          </div>
        ))}
        <div className="b-ground" />
      </div>

      <div className="b-split">
        <div className="b-split-head">
          <span>Rooms with ACM</span>
          <strong>{fmtNum(b.roomsWithAcm)} of {fmtNum(b.rooms)} ({acmPct}%)</strong>
        </div>
        <div className="b-bar" role="img" aria-label={`${b.roomsWithAcm} of ${b.rooms} rooms have asbestos-containing material`}>
          {b.roomsWithAcm > 0 && <span className="b-bar-acm" style={{ width: `${Math.max(acmPct, 2)}%` }} />}
          <span className="b-bar-none" />
        </div>
        <div className="b-legend">
          <span><i className="b-sw acm" />With ACM {fmtNum(b.roomsWithAcm)}</span>
          <span><i className="b-sw none" />No ACM {fmtNum(b.rooms - b.roomsWithAcm)}</span>
        </div>
      </div>

      <dl className="cd-facts">
        <div className="cd-row"><dt>Year Built</dt><dd>{b.yearBuilt}</dd></div>
        <div className="cd-row"><dt>Floors</dt><dd>{b.floors}</dd></div>
        <div className="cd-row"><dt>Rooms</dt><dd>{fmtNum(b.rooms)}</dd></div>
        <div className="cd-row"><dt>Gross Area</dt><dd>{fmtNum(b.areaSqFt)} sq ft</dd></div>
        <div className="cd-row"><dt>Construction</dt><dd>{b.construction}</dd></div>
        <div className="cd-row"><dt>Pre-1981</dt><dd>{b.presumedAcm ? 'Yes – presumed ACM until sampled' : 'No'}</dd></div>
      </dl>

      {b.acmStatus === 'No ACM' && b.yearBuilt < PRESUMED_ACM_BEFORE && (
        <p className="b-note"><Info size={13} />Built before {PRESUMED_ACM_BEFORE}: AHERA presumes ACM unless sampling shows otherwise. Keep the lab results on file.</p>
      )}
      {b.source !== 'app' && <p className="ad-sample"><Info size={13} />Building, room and ACM figures are sample data.</p>}

      <div className="sch-actions">
        <Link className="u-btn u-btn-primary" to={`/schools/${b.schoolId}/buildings/${b.id}/floors`}><Layers size={15} />Floors &amp; Floor Plans</Link>
        {onEdit && <button type="button" className="u-btn u-btn-outline" onClick={() => onEdit(b)}><Pencil size={14} />Edit Building</button>}
        <Link className="u-btn u-btn-outline" to={`/schools/${b.schoolId}/inspections`}><CalendarDays size={15} />Inspections</Link>
        <Link className="u-btn u-btn-outline" to={`/schools/${b.schoolId}/documents`}><FolderOpen size={14} />Documents</Link>
      </div>
    </aside>
  )
}
