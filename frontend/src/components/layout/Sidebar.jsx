import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { mainNav, adminNav } from './navItems'

function NavItem({ item, collapsed, activeId, onSelect, open, onToggle }) {
  const Icon = item.icon
  const hasChildren = Boolean(item.children?.length)
  const isActive = activeId === item.id || item.children?.some((c) => c.id === activeId)

  const handleClick = () => (hasChildren ? onToggle(item.id) : onSelect(item.id))

  return (
    <li>
      <button
        type="button"
        className={`nav-link${isActive ? ' active' : ''}`}
        onClick={handleClick}
        title={collapsed ? item.label : undefined}
        aria-expanded={hasChildren ? open : undefined}
      >
        <span className="nav-icon">
          <Icon size={20} strokeWidth={1.8} />
          {item.badge && collapsed && <span className="nav-dot" />}
        </span>
        <span className="nav-label">{item.label}</span>
        {item.badge && <span className="nav-badge">{item.badge}</span>}
        {hasChildren && <ChevronRight size={16} className={`nav-chevron${open ? ' open' : ''}`} />}
      </button>

      {hasChildren && open && !collapsed && (
        <ul className="nav-sub">
          {item.children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                className={`nav-sublink${activeId === child.id ? ' active' : ''}`}
                onClick={() => onSelect(child.id)}
              >
                {child.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Sidebar({ collapsed, mobileOpen, activeId, onSelect, onExpand }) {
  const [openGroups, setOpenGroups] = useState(() => new Set())

  const toggleGroup = (id) => {
    // In icon-only mode, clicking a group expands the sidebar so its children are reachable
    if (collapsed) {
      onExpand()
      setOpenGroups((prev) => new Set(prev).add(id))
      return
    }
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderList = (items) => (
    <ul className="nav-list">
      {items.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          collapsed={collapsed}
          activeId={activeId}
          onSelect={onSelect}
          open={openGroups.has(item.id)}
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
