import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useParams, Link } from 'react-router'
import { Construction, SearchX } from 'lucide-react'
import AppLayout from './components/layout/AppLayout'
import { findNav, pathForId } from './components/layout/navItems'
import RequireAuth from './auth/RequireAuth'

// Pages load on demand: each page's code is downloaded the first time it's opened (keeps the first load small)
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const Settings = lazy(() => import('./pages/Settings/Settings'))
const IntegrationsPage = lazy(() => import('./pages/Settings/IntegrationsPage'))
const Operations = lazy(() => import('./pages/Operations/Operations'))
const ActivityForm = lazy(() => import('./pages/Operations/ActivityForm'))
const ManagementPlan = lazy(() => import('./pages/ManagementPlans/ManagementPlan'))
const UsersRoles = lazy(() => import('./pages/Users/UsersRoles'))
const AuditLogs = lazy(() => import('./pages/Audit/AuditLogs'))
const Notifications = lazy(() => import('./pages/Notifications/Notifications'))
const Compliance = lazy(() => import('./pages/Compliance/Compliance'))
const AirMonitoring = lazy(() => import('./pages/AirMonitoring/AirMonitoring'))
const AirEventPage = lazy(() => import('./pages/AirMonitoring/AirEventPage'))
const Personnel = lazy(() => import('./pages/Personnel/Personnel'))
const HelpPage = lazy(() => import('./pages/Help/HelpPage'))
const Schools = lazy(() => import('./pages/Schools/Schools'))
const SchoolDetail = lazy(() => import('./pages/Schools/SchoolDetail'))
const Buildings = lazy(() => import('./pages/Schools/Buildings'))
const BuildingDetail = lazy(() => import('./pages/Schools/BuildingDetail'))
const RoomsFloorPlans = lazy(() => import('./pages/Schools/RoomsFloorPlans'))
const FloorRooms = lazy(() => import('./pages/Schools/FloorRooms'))
const LabSamples = lazy(() => import('./pages/LabSamples/LabSamples'))
const SamplePage = lazy(() => import('./pages/LabSamples/SamplePage'))
const Trends = lazy(() => import('./pages/Trends/Trends'))
const CostForecasting = lazy(() => import('./pages/Cost/CostForecasting'))
const InvoiceAnalysis = lazy(() => import('./pages/Cost/InvoiceAnalysis'))
const InvoiceDetail = lazy(() => import('./pages/Cost/InvoiceDetail'))
const CostReports = lazy(() => import('./pages/Cost/CostReports'))
const Reports = lazy(() => import('./pages/Reports/Reports'))
const AcmInventory = lazy(() => import('./pages/AcmInventory/AcmInventory'))
const Surveillance = lazy(() => import('./pages/Surveillance/Surveillance'))
const SurveillanceForm = lazy(() => import('./pages/Surveillance/SurveillanceForm'))
const Inspections = lazy(() => import('./pages/Inspections/Inspections'))
const InspectionForm = lazy(() => import('./pages/Inspections/InspectionForm'))
const LoginPage = lazy(() => import('./pages/Login/LoginPage'))
const Microsoft365 = lazy(() => import('./pages/Microsoft365/Microsoft365'))
import { applyBrandColors } from './theme'
import { API_BASE } from './lib/api'
const APP_NAME = 'Seattle Public Schools – Asbestos Compliance'

// Document Management is the Documents tab of Reports & Analytics; older /documents links land there
function DocumentsRedirect() {
  const { category } = useParams()
  return <Navigate to={`/reports/documents${category ? `/${category}` : ''}`} replace />
}

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
      {/* Outer boundary for pages outside the layout (sign-in); pages inside it show the layout's own loader */}
      <Suspense fallback={null}>
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
          <Route path="documents/:category?" element={<DocumentsRedirect />} />
          <Route path="notifications/:tab?" element={<Notifications />} />
          <Route path="compliance/:tab?" element={<Compliance />} />
          <Route path="air-monitoring/events/:id" element={<AirEventPage />} />
          <Route path="air-monitoring/:tab?" element={<AirMonitoring />} />
          <Route path="personnel/:tab?" element={<Personnel />} />
          <Route path="contractors" element={<Navigate to="/personnel/people" replace />} />
          <Route path="sampling" element={<LabSamples />} />
          <Route path="sampling/samples/:id" element={<SamplePage />} />
          <Route path="trends" element={<Trends />} />
          {/* Cost Intelligence: a static demo on local sample data */}
          <Route path="cost" element={<Navigate to="/cost/forecasting" replace />} />
          {/* Cost Overview was merged into Cost Forecasting; AI Cost Insights and Historical Cost Analysis were removed */}
          <Route path="cost/overview" element={<Navigate to="/cost/forecasting" replace />} />
          <Route path="cost/forecasting" element={<CostForecasting />} />
          <Route path="cost/invoices" element={<InvoiceAnalysis />} />
          <Route path="cost/invoices/:id" element={<InvoiceDetail />} />
          <Route path="cost/history" element={<Navigate to="/cost/forecasting" replace />} />
          <Route path="cost/insights" element={<Navigate to="/cost/forecasting" replace />} />
          <Route path="cost/reports" element={<CostReports />} />
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
      </Suspense>
    </>
  )
}

export default App
