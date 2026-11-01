import { useEffect, useMemo, useState } from 'react'
import {
  School, Building2, Layers, ClipboardCheck, TriangleAlert, FileText, ChevronRight,
  CalendarDays, CalendarPlus, MapPin, FileUp, Map as MapIcon, ChartColumn, UsersRound,
  CircleCheck, FlaskConical, Wrench,
} from 'lucide-react'
import DonutChart from '../../components/charts/DonutChart'
import BarChart from '../../components/charts/BarChart'
import SchoolMap from './SchoolMap'
import SearchSelect from '../../components/ui/SearchSelect'
import {
  STATUS, kpis, acmByMaterial, inspectionStatus, upcomingInspections, recentActivities,
  mockComplianceStatus,
} from './mockData'
import './dashboard.css'

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)']
const STATUS_COLOR = {
  good: 'var(--status-good)',
  info: 'var(--primary)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
}

const ACTIVITY_ICON = {
  inspection: { icon: CircleCheck, tone: 'good' },
  lab: { icon: FlaskConical, tone: 'primary' },
  response: { icon: Wrench, tone: 'critical' },
  acm: { icon: MapPin, tone: 'warning' },
  document: { icon: FileText, tone: 'good' },
}

const QUICK_ACTIONS = [
  { label: 'Schedule Inspection', icon: CalendarPlus, tone: 'primary' },
  { label: 'Add ACM Location', icon: MapPin, tone: 'warning' },
  { label: 'Upload Document', icon: FileUp, tone: 'primary' },
  { label: 'View Floor Plans', icon: MapIcon, tone: 'violet' },
  { label: 'Generate Report', icon: ChartColumn, tone: 'primary' },
  { label: 'Manage Contractors', icon: UsersRound, tone: 'critical' },
]

const SCHOOL_TYPE_ORDER = ['Elementary', 'K-8', 'Middle', 'High', 'Other']
const SCHOOL_TYPE_LABEL = {
  Elementary: 'Elementary Schools',
  'K-8': 'K-8 Schools',
  Middle: 'Middle Schools',
  High: 'High Schools',
  Other: 'Other Programs',
}

const fmtDate = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function KpiCard({ icon: Icon, value, label, sublabel, tone, link }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span className="kpi-icon"><Icon size={24} strokeWidth={1.8} /></span>
      <div className="kpi-text">
        <strong>{value}</strong>
        <span className="kpi-label">
          {label}
          {link && <ChevronRight size={16} />}
        </span>
        {sublabel && <small>{sublabel}</small>}
      </div>
    </div>
  )
}

function Card({ title, action, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

const statusPillClass = { 'Due Soon': 'warning', Scheduled: 'info', Overdue: 'critical' }

export default function Dashboard() {
  const [schools, setSchools] = useState([])
  const [buildings, setBuildings] = useState([])
  const [buildingsLoaded, setBuildingsLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [selectedSchool, setSelectedSchool] = useState('')
  const [schoolType, setSchoolType] = useState('')

  useEffect(() => {
    const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    Promise.all([getJson('/api/schools'), getJson('/api/buildings')])
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

  const acmTotal = acmByMaterial.reduce((sum, d) => sum + d.value, 0)
  const acmData = acmByMaterial.map((d, i) => ({ ...d, color: SERIES[i] ?? 'var(--series-other)' }))
  const barData = inspectionStatus.map((d) => ({ ...d, color: STATUS_COLOR[d.status] }))

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

  return (
    <div className="dashboard">
      <div className="page-head">
        <div className="page-title">
          <h1>Dashboard</h1>
          <p>Overview of asbestos compliance and activities across Seattle Public Schools</p>
        </div>
        <div className="page-filters">
          {schoolFilters}
          <button type="button" className="filter-chip date-chip" aria-label="Date range">
            <CalendarDays size={14} />
            Jan 1 – Dec 31, 2026
          </button>
        </div>
      </div>

      {error && (
        <div className="banner-error">
          Couldn't load schools from the backend ({error}). Is it running on port 5000?
        </div>
      )}

      <div className="kpi-row">
        <KpiCard icon={School} value={schools.length ? visibleSchools.length : '—'} label={schoolType ? `${SCHOOL_TYPE_LABEL[schoolType]}` : 'Total Schools'} tone="primary" link />
        <KpiCard icon={Building2} value={buildingsLoaded ? visibleBuildings.length : '—'} label="Buildings" tone="good" link />
        <KpiCard icon={Layers} value={kpis.acmLocations.toLocaleString('en-US')} label="ACM Locations" tone="violet" link />
        <KpiCard icon={ClipboardCheck} value={kpis.inspectionsDue} label="Inspections Due" tone="warning" />
        <KpiCard icon={TriangleAlert} value={kpis.overdueItems} label="Overdue Items" tone="critical" />
        <KpiCard icon={FileText} value={kpis.responseActions} label="Open Responses" tone="teal" />
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
        <Card title="Upcoming Inspections" action={<a href="#" className="card-link">View All</a>}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>School</th><th>Building</th><th>Type</th><th>Status</th></tr>
              </thead>
              <tbody>
                {upcomingInspections.map((row) => (
                  <tr key={row.date + row.school}>
                    <td className="nowrap">{fmtDate(row.date)}</td>
                    <td>{row.school}</td>
                    <td>{row.building}</td>
                    <td>{row.type}</td>
                    <td><span className={`pill ${statusPillClass[row.status]}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid-3">
        <Card title="ACM by Material Type" className="card-chart">
          <DonutChart
            data={acmData}
            centerValue={acmTotal.toLocaleString('en-US')}
            centerLabel="Total ACM"
            ariaLabel="Asbestos-containing material locations by material type"
          />
        </Card>
        <Card title="Inspection Status (Current Cycle)" className="card-chart">
          <BarChart data={barData} ariaLabel="Inspections by status in the current cycle" />
        </Card>
        <Card title="Schools by Compliance Status" className="card-chart">
          <DonutChart
            data={complianceData}
            centerValue={schools.length ? visibleSchools.length : '—'}
            centerLabel={schoolType ? SCHOOL_TYPE_LABEL[schoolType] : 'Total Schools'}
            showCounts
            ariaLabel="Schools by compliance status"
          />
        </Card>
      </div>

      <div className="grid-bottom">
        <Card title="Recent Activities" action={<a href="#" className="card-link">View All</a>}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Date &amp; Time</th><th>User</th><th>Activity</th><th>Details</th></tr>
              </thead>
              <tbody>
                {recentActivities.map((row) => {
                  const { icon: Icon, tone } = ACTIVITY_ICON[row.kind]
                  return (
                    <tr key={row.at}>
                      <td className="nowrap">{fmtDateTime(row.at)}</td>
                      <td className="nowrap">{row.user}</td>
                      <td className="nowrap">
                        <span className={`activity tone-${tone}`}><Icon size={16} />{row.activity}</span>
                      </td>
                      <td>{row.details}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Quick Actions">
          <div className="quick-actions">
            {QUICK_ACTIONS.map(({ label, icon: Icon, tone }) => (
              <button key={label} type="button" className={`quick-action tone-${tone}`}>
                <Icon size={26} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
