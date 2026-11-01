import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, Link } from 'react-router'
import { Construction, SearchX } from 'lucide-react'
import AppLayout from './components/layout/AppLayout'
import { findNav, pathForId } from './components/layout/navItems'
import Dashboard from './pages/Dashboard/Dashboard'
import Settings from './pages/Settings/Settings'
import UsersRoles from './pages/Users/UsersRoles'
import AuditLogs from './pages/Audit/AuditLogs'
import Documents from './pages/Documents/Documents'
import Notifications from './pages/Notifications/Notifications'
import Compliance from './pages/Compliance/Compliance'
import AirMonitoring from './pages/AirMonitoring/AirMonitoring'
import Personnel from './pages/Personnel/Personnel'
import HelpPage from './pages/Help/HelpPage'
import { applyBrandColors } from './theme'

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
    const page = nav ? (nav.child?.label ?? nav.item.label) : 'Not found'
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
    fetch('/api/settings')
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
        <Route element={<AppLayout />}>
          <Route index element={<LandingRedirect landingPath={landingPath} />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users/:tab?" element={<UsersRoles />} />
          <Route path="settings/:tab?" element={<Settings />} />
          <Route path="audit/:tab?" element={<AuditLogs />} />
          <Route path="documents/:category?" element={<Documents />} />
          <Route path="notifications/:tab?" element={<Notifications />} />
          <Route path="compliance/:tab?" element={<Compliance />} />
          <Route path="air-monitoring/:tab?" element={<AirMonitoring />} />
          <Route path="personnel/:tab?" element={<Personnel />} />
          <Route path="contractors" element={<Navigate to="/personnel" replace />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Routes>
    </>
  )
}

export default App
