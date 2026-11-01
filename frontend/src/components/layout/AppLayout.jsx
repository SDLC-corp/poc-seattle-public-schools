import { useEffect, useState } from 'react'
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

export default function AppLayout({ children, activeId, onSelect }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // storage unavailable (private mode etc.) — collapse state just won't persist
    }
  }, [collapsed])

  const toggleSidebar = () => {
    // On small screens the sidebar is an overlay drawer instead of a collapsing rail
    if (window.matchMedia(MOBILE_QUERY).matches) setMobileOpen((o) => !o)
    else setCollapsed((c) => !c)
  }

  const handleSelect = (id) => {
    onSelect(id)
    setMobileOpen(false)
  }

  return (
    <div className="app-shell">
      <Topbar
        onToggleSidebar={toggleSidebar}
        notificationCount={5}
        user={{ name: 'John Doe', role: 'EHS Manager' }}
      />
      <div className="app-body">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          activeId={activeId}
          onSelect={handleSelect}
          onExpand={() => setCollapsed(false)}
        />
        {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
        <main className="app-main">{children}</main>
      </div>
    </div>
  )
}
