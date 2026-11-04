import { Link } from 'react-router'
import {
  Building2, Layers3, ClipboardList, TriangleAlert, ClipboardCheck, ScanEye, Info, X, MapPin, CalendarDays, LoaderCircle,
  ChevronRight,
} from 'lucide-react'
import { fmtDay } from '../Surveillance/survMeta'

// Leaving fullscreen first, so the page we open isn't stuck behind the fullscreen map
const exitFullscreen = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) }

function Section({ icon: Icon, title, children }) {
  return (
    <section className="bo-section">
      <h4><Icon size={15} />{title}</h4>
      {children}
    </section>
  )
}

/**
 * Building overview for the dashboard map: compact in the popup, every section in the fullscreen side panel.
 * `state` = { loading } | { error } | { data } (from GET /api/buildings/:id/overview)
 */
export default function BuildingOverview({ state, variant = 'popup', onClose }) {
  const panel = variant === 'panel'
  if (!state || state.loading) return <div className={`bo bo-${variant} bo-loading`}><LoaderCircle size={18} className="bo-spin" />Loading building…</div>
  if (state.error) return <div className={`bo bo-${variant} bo-loading`}>Couldn’t load this building ({state.error}).</div>
  const d = state.data
  const place = { school: d.school.id, building: d.id }
  const buildingUrl = `/schools/${d.school.id}/buildings/${d.id}`
  const actions = [
    { label: 'View Building', to: buildingUrl, icon: Building2 },
    { label: 'View Floor Plans', to: `${buildingUrl}/floors`, icon: Layers3 },
    { label: 'View ACM Inventory', to: '/acm', icon: ClipboardList, state: { place } },
    { label: 'View Inspection History', to: '/inspections', icon: ClipboardCheck, state: { place } },
    { label: 'View Surveillance History', to: '/surveillance', icon: ScanEye, state: { place } },
  ]
  const c = d.condition

  return (
    <div className={`bo bo-${variant}`}>
      <header className="bo-head">
        <span className="bo-icon"><Building2 size={20} /></span>
        <div className="bo-title">
          <div><strong>{d.name}</strong><span className="bo-status">{d.status}</span></div>
          <small>{d.school.name} · Facility ID: {d.school.facilityId}</small>
        </div>
        {onClose && <button type="button" className="bo-close" onClick={onClose} aria-label="Close building details"><X size={16} /></button>}
      </header>

      <div className="bo-counts">
        <span><strong>{d.counts.floors}</strong>Floors</span>
        <span><strong>{d.counts.rooms}</strong>Rooms</span>
        <span><strong>{d.counts.acmRecords}</strong>ACM records</span>
        <span className={d.counts.acmRooms ? 'warn' : undefined}><strong>{d.counts.acmRooms}</strong>ACM-affected rooms</span>
      </div>

      {panel && (
        <Section icon={Info} title="Building Information">
          <dl className="bo-dl">
            <dt>Year Built</dt><dd>{d.info.yearBuilt ?? '—'}{d.info.presumedAcm && <em> · pre-1981, ACM presumed</em>}</dd>
            <dt>Building Usage</dt><dd>{d.info.usage}</dd>
            {d.info.construction && <><dt>Construction</dt><dd>{d.info.construction}</dd></>}
            {d.info.areaSqFt && <><dt>Area</dt><dd>{Number(d.info.areaSqFt).toLocaleString('en-US')} sq ft</dd></>}
            <dt>Address</dt><dd>{d.info.address ?? '—'}</dd>
          </dl>
        </Section>
      )}

      <Section icon={TriangleAlert} title="ACM Condition Summary">
        <div className="bo-cond">
          <span className="good"><strong>{c.good}</strong>Good</span>
          <span className="fair"><strong>{c.damaged}</strong>Damaged</span>
          <span className="poor"><strong>{c.significantlyDamaged}</strong>Significantly damaged</span>
          {c.notAssessed > 0 && <span className="na"><strong>{c.notAssessed}</strong>Not assessed</span>}
        </div>
      </Section>

      <div className={panel ? undefined : 'bo-two'}>
        <Section icon={ClipboardCheck} title="Inspection Summary">
          <dl className="bo-dl">
            <dt>Last inspection</dt><dd>{fmtDay(d.inspections.last)}</dd>
            <dt>{panel ? 'Next reinspection due' : 'Next due'}</dt><dd>{fmtDay(d.inspections.nextDue)}</dd>
            <dt>Completed</dt><dd>{d.inspections.completed}</dd>
            <dt>Pending</dt><dd>{d.inspections.pending}</dd>
          </dl>
        </Section>
        <Section icon={ScanEye} title="Surveillance Summary">
          <dl className="bo-dl">
            <dt>Last surveillance</dt><dd>{fmtDay(d.surveillance.last)}</dd>
            <dt>Completed</dt><dd>{d.surveillance.completed}</dd>
            <dt>Pending</dt><dd title="ACMs due or overdue for their 6-month check">{d.surveillance.pending}</dd>
            <dt>Follow-up actions</dt><dd>{d.surveillance.followUps}</dd>
          </dl>
        </Section>
      </div>

      <Section icon={CalendarDays} title="Quick Actions">
        <div className="bo-actions">
          {actions.map((a) => (
            <Link key={a.label} to={a.to} state={a.state} onClick={exitFullscreen}>
              <a.icon size={14} />{a.label}{panel && <ChevronRight size={14} className="bo-go" />}
            </Link>
          ))}
        </div>
      </Section>
      {panel && <p className="bo-foot"><MapPin size={12} />Click another building on the map to compare</p>}
    </div>
  )
}
