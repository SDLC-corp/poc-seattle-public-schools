import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import './layout.css'

const STORAGE_KEY = 'sidebar-collapsed'
const MOBILE_QUERY = '(max-width: 768px)'
// Wide working screens that start with the sidebar collapsed (Floor Plan & ACM Mapping)
const WIDE_ROUTES = [/^\/schools\/[^/]+\/buildings\/[^/]+\/floors\/[^/]+/]

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// Layout route: topbar + sidebar around the current page (<Outlet />)
export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mainRef = useRef(null)
  const { pathname } = useLocation()

  // On a wide screen the sidebar is collapsed until expanded there; the saved preference is left alone
  // and applies again on the next page (render-time reset when entering a wide screen, no effect needed)
  const wide = WIDE_ROUTES.some((r) => r.test(pathname))
  const [wideOpen, setWideOpen] = useState(false)
  const [wasWide, setWasWide] = useState(wide)
  if (wasWide !== wide) {
    setWasWide(wide)
    setWideOpen(false)
  }
  const railCollapsed = wide ? !wideOpen : collapsed

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // storage unavailable (private mode etc.) — collapse state just won't persist
    }
  }, [collapsed])

  // New page starts at the top (the content area scrolls, not the window)
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  const toggleSidebar = () => {
    // On small screens the sidebar is an overlay drawer instead of a collapsing rail
    if (window.matchMedia(MOBILE_QUERY).matches) setMobileOpen((o) => !o)
    else if (wide) setWideOpen((o) => !o)
    else setCollapsed((c) => !c)
  }

  return (
    <div className="app-shell">
      <Topbar
        onToggleSidebar={toggleSidebar}
        user={{ name: 'John Doe', role: 'EHS Manager' }}
      />
      <div className="app-body">
        <Sidebar
          collapsed={railCollapsed}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
          onExpand={() => (wide ? setWideOpen(true) : setCollapsed(false))}
        />
        {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
        <main ref={mainRef} className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
