import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Search, Download, Ellipsis, ChevronLeft, ChevronRight, Pencil, UserCheck, UserX, Eye, X } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import UserDetails from './UserDetails'
import { request, initials, fmtDate, fmtDateTime, accessSummary } from './api'
import { FACILITIES_STAFF, readFilters, filterQuery } from './filters'
import { API_BASE } from '../../lib/api'

const PAGE_SIZES = [10, 25, 50]

// Page numbers with ellipses, e.g. 1 2 3 4 5 … 13
function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

function RowMenu({ user, onView, onEdit, onToggleStatus }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  const run = (fn) => (e) => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <div className="u-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-label={`Actions for ${user.name}`} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        <Ellipsis size={16} />
      </button>
      {open && (
        <div className="u-menu" role="menu">
          <button type="button" role="menuitem" onClick={run(onView)}><Eye size={14} />View details</button>
          <button type="button" role="menuitem" onClick={run(onEdit)}><Pencil size={14} />Edit user</button>
          <button type="button" role="menuitem" className={user.status === 'active' ? 'danger' : ''} onClick={run(onToggleStatus)}>
            {user.status === 'active' ? <><UserX size={14} />Deactivate</> : <><UserCheck size={14} />Activate</>}
          </button>
        </div>
      )}
    </div>
  )
}

