import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, Link } from 'react-router'
import { Construction, SearchX } from 'lucide-react'
import AppLayout from './components/layout/AppLayout'
import { findNav, pathForId } from './components/layout/navItems'
import Dashboard from './pages/Dashboard/Dashboard'
import Settings from './pages/Settings/Settings'
import IntegrationsPage from './pages/Settings/IntegrationsPage'
import Operations from './pages/Operations/Operations'
import ActivityForm from './pages/Operations/ActivityForm'
import ManagementPlan from './pages/ManagementPlans/ManagementPlan'
import UsersRoles from './pages/Users/UsersRoles'
import AuditLogs from './pages/Audit/AuditLogs'
import Documents from './pages/Documents/Documents'
import Notifications from './pages/Notifications/Notifications'
import Compliance from './pages/Compliance/Compliance'
import AirMonitoring from './pages/AirMonitoring/AirMonitoring'
import Personnel from './pages/Personnel/Personnel'
import HelpPage from './pages/Help/HelpPage'
import Schools from './pages/Schools/Schools'
import SchoolDetail from './pages/Schools/SchoolDetail'
import Buildings from './pages/Schools/Buildings'
import BuildingDetail from './pages/Schools/BuildingDetail'
import RoomsFloorPlans from './pages/Schools/RoomsFloorPlans'
import FloorRooms from './pages/Schools/FloorRooms'
import LabSamples from './pages/LabSamples/LabSamples'
import Reports from './pages/Reports/Reports'
import AcmInventory from './pages/AcmInventory/AcmInventory'
import Surveillance from './pages/Surveillance/Surveillance'
import SurveillanceForm from './pages/Surveillance/SurveillanceForm'
import Inspections from './pages/Inspections/Inspections'
import InspectionForm from './pages/Inspections/InspectionForm'
import LoginPage from './pages/Login/LoginPage'
import Microsoft365 from './pages/Microsoft365/Microsoft365'
import RequireAuth from './auth/RequireAuth'
import { applyBrandColors } from './theme'
import { API_BASE } from './lib/api'
const APP_NAME = 'Seattle Public Schools – Asbestos Compliance'

// Placeholder for menu entries whose page isn't built yet; anything else is a 404
function PlaceholderPage() {
  const { pathname } = useLocation()
  const nav = findNav(pathname)
  if (!nav) {
    return (
      <div className="coming-soon">
        <SearchX size={30} />
        <strong>Page not found</strong>
        <span>There's nothing at <code>{pathname}</code>. <Link to="/dashboard">Go to the dashboard</Link></span>
      </div>
    )
  }
  return (
    <div className="coming-soon">
      <Construction size={30} />
      <strong>{nav.child ? `${nav.item.label} › ${nav.child.label}` : nav.item.label}</strong>
      <span>This page hasn't been built yet.</span>
    </div>
  )
}

// Browser tab title follows the current page
function DocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const nav = findNav(pathname)
    // Pages reached from the user menu rather than the sidebar
    const page = pathname === '/login' ? 'Sign in'
      : pathname.startsWith('/microsoft-365') ? 'Microsoft 365'
        : nav ? (nav.child?.label ?? nav.item.label) : 'Not found'
    document.title = `${page} · ${APP_NAME}`
  }, [pathname])
  return null
}

// "/" goes to the landing page chosen in Settings (falls back to the dashboard)
function LandingRedirect({ landingPath }) {
  if (landingPath === undefined) return null // settings still loading
  return <Navigate to={landingPath ?? '/dashboard'} replace />
}

function App() {
  const [landingPath, setLandingPath] = useState(undefined)

  // Apply saved brand colours and resolve the configured landing page
  useEffect(() => {
    fetch(`${API_BASE}/settings`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) applyBrandColors(s.theme)
        setLandingPath(pathForId(s?.application?.defaultLandingPage) ?? null)
      })
      .catch(() => setLandingPath(null)) // backend down: keep built-in defaults
  }, [])

  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route path="login" element={<LoginPage />} />        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<LandingRedirect landingPath={landingPath} />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users/:tab?" element={<UsersRoles />} />
          <Route path="settings/:tab?" element={<Settings />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="management-plans/:tab?" element={<ManagementPlan />} />
          <Route path="operations/activities/new" element={<ActivityForm />} />
          <Route path="operations/activities/:id" element={<ActivityForm />} />
          <Route path="operations/:tab?" element={<Operations />} />
          <Route path="audit/:tab?" element={<AuditLogs />} />
          <Route path="documents/:category?" element={<Documents />} />
          <Route path="notifications/:tab?" element={<Notifications />} />
          <Route path="compliance/:tab?" element={<Compliance />} />
          <Route path="air-monitoring/:tab?" element={<AirMonitoring />} />
          <Route path="personnel/:tab?" element={<Personnel />} />
          <Route path="contractors" element={<Navigate to="/personnel" replace />} />
          <Route path="sampling" element={<LabSamples />} />
          <Route path="sampling/*" element={<Navigate to="/sampling" replace />} />
          <Route path="reports/:tab?/:report?" element={<Reports />} />
          <Route path="acm/:tab?" element={<AcmInventory />} />
          <Route path="surveillance/new" element={<SurveillanceForm />} />
          <Route path="surveillance/records/:id" element={<SurveillanceForm />} />
          <Route path="surveillance/:tab?" element={<Surveillance />} />
          <Route path="inspections/new" element={<InspectionForm />} />
          <Route path="inspections/records/:id" element={<InspectionForm />} />
          <Route path="inspections/:tab?" element={<Inspections />} />
          <Route path="microsoft-365/:tab?" element={<Microsoft365 />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="schools" element={<Navigate to="/schools/list" replace />} />
          <Route path="schools/list" element={<Schools />} />
          <Route path="schools/buildings" element={<Buildings />} />
          <Route path="schools/floors" element={<RoomsFloorPlans view="floors" />} />
          {/* Reached from the Floors page tabs (no longer in the sidebar) */}
          <Route path="schools/rooms" element={<RoomsFloorPlans view="rooms" />} />
          <Route path="schools/acm-materials" element={<RoomsFloorPlans view="acm" />} />
          <Route path="schools/:schoolId/:tab?" element={<SchoolDetail />} />
          <Route path="schools/:schoolId/buildings/:buildingId/:tab?" element={<BuildingDetail />} />
          <Route path="schools/:schoolId/buildings/:buildingId/floors/:floorId" element={<FloorRooms />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
