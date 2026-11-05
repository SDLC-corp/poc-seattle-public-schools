import { Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ChatAssistant from './ChatAssistant'
import NavTrail from './NavTrail'
import { useAuth } from '../../auth/authContext'
import { request } from '../../lib/api'
import { prefetchPath, prefetchCommonPages } from '../../lib/prefetchPages'
import './layout.css'

const STORAGE_KEY = 'sidebar-collapsed'
const MOBILE_QUERY = '(max-width: 768px)'
// Wide working screens that start with the sidebar collapsed (Floor Plan & ACM Mapping, Management Plan, an invoice)
const WIDE_ROUTES = [/^\/schools\/[^/]+\/buildings\/[^/]+\/floors\/[^/]+/, /^\/management-plans(\/|$)/, /^\/cost\/invoices\/[^/]+/]

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
  const { account } = useAuth()
  // The person the backend credits with this session's actions (verified sign-in, else the demo user)
  const [me, setMe] = useState(null)
  useEffect(() => {
    let cancelled = false
    request('/me').then((u) => { if (!cancelled) setMe({ name: u.name, role: u.role }) }).catch(() => {})
    return () => { cancelled = true }
  }, [account?.id])

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

  // Page switching feels instant: a link's page code starts loading when the pointer rests on it (or keyboard focus
  // reaches it), and the most used pages load quietly once the app is idle
  useEffect(() => {
    const onIntent = (e) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null
      if (a) prefetchPath(a.getAttribute('href'))
    }
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    prefetchCommonPages()
    return () => {
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
    }
  }, [])

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
        user={me ?? { name: account?.name ?? 'John Doe', role: account ? '' : 'EHS Manager' }}
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
          <NavTrail />
          {/* A page's code loads the first time it's opened (App.jsx lazy routes) */}
          <Suspense fallback={<div className="page-loading" role="status"><span className="page-loading-spinner" />Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <ChatAssistant />
    </div>
  )
}
