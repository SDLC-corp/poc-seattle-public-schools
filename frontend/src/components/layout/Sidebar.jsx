import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { mainNav, adminNav, isPathActive } from './navItems'
import { useUnreadCount } from '../../lib/unreadNotifications'

function NavItem({ item, badges, collapsed, pathname, onNavigate, open, onToggle }) {
  const Icon = item.icon
  const hasChildren = Boolean(item.children?.length)
  const isActive = isPathActive(item.path, pathname)
  const badge = item.badgeKey ? badges[item.badgeKey] : item.badge
  const badgeText = badge > 99 ? '99+' : badge

  const content = (
    <>
      <span className="nav-icon">
        <Icon size={18} strokeWidth={1.8} />
        {badge > 0 && collapsed && <span className="nav-dot" />}
      </span>
      <span className="nav-label">{item.label}</span>
      {badge > 0 && <span className="nav-badge">{badgeText}</span>}
      {hasChildren && <ChevronRight size={16} className={`nav-chevron${open ? ' open' : ''}`} />}
    </>
  )

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          className={`nav-link${isActive ? ' active' : ''}`}
          onClick={() => onToggle(item.id)}
          title={collapsed ? item.label : undefined}
          aria-expanded={open}
        >
          {content}
        </button>
      ) : (
        <NavLink
          to={item.path}
          className={`nav-link${isActive ? ' active' : ''}`}
          title={collapsed ? item.label : undefined}
          onClick={onNavigate}
        >
          {content}
        </NavLink>
      )}

      {hasChildren && open && !collapsed && (
        <ul className="nav-sub">
          {item.children.map((child) => (
            <li key={child.id}>
              <NavLink
                to={child.path}
                className={`nav-sublink${isPathActive(child.path, pathname) ? ' active' : ''}`}
                onClick={onNavigate}
              >
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Sidebar({ collapsed, mobileOpen, onNavigate, onExpand }) {
  const { pathname } = useLocation()
  const badges = { unreadNotifications: useUnreadCount() ?? 0 }
  // Explicit open/closed choices; groups without one are open only if they hold the current page
  const [overrides, setOverrides] = useState(() => new Map())
  const activeGroupId = mainNav.find((i) => i.children && isPathActive(i.path, pathname))?.id
  const isOpen = (id) => (overrides.has(id) ? overrides.get(id) : id === activeGroupId)

  const toggleGroup = (id) => {
    // In icon-only mode, clicking a group expands the sidebar so its children are reachable
    const open = collapsed ? true : !isOpen(id)
    if (collapsed) onExpand()
    setOverrides((prev) => new Map(prev).set(id, open))
  }

  const renderList = (items) => (
    <ul className="nav-list">
      {items.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          badges={badges}
          collapsed={collapsed}
          pathname={pathname}
          onNavigate={onNavigate}
          open={isOpen(item.id)}
          onToggle={toggleGroup}
        />
      ))}
    </ul>
  )

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <nav aria-label="Main navigation" className="sidebar-scroll">
        {renderList(mainNav)}
        <hr className="nav-divider" />
        {renderList(adminNav)}
      </nav>
    </aside>
  )
}
