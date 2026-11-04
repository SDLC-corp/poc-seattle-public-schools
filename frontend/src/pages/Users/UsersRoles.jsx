import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  UsersRound, UserCog, School, Wrench, HardHat, UserX, Plus, FileUp, EllipsisVertical, Download,
  CircleCheck, CircleAlert, Construction,
} from 'lucide-react'
import UsersTab from './UsersTab'
import RolesTab from './RolesTab'
import PermissionsTab from './PermissionsTab'
import UserForm from './UserForm'
import { request } from './api'
import { FACILITIES_STAFF, readFilters, filterQuery } from './filters'
import './users.css'
import { API_BASE } from '../../lib/api'

const TABS = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'access', label: 'School Access' },
  { id: 'activity', label: 'Activity Log' },
]

// KPI card that doubles as a quick filter
function Kpi({ icon: Icon, value, label, tone, active, onClick, hint }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`}
      onClick={onClick} aria-pressed={active} title={hint}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
      </span>
    </button>
  )
}

export default function UsersRoles() {
  // Active tab lives in the URL: /users/:tab (Users when omitted)
  const { tab = 'users' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Keep the list filters when switching back to the Users tab
  const setTab = (id) => navigate(id === 'users' ? `/users${searchParams.size ? `?${searchParams}` : ''}` : `/users/${id}`)
  const [stats, setStats] = useState(null)
  const [roleData, setRoleData] = useState({ roles: [], permissions: [], systemRole: null })
  const [schools, setSchools] = useState([])
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null) // { user? } when the add/edit dialog is open
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const loadStats = useCallback(() => request('/users/stats').then(setStats).catch(() => {}), [])

  // After a role is created/edited/deleted: refresh roles, counts and the user list
  const onRolesChanged = useCallback(() => {
    request('/roles').then(setRoleData).catch(() => {})
    loadStats()
    setRefreshKey((k) => k + 1)
  }, [loadStats])

  useEffect(() => {
    Promise.all([request('/roles'), request('/schools'), request('/users/stats')])
      .then(([r, s, st]) => {
        setRoleData(r)
        setSchools(s.schools)
        setStats(st)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const onSaved = (user, isNew) => {
    setForm(null)
    setRefreshKey((k) => k + 1)
    loadStats()
    setToast({ kind: 'success', text: isNew ? `${user.name} was added.` : `${user.name} was updated.` })
  }

  // Stable identity: UsersTab's fetch effect depends on it
  const notify = useCallback((kind, text) => setToast({ kind, text }), [])

  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/users" replace />
  if (error) return <div className="u-banner">Couldn't load users ({error}). Is the backend running on port 5000?</div>

  const byRole = stats?.byRole ?? {}

  // KPI cards as quick filters. Role cards include inactive users so the list total matches the card.
  const current = readFilters(searchParams)
  const onUsersTab = tab === 'users'
  const isPreset = (role, status) => onUsersTab && current.role === role && current.status === status && !current.school
  const applyPreset = (role, status) => {
    // Clicking the active card again goes back to the default view (active users)
    const target = isPreset(role, status) ? {} : { role, status }
    navigate(`/users${filterQuery(target)}`)
  }
  const kpis = [
    { key: 'total', icon: UsersRound, value: stats?.total, label: 'Total Users', tone: 'primary', role: '', status: '', hint: 'Show all users' },
    { key: 'roles', icon: UserCog, value: stats?.roles, label: 'User Roles', tone: 'good', hint: 'Open the Roles tab' },
    { key: 'principals', icon: School, value: byRole.principal, label: 'Principals', tone: 'violet', role: 'principal', status: '', hint: 'Show principals' },
    {
      key: 'facilities', icon: Wrench, value: stats && (byRole['facilities-manager'] ?? 0) + (byRole.inspector ?? 0),
      label: 'Facilities Staff', tone: 'warning', role: FACILITIES_STAFF, status: '', hint: 'Show facilities managers and inspectors',
    },
    { key: 'contractors', icon: HardHat, value: byRole.contractor, label: 'Contractors', tone: 'critical', role: 'contractor', status: '', hint: 'Show contractors' },
    { key: 'inactive', icon: UserX, value: stats?.inactive, label: 'Inactive Users', tone: 'teal', role: '', status: 'inactive', hint: 'Show inactive users' },
  ]

  return (
    <div className="users-page">
      <div className="u-head">
        <div>
          <h1>User &amp; Role Management</h1>
          <p>Manage users, roles, permissions and school access</p>
        </div>
        <div className="u-head-actions">
          <button type="button" className="u-btn u-btn-primary" onClick={() => setForm({})}>
            <Plus size={16} />Add User
          </button>
          <button type="button" className="u-btn u-btn-outline" disabled title="Bulk import isn't available yet">
            <FileUp size={15} />Bulk Import
          </button>
          <div className="u-menu-wrap" ref={menuRef}>
            <button type="button" className="u-btn u-btn-icon" aria-label="More actions" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              <EllipsisVertical size={16} />
            </button>
            {menuOpen && (
              <div className="u-menu" role="menu">
                <a role="menuitem" href={`${API_BASE}/users/export.csv`} download onClick={() => setMenuOpen(false)}>
                  <Download size={14} />Export all users (CSV)
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="kpi-row">
        {kpis.map((k) => (
          <Kpi key={k.key} icon={k.icon} value={k.value} label={k.label} tone={k.tone} hint={k.hint}
            active={k.key === 'roles' ? tab === 'roles' : isPreset(k.role, k.status)}
            onClick={() => (k.key === 'roles' ? setTab('roles') : applyPreset(k.role, k.status))} />
        ))}
      </div>

      <nav className="u-tabs" role="tablist" aria-label="User management sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`u-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'users' && (
        <UsersTab
          roles={roleData.roles}
          permissions={roleData.permissions}
          schools={schools}
          refreshKey={refreshKey}
          onEdit={(user) => setForm({ user })}
          onChanged={() => { setRefreshKey((k) => k + 1); loadStats() }}
          notify={notify}
        />
      )}
      {tab === 'roles' && (
        <RolesTab roles={roleData.roles} permissions={roleData.permissions} systemRole={roleData.systemRole}
          onChanged={onRolesChanged} notify={notify} />
      )}
      {tab === 'permissions' && (
        <PermissionsTab roles={roleData.roles} permissions={roleData.permissions} systemRole={roleData.systemRole}
          onChanged={onRolesChanged} notify={notify} />
      )}
      {(tab === 'access' || tab === 'activity') && (
        <div className="u-card u-placeholder">
          <Construction size={28} />
          <strong>{TABS.find((t) => t.id === tab).label}</strong>
          <span>This section hasn't been built yet. Each user's school access is shown in their details panel.</span>
        </div>
      )}

      {form && (
        <UserForm
          user={form.user}
          roles={roleData.roles}
          schools={schools}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}

      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
