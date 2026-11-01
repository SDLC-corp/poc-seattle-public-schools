import { Menu, Search, Bell, ChevronDown, School } from 'lucide-react'

export default function Topbar({ onToggleSidebar, notificationCount = 0, user }) {
  const initials = user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)

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
        <button type="button" className="icon-btn bell-btn" aria-label={`Notifications (${notificationCount})`}>
          <Bell size={22} />
          {notificationCount > 0 && <span className="bell-badge">{notificationCount}</span>}
        </button>

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
