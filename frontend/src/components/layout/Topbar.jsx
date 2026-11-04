import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Menu, Search, Bell, ChevronDown, School, Cloud, LogOut, LogIn, ShieldCheck } from 'lucide-react'
import { useUnreadCount } from '../../lib/unreadNotifications'
import { useAuth } from '../../auth/authContext'

// `user` is the demo profile, shown when Microsoft sign-in isn't configured
export default function Topbar({ onToggleSidebar, user }) {
  const { configured, account, signOut } = useAuth()
  const name = account?.name ?? user.name
  const subtitle = account ? account.email : user.role
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const unread = useUnreadCount() ?? 0
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <header className="topbar">
      <button type="button" className="icon-btn menu-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <Menu size={22} />
      </button>

      <div className="brand">
        <span className="brand-logo"><School size={22} /></span>
        <span className="brand-text">
          <strong>Seattle Public Schools</strong>
          <small>Asbestos Reporting &amp; Compliance Management</small>
        </span>
      </div>

      <label className="search">
        <Search size={18} />
        <input type="search" placeholder="Search schools, buildings, rooms, ACM..." />
      </label>

      <div className="topbar-actions">
        <Link to="/notifications" className="icon-btn bell-btn" aria-label={`Notifications (${unread} unread)`} title={`${unread} unread notifications`}>
          <Bell size={22} />
          {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>

        <div className="user-menu-wrap" ref={menuRef}>
          <button type="button" className="user-menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="avatar">{initials}</span>
            <span className="user-text">
              <strong>{name}</strong>
              <small>{subtitle}</small>
            </span>
            <ChevronDown size={18} />
          </button>
          {open && (
            <div className="user-dropdown" role="menu">
              <div className="user-dropdown-head">
                <strong>{name}</strong>
                <span>{account ? account.email : configured ? 'Not signed in' : 'Demo mode — Microsoft sign-in isn’t set up'}</span>
                {account && <small><ShieldCheck size={12} />Signed in with Microsoft Entra ID</small>}
              </div>
              <Link to="/microsoft-365" role="menuitem" onClick={() => setOpen(false)}><Cloud size={15} />Microsoft 365</Link>
              {account
                ? <button type="button" role="menuitem" onClick={() => { setOpen(false); signOut() }}><LogOut size={15} />Sign out</button>
                : <Link to="/login" role="menuitem" onClick={() => setOpen(false)}><LogIn size={15} />{configured ? 'Sign in with Microsoft' : 'Sign-in page'}</Link>}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