export default function UsersTab({ roles, permissions, schools, refreshKey, onEdit, onChanged, notify }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // Role / school / status come from the URL so KPI cards, links and Back all drive the same filters
  const [searchParams, setSearchParams] = useSearchParams()
  const { role, school, status } = readFilters(searchParams)
  const filterKey = `${role}|${school}|${status}`
  const [page, setPage] = useState(1)
  const [pageFor, setPageFor] = useState(filterKey)
  if (pageFor !== filterKey) { // filters changed (dropdown or KPI card): back to page 1
    setPageFor(filterKey)
    setPage(1)
  }
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [selected, setSelected] = useState(null)
  // Only matters on small screens, where details are a drawer opened by clicking a user
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openDetails = (id) => { setSelectedId(id); setDetailsOpen(true) }

  const roleById = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles])
  const schoolName = useMemo(() => {
    const m = Object.fromEntries(schools.map((s) => [s.id, s.name]))
    return (id) => m[id] ?? id
  }, [schools])

  const setFilter = (key) => (value) => setSearchParams(filterQuery({ role, school, status, [key]: value }))
  const clearFilters = () => { setSearchParams(''); setQuery('') }
  const filtersActive = role || school || status !== 'active' || query

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query)
      setPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const params = new URLSearchParams({ q: debounced, role, school, status, page, pageSize })
  const qs = params.toString()

  useEffect(() => {
    let cancelled = false
    request(`/users?${qs}`).then((d) => {
      if (cancelled) return
      setData(d)
      // Keep the current selection if it's still listed; otherwise select the first row
      setSelectedId((id) => (d.users.some((u) => u.id === id) ? id : d.users[0]?.id ?? null))
    }).catch((err) => notify('error', err.message))
    return () => { cancelled = true }
  }, [qs, refreshKey, notify])

  // Details always come fresh from the API so edits show immediately
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    request(`/users/${selectedId}`).then((u) => { if (!cancelled) setSelected(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedId, refreshKey])
  const selectedUser = selected?.id === selectedId ? selected : null

  const toggleStatus = async (user) => {
    const next = user.status === 'active' ? 'inactive' : 'active'
    try {
      await request(`/users/${user.id}/status`, { method: 'PATCH', body: { status: next } })
      notify('success', `${user.name} is now ${next}.`)
      onChanged()
    } catch (err) {
      notify('error', err.message)
    }
  }

  const exportParams = new URLSearchParams({ q: debounced, role, school, status })
  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <div className={`u-layout${detailsOpen ? ' details-open' : ''}`}>
      <section className="u-card u-list">
        <header className="u-card-head">
          <h2>Users {data && <span>({data.total})</span>}</h2>
          <a className="u-btn u-btn-outline u-btn-sm" href={`${API_BASE}/users/export.csv?${exportParams}`} download>
            <Download size={14} />Export
          </a>
        </header>

        <div className="u-filters">
          <label className="u-search">
            <Search size={15} />
            <input type="search" placeholder="Search by name, email, role…" value={query}
              onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />
          </label>
          <SearchSelect variant="field" label="Role" value={role} onChange={setFilter('role')} searchable={false}
            options={[
              { value: '', label: 'All Roles' },
              { value: FACILITIES_STAFF, label: 'Facilities Staff (all)' },
              ...roles.map((r) => ({ value: r.id, label: r.name })),
            ]} />
          <SearchSelect variant="field" label="School" value={school} onChange={setFilter('school')} searchPlaceholder="Search schools…"
            options={[{ value: '', label: 'All Schools' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
          <SearchSelect variant="field" label="Status" value={status} onChange={setFilter('status')} searchable={false}
            options={[
              { value: '', label: 'Status: All' },
              { value: 'active', label: 'Status: Active' },
              { value: 'inactive', label: 'Status: Inactive' },
            ]} />
          <button type="button" className="u-btn u-btn-outline u-clear" disabled={!filtersActive} onClick={clearFilters}
            title="Clear filters">
            <X size={14} />Clear
          </button>
        </div>

        <div className="u-table-wrap">
          <table className="u-table">
            <thead>
              <tr>
                <th>Name</th><th className="u-col-email">Email</th><th>Role</th><th>School / Access</th><th>Status</th><th className="u-col-login">Last Login</th>
                <th className="u-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => {
                const r = roleById[u.roleId]
                const access = accessSummary(u.access, schoolName)
                return (
                  <tr key={u.id} className={u.id === selectedId ? 'selected' : ''} onClick={() => openDetails(u.id)}>
                    <td>
                      <span className="u-person">
                        <span className="u-avatar">{initials(u.name)}</span>
                        <span className="u-person-text">
                          <button type="button" className="u-name" onClick={(e) => { e.stopPropagation(); openDetails(u.id) }}>{u.name}</button>
                          {/* Shown under the name when the Email column is hidden on narrower screens */}
                          <span className="u-person-email">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="u-muted u-col-email">{u.email}</td>
                    <td><span className={`u-role tone-${r?.tone ?? 'primary'}`}>{r?.name ?? u.roleId}</span></td>
                    <td><span className="u-clip" title={access}>{access}</span></td>
                    <td><span className={`u-status ${u.status}`}>{u.status === 'active' ? 'Active' : 'Inactive'}</span></td>
                    <td className="u-nowrap u-muted u-col-login" title={fmtDateTime(u.lastLogin)}>
                      <span className="u-login-full">{fmtDateTime(u.lastLogin)}</span>
                      <span className="u-login-short">{fmtDate(u.lastLogin)}</span>
                    </td>
                    <td className="u-col-actions">
                      <RowMenu user={u} onView={() => openDetails(u.id)} onEdit={() => onEdit(u)} onToggleStatus={() => toggleStatus(u)} />
                    </td>
                  </tr>
                )
              })}
              {data && !data.users.length && (
                <tr><td colSpan={7} className="u-empty">No users match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && (
          <footer className="u-pager">
            <span className="u-muted">Showing {from} to {to} of {data.total} users</span>
            <nav className="u-pages" aria-label="Pagination">
              <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              {pageList(data.page, data.pages).map((p, i) => (p === '…'
                ? <span key={`gap${i}`} className="u-gap">…</span>
                : <button key={p} type="button" className={p === data.page ? 'active' : ''} aria-current={p === data.page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
              <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
            <div className="u-page-size">
              <SearchSelect variant="field" label="Rows per page" value={pageSize} onChange={(v) => { setPageSize(v); setPage(1) }} searchable={false}
                options={PAGE_SIZES.map((n) => ({ value: n, label: `${n} / page` }))} />
            </div>
          </footer>
        )}
      </section>

      {/* Backdrop only shows in drawer mode (small screens) */}
      <div className="u-drawer-backdrop" onClick={() => setDetailsOpen(false)} />
      <UserDetails
        user={selectedUser}
        role={selectedUser && roleById[selectedUser.roleId]}
        permissions={permissions}
        schoolName={schoolName}
        onEdit={() => onEdit(selectedUser)}
        onClose={() => setDetailsOpen(false)}
      />
    </div>
  )
}
