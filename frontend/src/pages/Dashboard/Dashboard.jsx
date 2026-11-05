import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  School, Building2, Layers, ClipboardCheck, ChevronRight, Wrench, ShieldCheck, FlaskConical, GraduationCap,
  FileText, CircleCheck, Pencil, Trash2, Download, Activity, Wind, TriangleAlert, Clock,
} from 'lucide-react'
import DonutChart from '../../components/charts/DonutChart'
import BarChart from '../../components/charts/BarChart'
import SchoolMap from './SchoolMap'
import SearchSelect from '../../components/ui/SearchSelect'
import ComplianceCalendar from '../Compliance/ComplianceCalendar'
import { STATUS, mockComplianceStatus } from './mockData'
import { request, API_BASE } from '../../lib/api'
import '../Users/users.css'
import '../Compliance/compliance.css'
import './dashboard.css'

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)']
const GOOD = 'var(--status-good)'
const WARN = 'var(--status-warning)'
const CRIT = 'var(--status-critical)'
const INFO = 'var(--primary)'
const IDLE = '#9aa9b8'

const SCHOOL_TYPE_ORDER = ['Elementary', 'K-8', 'Middle', 'High', 'Other']
const SCHOOL_TYPE_LABEL = {
  Elementary: 'Elementary Schools',
  'K-8': 'K-8 Schools',
  Middle: 'Middle Schools',
  High: 'High Schools',
  Other: 'Other Programs',
}

// Audit log entries: what was done (tone) and in which module (icon)
const ACTION_META = {
  create: { label: 'Created', icon: CircleCheck, tone: 'good' },
  update: { label: 'Updated', icon: Pencil, tone: 'primary' },
  delete: { label: 'Deleted', icon: Trash2, tone: 'critical' },
  export: { label: 'Exported', icon: Download, tone: 'violet' },
}
const MODULE_ICON = {
  Inspections: ClipboardCheck, 'Operations & Maintenance': Wrench, Surveillance: ShieldCheck, 'ACM Inventory': Layers,
  'Lab & Sampling': FlaskConical, 'Air Monitoring': Wind, Documents: FileText, Personnel: GraduationCap, Compliance: ShieldCheck,
}

const OM_STATUS = {
  overdue: { label: 'Overdue', color: CRIT, pill: 'critical' },
  inProgress: { label: 'In Progress', color: INFO, pill: 'info' },
  pending: { label: 'Pending', color: WARN, pill: 'warning' },
  completed: { label: 'Completed', color: GOOD, pill: 'good' },
}

const fmtDate = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'))

function KpiCard({ icon: Icon, value, label, sublabel, tone, to }) {
  const body = (
    <>
      <span className="kpi-icon"><Icon size={24} strokeWidth={1.8} /></span>
      <div className="kpi-text">
        <strong>{value}</strong>
        <span className="kpi-label">
          {label}
          {to && <ChevronRight size={16} />}
        </span>
        {sublabel && <small>{sublabel}</small>}
      </div>
    </>
  )
  return to
    ? <Link to={to} className={`kpi-card kpi-link tone-${tone}`}>{body}</Link>
    : <div className={`kpi-card tone-${tone}`}>{body}</div>
}

