import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import './layout.css'

const STORAGE_KEY = 'sidebar-collapsed'
const MOBILE_QUERY = '(max-width: 768px)'

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
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onNavigate={() => setMobileOpen(false)}
          onExpand={() => setCollapsed(false)}
        />
        {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
        <main ref={mainRef} className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
