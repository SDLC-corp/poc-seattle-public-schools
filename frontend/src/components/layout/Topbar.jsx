import { Link } from 'react-router'
import { Menu, Search, Bell, ChevronDown, School } from 'lucide-react'
import { useUnreadCount } from '../../lib/unreadNotifications'

export default function Topbar({ onToggleSidebar, user }) {
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)
  const unread = useUnreadCount() ?? 0

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
        <Link to="/notifications/unread" className="icon-btn bell-btn" aria-label={`Notifications (${unread} unread)`} title={`${unread} unread notifications`}>
          <Bell size={22} />
          {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>

        <button type="button" className="user-menu">
          <span className="avatar">{initials}</span>
          <span className="user-text">
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </span>
          <ChevronDown size={18} />
        </button>
      </div>
    </header>
  )
}