function Card({ title, icon: Icon, action, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-header">
        <h2>{Icon && <Icon size={16} />}{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

const ViewAll = ({ to, children = 'View All' }) => <Link to={to} className="card-link">{children}</Link>

/** One horizontal bar split into parts (2px gaps), with a legend that carries the counts so it reads without colour. */
function StackBar({ parts, label }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="dash-stack">
      <div className="dash-stack-bar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        {total === 0 && <span className="dash-stack-empty" />}
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${num(p.value)} (${Math.round((p.value / total) * 100)}%)`} />
        ))}
      </div>
      <ul className="dash-stack-legend">
        {parts.map((p) => (
          <li key={p.label}><i style={{ background: p.color }} />{p.label}<strong>{num(p.value)}</strong></li>
        ))}
      </ul>
    </div>
  )
}

/** A figure with a label that links to the filtered list behind it. */
function Stat({ icon: Icon, value, label, tone, to }) {
  return (
    <Link to={to} className={`dash-stat tone-${tone}`}>
      <span className="dash-stat-icon"><Icon size={15} /></span>
      <span className="dash-stat-text"><strong>{num(value)}</strong><small>{label}</small></span>
      <ChevronRight size={14} className="dash-stat-arrow" />
    </Link>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [schools, setSchools] = useState([])
  const [buildings, setBuildings] = useState([])
  const [buildingsLoaded, setBuildingsLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [selectedSchool, setSelectedSchool] = useState('')
  const [schoolType, setSchoolType] = useState('')
  // Live figures from each module; a module that fails to load just shows dashes
  const [d, setD] = useState({})

  useEffect(() => {
    const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    Promise.all([getJson(`${API_BASE}/schools`), getJson(`${API_BASE}/buildings`)])
      .then(([schoolData, buildingData]) => {
        // Real status from the inspection schedule (API); placeholder only if the API doesn't provide it
        const statusById = Object.fromEntries(schoolData.schools.map((s) => [s.id, s.complianceStatus ?? mockComplianceStatus(s.id)]))
        setSchools(schoolData.schools.map((s) => ({ ...s, status: statusById[s.id] })))
        // Buildings take their school's compliance status so the 3D map colours match the pins
        setBuildings(buildingData.buildings.map((b) => ({ ...b, status: statusById[b.schoolId] ?? mockComplianceStatus(b.schoolId) })))
        setBuildingsLoaded(true)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    let cancelled = false
    const sources = {
      compliance: '/compliance/summary',
      acm: '/acm-inventory?pageSize=1',
      acmTypes: '/acm-inventory/groups?by=type',
      inspections: '/inspection-records?pageSize=1',
      om: '/om/activities?status=open&sort=dueDate&dir=asc&pageSize=5',
      surveillance: '/surveillance?pageSize=1',
      lab: '/lab-samples?pageSize=1',
      training: '/personnel/summary',
      audit: '/audit?group=data&pageSize=8',
    }
    Object.entries(sources).forEach(([key, url]) => {
      request(url).then((v) => { if (!cancelled) setD((cur) => ({ ...cur, [key]: v })) }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [])

  // Types present in the data, in a fixed grade order
  const schoolTypes = useMemo(() => {
    const present = new Set(schools.map((s) => s.type))
    return SCHOOL_TYPE_ORDER.filter((t) => present.has(t))
  }, [schools])

  const visibleSchools = useMemo(
    () => (schoolType ? schools.filter((s) => s.type === schoolType) : schools),
    [schools, schoolType],
  )
  const visibleBuildings = useMemo(() => {
    if (!schoolType) return buildings
    const ids = new Set(visibleSchools.map((s) => s.id))
    return buildings.filter((b) => ids.has(b.schoolId))
  }, [buildings, visibleSchools, schoolType])

  const changeSchoolType = (type) => {
    setSchoolType(type)
    // Drop a selected school that the new type filter would hide
    if (selectedSchool && type && schools.find((s) => s.id === selectedSchool)?.type !== type) setSelectedSchool('')
  }

  const complianceData = useMemo(() => {
    const counts = { compliant: 0, dueSoon: 0, overdue: 0 }
    visibleSchools.forEach((s) => { counts[s.status] += 1 })
    return Object.entries(STATUS).map(([key, s]) => ({ label: s.label, value: counts[key], color: s.color }))
  }, [visibleSchools])

  // ACM by material type: the five largest, the rest folded into Other
  const acmData = useMemo(() => {
    const rows = d.acmTypes?.rows ?? []
    const top = rows.slice(0, 5).map((r, i) => ({ label: r.label.replace(/ \(.*\)$/, ''), value: r.total, color: SERIES[i] }))
    const rest = rows.slice(5).reduce((s, r) => s + r.total, 0)
    return rest ? [...top, { label: 'Other', value: rest, color: 'var(--series-other)' }] : top
  }, [d.acmTypes])
  const acmTotal = d.acm?.stats.total

  const ins = d.inspections?.stats
  const inspectionBars = ins ? [
    { label: 'Completed', value: ins.completed, color: GOOD },
    { label: 'Scheduled', value: ins.scheduled, color: IDLE },
    { label: 'In Progress', value: ins.inProgress, color: INFO },
    { label: 'In Review', value: ins.pendingReview, color: WARN },
    { label: 'Overdue', value: ins.overdue, color: CRIT },
  ] : []

  const om = d.om?.stats
  const sv = d.surveillance?.stats
  const lab = d.lab?.stats
  const training = useMemo(() => {
    const cats = d.training?.byCategory ?? []
    const sum = (k) => cats.reduce((s, c) => s + c[k], 0)
    return { cats, compliant: sum('compliant'), dueSoon: sum('dueSoon'), expired: sum('expired'), total: sum('total') }
  }, [d.training])

  // Shared by the page header and the fullscreen map, so both stay in sync
  const schoolFilters = (
    <>
      <SearchSelect
        label="Type"
        value={schoolType}
        onChange={changeSchoolType}
        searchPlaceholder="Search types…"
        options={[
          { value: '', label: 'All Types', meta: String(schools.length) },
          ...schoolTypes.map((t) => ({
            value: t,
            label: SCHOOL_TYPE_LABEL[t],
            meta: String(schools.filter((s) => s.type === t).length),
          })),
        ]}
      />
      <SearchSelect
        label="School"
        value={selectedSchool}
        onChange={setSelectedSchool}
        searchPlaceholder="Search schools…"
        wide
        options={[
          { value: '', label: schoolType ? `All ${SCHOOL_TYPE_LABEL[schoolType]}` : 'All Schools' },
          ...visibleSchools.map((s) => ({ value: s.id, label: s.name, meta: s.type })),
        ]}
      />
    </>
  )

  const openInspections = ins ? ins.scheduled + ins.inProgress + ins.pendingReview : null
  const openOm = om ? om.pending + om.inProgress + om.overdue : null

  return (
    <div className="dashboard">
      <div className="page-head">
        <div className="page-title">
          <h1>Dashboard</h1>
          <p>Overview of asbestos compliance and activities across Seattle Public Schools</p>
        </div>
        <div className="page-filters">{schoolFilters}</div>
      </div>

      {error && (
        <div className="banner-error">
          Couldn't load schools from the backend ({error}). Is it running on port 5000?
        </div>
      )}

      <div className="kpi-row">
        <KpiCard icon={School} value={schools.length ? visibleSchools.length : '—'} label={schoolType ? SCHOOL_TYPE_LABEL[schoolType] : 'Total Schools'}
          sublabel={d.compliance && !schoolType ? `${d.compliance.compliancePct}% compliant` : null} tone="primary" to="/compliance" />
        <KpiCard icon={Building2} value={buildingsLoaded ? visibleBuildings.length : '—'} label="Buildings" tone="good" to="/schools/buildings" />
        <KpiCard icon={Layers} value={num(acmTotal)} label="ACM Locations" tone="violet" to="/acm"
          sublabel={d.acm ? `${num(d.acm.stats.acmPresent)} present · ${num(d.acm.stats.assumed)} assumed` : null} />
        <KpiCard icon={ClipboardCheck} value={num(openInspections)} label="Open Inspections" tone="warning" to="/inspections"
          sublabel={ins ? `${num(ins.pendingReview)} in review · ${num(ins.overdue)} overdue` : null} />
        <KpiCard icon={Wrench} value={num(openOm)} label="Open O&M Activities" tone="critical" to="/operations"
          sublabel={om ? `${num(om.overdue)} overdue` : null} />
        <KpiCard icon={ShieldCheck} value={num(sv?.dueNext30)} label="Surveillance Due (30d)" tone="teal" to="/surveillance/schedule"
          sublabel={sv ? `${num(sv.overdue)} overdue` : null} />
      </div>

      <div className="grid-map">
        <Card title="School Locations" className="card-map">
          <SchoolMap
            schools={visibleSchools}
            buildings={visibleBuildings}
            selectedId={selectedSchool}
            fullscreenControls={schoolFilters}
          />
        </Card>
        {/* Compliance & Tracking's inspection calendar; an event opens it there */}
        <ComplianceCalendar stacked title="Compliance Calendar" action={<ViewAll to="/compliance">Open Compliance</ViewAll>}
          onSelectInspection={(id) => navigate(`/compliance?inspection=${encodeURIComponent(id)}`)} />
      </div>

      <div className="grid-3">
        <Card title="ACM by Material Type" className="card-chart" action={<ViewAll to="/acm" />}>
          <DonutChart
            data={acmData}
            centerValue={num(acmTotal)}
            centerLabel="Total ACM"
            ariaLabel="Asbestos-containing material locations by material type"
          />
        </Card>
        <Card title="Inspection Status" className="card-chart" action={<ViewAll to="/inspections" />}>
          {ins ? <BarChart data={inspectionBars} ariaLabel="Inspections by status" /> : <p className="dash-empty">Loading…</p>}
        </Card>
        <Card title="Schools by Compliance Status" className="card-chart" action={<ViewAll to="/compliance" />}>
          <DonutChart
            data={complianceData}
            centerValue={schools.length ? visibleSchools.length : '—'}
            centerLabel={schoolType ? SCHOOL_TYPE_LABEL[schoolType] : 'Total Schools'}
            showCounts
            ariaLabel="Schools by compliance status"
          />
        </Card>
      </div>

      <div className="grid-3 dash-modules">
        {/* Operations & Maintenance: status split and the open work due first */}
        <Card title="Operations & Maintenance" icon={Wrench} action={<ViewAll to="/operations" />}>
          <StackBar label="O&M activities by status" parts={om ? Object.entries(OM_STATUS).map(([k, s]) => ({ label: s.label, value: om[k], color: s.color })) : []} />
          <h3 className="dash-sub">Open activities due first</h3>
          <ul className="dash-list">
            {(d.om?.activities ?? []).map((a) => (
              <li key={a.id}>
                <Link to={`/operations/activities/${a.id}`}>
                  <span className="dash-list-main">
                    <strong>{a.type}<em>{a.id}</em></strong>
                    <small>{a.schoolName} · {a.materialName}{a.assignedToName ? ` · ${a.assignedToName}` : ''}</small>
                  </span>
                  <span className="dash-list-side">
                    <span className={`pill ${OM_STATUS[a.status]?.pill ?? 'info'}`}>{a.statusLabel}</span>
                    <small>Due {fmtDate(a.dueDate)}</small>
                  </span>
                </Link>
              </li>
            ))}
            {d.om && d.om.activities.length === 0 && <li className="dash-empty">No open O&amp;M activities.</li>}
          </ul>
        </Card>

        {/* Surveillance and lab: what needs attention, each linking to its list */}
        <Card title="Surveillance & Lab Results" icon={ShieldCheck} action={<ViewAll to="/surveillance" />}>
          <h3 className="dash-sub dash-sub-first">ACM condition at last surveillance</h3>
          <StackBar label="Surveillance condition" parts={sv ? [
            { label: 'Good', value: sv.good, color: GOOD },
            { label: 'Damaged', value: sv.damaged, color: WARN },
            { label: 'Significantly Damaged', value: sv.significantlyDamaged, color: CRIT },
          ] : []} />
          <div className="dash-stats">
            <Stat icon={TriangleAlert} value={sv?.overdue} label="Surveillance overdue" tone="critical" to="/surveillance/schedule" />
            <Stat icon={Clock} value={sv?.dueNext30} label="Due in 30 days" tone="warning" to="/surveillance/schedule" />
            <Stat icon={Activity} value={sv?.actionRequired} label="Corrective action required" tone="primary" to="/surveillance/findings" />
            <Stat icon={FlaskConical} value={lab?.detected} label={`Samples with asbestos detected${lab ? ` of ${num(lab.total)}` : ''}`} tone="violet" to="/sampling" />
            <Stat icon={Clock} value={lab ? lab.pending + lab.inconclusive : null} label="Lab results pending / inconclusive" tone="teal" to="/sampling" />
          </div>
        </Card>

        {/* AHERA training: who is current, due soon or lapsed, per group of people */}
        <Card title="Training & Certifications" icon={GraduationCap} action={<ViewAll to="/personnel" />}>
          <StackBar label="People by training status" parts={d.training ? [
            { label: 'Current', value: training.compliant, color: GOOD },
            { label: 'Due Soon', value: training.dueSoon, color: WARN },
            { label: 'Expired', value: training.expired, color: CRIT },
          ] : []} />
          <h3 className="dash-sub">By group</h3>
          <ul className="dash-groups">
            {training.cats.filter((c) => c.total > 0).map((c) => (
              <li key={c.id}>
                <span className="dash-group-name">{c.label}<small>{c.total} people</small></span>
                <span className="dash-group-bar" aria-hidden="true">
                  {c.compliant > 0 && <i style={{ flexGrow: c.compliant, background: GOOD }} />}
                  {c.dueSoon > 0 && <i style={{ flexGrow: c.dueSoon, background: WARN }} />}
                  {c.expired > 0 && <i style={{ flexGrow: c.expired, background: CRIT }} />}
                </span>
                <span className="dash-group-pct">{c.total ? Math.round((c.compliant / c.total) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Recent Activities" action={<ViewAll to="/audit" />}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Date &amp; Time</th><th>User</th><th>Activity</th><th>Module</th><th>Details</th></tr>
            </thead>
            <tbody>
              {(d.audit?.entries ?? []).map((e) => {
                const meta = ACTION_META[e.action] ?? { label: e.action, icon: Activity, tone: 'primary' }
                const Icon = MODULE_ICON[e.module] ?? meta.icon
                return (
                  <tr key={e.id} className={e.link ? 'dash-row-link' : ''} onClick={e.link ? () => navigate(e.link) : undefined}>
                    <td className="nowrap">{fmtDateTime(e.at)}</td>
                    <td className="nowrap">{e.user?.name}</td>
                    <td className="nowrap"><span className={`activity tone-${meta.tone}`}><Icon size={16} />{meta.label}</span></td>
                    <td className="nowrap">{e.module}</td>
                    <td>{e.summary}</td>
                  </tr>
                )
              })}
              {d.audit && d.audit.entries.length === 0 && <tr><td colSpan={5} className="dash-empty">No recent activity.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
