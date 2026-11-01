import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  Bell, CalendarCheck, ShieldAlert, Layers, ShieldCheck, Inbox, CheckCheck, Settings2, Search, Ellipsis,
  ChevronLeft, ChevronRight, RotateCcw, Check, MailOpen, Eye, Trash2, X, CircleCheck, CircleAlert,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import NotificationDetails from './NotificationDetails'
import { NotificationIcon, TypeBadge } from './notifMeta'
import { request, fmtDateTime } from '../../lib/api'
import { setUnreadCount } from '../../lib/unreadNotifications'
import '../Users/users.css'
import './notifications.css'

const TABS = [
  { slug: '', label: 'All Notifications', countKey: 'all' },
  { slug: 'unread', label: 'Unread', countKey: 'unread' },
  { slug: 'priority', label: 'Priority', countKey: 'priority' },
]
const TYPE_OPTIONS = [
  { value: 'inspection', label: 'Inspections' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'acm', label: 'ACM Updates' },
  { value: 'system', label: 'System Alerts' },
  { value: 'other', label: 'Other' },
]
const RANGES = [
  { value: '', label: 'Any time', days: null },
  { value: '1', label: 'Today', days: 1 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
]
const DEFAULTS = { type: '', school: '', priority: '', range: '' }
const DAY = 86400000
const isoDate = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10)

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

// KPI card that filters by type (click again to clear)
function Kpi({ icon: Icon, value, label, tone, active, onClick }) {
  return (
    <button type="button" className={`kpi-card kpi-clickable tone-${tone}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
      </span>
    </button>
  )
}

function RowMenu({ n, onOpen, onToggleRead, onDelete }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  const run = (fn) => () => { setOpen(false); fn() }
  return (
    <div className="u-menu-wrap">
      <button type="button" className="n-more" aria-label={`Actions for ${n.title}`} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        <Ellipsis size={18} />
      </button>
      {open && (
        <div className="u-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={run(onOpen)}><Eye size={14} />Open</button>
          <button type="button" role="menuitem" onClick={run(onToggleRead)}>
            {n.read ? <><MailOpen size={14} />Mark as unread</> : <><Check size={14} />Mark as read</>}
          </button>
          <button type="button" role="menuitem" className="danger" onClick={run(onDelete)}><Trash2 size={14} />Delete</button>
        </div>
      )}
    </div>
  )
}

export default function Notifications() {
  const { tab: tabSlug = '' } = useParams()
  const navigate = useNavigate()
  const tab = TABS.find((t) => t.slug === tabSlug)

  const [filters, setFilters] = useState(DEFAULTS)
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [schools, setSchools] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  // Details start open beside the list on desktop; on small screens they're a drawer opened by a click
  const [detailsOpen, setDetailsOpen] = useState(() => !window.matchMedia('(max-width: 960px)').matches)
  const [checked, setChecked] = useState(() => new Set())
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)
  const [now] = useState(() => Date.now())

  const [pageFor, setPageFor] = useState(tabSlug)
  if (pageFor !== tabSlug) { // switching tabs: back to page 1, clear selection
    setPageFor(tabSlug)
    setPage(1)
    setChecked(new Set())
  }

  useEffect(() => {
    request('/schools').then((d) => setSchools(d.schools)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const range = RANGES.find((r) => r.value === filters.range)
  const params = new URLSearchParams({
    tab: tabSlug, q: debouncedQ, type: filters.type, school: filters.school, priority: filters.priority, page, pageSize,
  })
  if (range?.days) {
    params.set('from', isoDate(now - (range.days - 1) * DAY))
    params.set('to', isoDate(now))
  }
  const qs = params.toString()

  useEffect(() => {
    let cancelled = false
    request(`/notifications?${qs}`).then((d) => {
      if (cancelled) return
      setData(d)
      setError(null)
      setUnreadCount(d.counts.unread)
      setSelectedId((id) => (d.notifications.some((n) => n.id === id) ? id : d.notifications[0]?.id ?? null))
    }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [qs, refreshKey])

  const notify = useCallback((kind, text) => setToast({ kind, text }), [])
  const afterChange = (result) => {
    if (result?.counts) setUnreadCount(result.counts.unread)
    setRefreshKey((k) => k + 1)
  }

  const setRead = async (ids, read) => {
    try {
      afterChange(await request('/notifications/read', { method: 'POST', body: { ids, read } }))
    } catch (err) { notify('error', err.message) }
  }
  const markAllRead = async () => {
    try {
      const r = await request('/notifications/read', { method: 'POST', body: { all: true, read: true } })
      afterChange(r)
      notify('success', r.changed ? `Marked ${r.changed} notification${r.changed > 1 ? 's' : ''} as read.` : 'Everything is already read.')
    } catch (err) { notify('error', err.message) }
  }
  const remove = async (ids) => {
    try {
      const r = await request('/notifications/delete', { method: 'POST', body: { ids } })
      afterChange(r)
      setChecked(new Set())
      notify('success', `Deleted ${r.removed} notification${r.removed === 1 ? '' : 's'}.`)
    } catch (err) { notify('error', err.message) }
  }

  if (!tab) return <Navigate to="/notifications" replace />

  const setFilter = (key) => (value) => { setFilters((f) => ({ ...f, [key]: value })); setPage(1) }
  const filtersActive = query || JSON.stringify(filters) !== JSON.stringify(DEFAULTS)
  const list = data?.notifications ?? []
  const selected = list.find((n) => n.id === selectedId) ?? null
  const unreadByType = data?.unreadByType ?? {}
  const allChecked = list.length > 0 && list.every((n) => checked.has(n.id))
  const toggleAll = () => setChecked((prev) => {
    const next = new Set(prev)
    list.forEach((n) => (allChecked ? next.delete(n.id) : next.add(n.id)))
    return next
  })
  const toggleOne = (id) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const typeKpi = (type) => ({
    active: filters.type === type,
    onClick: () => setFilter('type')(filters.type === type ? '' : type),
  })
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <div className={`notif-page${detailsOpen && selected ? ' details-open' : ''}`}>
      <div className="n-main">
        <div className="n-head">
          <div>
            <h1><Bell size={22} />Notifications</h1>
            <p>Stay updated on inspections, compliance, ACM activities, and system alerts.</p>
          </div>
        </div>

        <div className="n-kpis">
          <Kpi icon={Inbox} value={data?.counts.unread} label="Total Unread" tone="critical"
            active={tabSlug === 'unread' && !filters.type} onClick={() => { setFilter('type')(''); navigate(tabSlug === 'unread' ? '/notifications' : '/notifications/unread') }} />
          <Kpi icon={CalendarCheck} value={unreadByType.inspection} label="Inspections" tone="primary" {...typeKpi('inspection')} />
          <Kpi icon={ShieldAlert} value={unreadByType.compliance} label="Compliance" tone="warning" {...typeKpi('compliance')} />
          <Kpi icon={Layers} value={unreadByType.acm} label="ACM Updates" tone="violet" {...typeKpi('acm')} />
          <Kpi icon={ShieldCheck} value={unreadByType.system} label="System Alerts" tone="good" {...typeKpi('system')} />
          <Kpi icon={Bell} value={unreadByType.other} label="Other" tone="teal" {...typeKpi('other')} />
        </div>

        <div className="n-tabbar">
          <nav className="u-tabs" role="tablist" aria-label="Notification views">
            {TABS.map((t) => (
              <button key={t.slug} type="button" role="tab" aria-selected={t.slug === tabSlug}
                className={`u-tab${t.slug === tabSlug ? ' active' : ''}`}
                onClick={() => navigate(t.slug ? `/notifications/${t.slug}` : '/notifications')}>
                {t.label}{data && ` (${data.counts[t.countKey]})`}
              </button>
            ))}
          </nav>
          <div className="n-tab-actions">
            <button type="button" className="n-link" onClick={markAllRead} disabled={!data?.counts.unread}>
              <CheckCheck size={15} />Mark All as Read
            </button>
            <Link className="n-link" to="/settings/notifications"><Settings2 size={15} />Notification Preferences</Link>
          </div>
        </div>

        <section className="u-card">
          <div className="n-filters">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Search notifications…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notifications" />
            </label>
            <SearchSelect variant="field" label="Type" value={filters.type} onChange={setFilter('type')} searchable={false}
              options={[{ value: '', label: 'All Types' }, ...TYPE_OPTIONS]} />
            <SearchSelect variant="field" label="School" value={filters.school} onChange={setFilter('school')} searchPlaceholder="Search schools…"
              options={[{ value: '', label: 'All Schools' }, { value: 'all-schools', label: 'District-wide alerts' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
            <SearchSelect variant="field" label="Priority" value={filters.priority} onChange={setFilter('priority')} searchable={false}
              options={[{ value: '', label: 'All Priority' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
            <SearchSelect variant="field" label="Date range" value={filters.range} onChange={setFilter('range')} searchable={false}
              options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            <button type="button" className="u-btn u-btn-outline n-reset" disabled={!filtersActive}
              onClick={() => { setFilters(DEFAULTS); setQuery(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>

          {checked.size > 0 && (
            <div className="n-bulk">
              <span>{checked.size} selected</span>
              <button type="button" className="u-btn u-btn-sm u-btn-outline" onClick={() => setRead([...checked], true)}><Check size={13} />Mark read</button>
              <button type="button" className="u-btn u-btn-sm u-btn-outline" onClick={() => setRead([...checked], false)}><MailOpen size={13} />Mark unread</button>
              <button type="button" className="u-btn u-btn-sm u-btn-ghost" onClick={() => remove([...checked])}><Trash2 size={13} />Delete</button>
              <button type="button" className="u-btn u-btn-sm u-btn-outline" onClick={() => setChecked(new Set())} aria-label="Clear selection"><X size={13} /></button>
            </div>
          )}

          {error && <div className="u-banner">Couldn't load notifications ({error}).</div>}

          <div className="u-table-wrap">
            <table className="u-table n-table">
              <thead>
                <tr>
                  <th className="n-col-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all on this page" /></th>
                  <th>Notification</th><th>Type</th><th className="n-col-school">School / Facility</th><th>Date &amp; Time</th><th className="u-col-actions"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.id} className={`${n.id === selectedId ? 'selected' : ''}${n.read ? '' : ' unread'}`}
                    onClick={() => { setSelectedId(n.id); setDetailsOpen(true) }}>
                    <td className="n-col-check" onClick={(e) => e.stopPropagation()}>
                      {n.read || checked.has(n.id)
                        ? <input type="checkbox" checked={checked.has(n.id)} onChange={() => toggleOne(n.id)} aria-label={`Select ${n.title}`} />
                        : (
                          <button type="button" className="n-dot-btn" onClick={() => toggleOne(n.id)} aria-label={`Unread – select ${n.title}`} title="Unread">
                            <span className="n-dot" />
                          </button>
                        )}
                    </td>
                    <td>
                      <span className="n-cell">
                        <NotificationIcon n={n} />
                        <span>
                          <strong>{n.title}</strong>
                          <small>{n.message}</small>
                        </span>
                      </span>
                    </td>
                    <td><TypeBadge type={n.type} /></td>
                    <td className="n-col-school">{n.schoolName ?? 'All Schools'}</td>
                    <td className="n-date">{fmtDateTime(n.createdAt)}</td>
                    <td className="u-col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowMenu n={n} onOpen={() => { setSelectedId(n.id); setDetailsOpen(true) }}
                        onToggleRead={() => setRead([n.id], !n.read)} onDelete={() => remove([n.id])} />
                    </td>
                  </tr>
                ))}
                {data && !list.length && (
                  <tr><td colSpan={6} className="u-empty">{tabSlug === 'unread' && !filtersActive ? "You're all caught up." : 'No notifications match these filters.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <footer className="u-pager">
              <span className="u-muted">Showing {from} to {to} of {data.total} notifications</span>
              <nav className="u-pages" aria-label="Pagination">
                <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
                {pageList(data.page, data.pages).map((p, i) => (p === '…'
                  ? <span key={`gap${i}`} className="u-gap">…</span>
                  : <button key={p} type="button" className={p === data.page ? 'active' : ''} aria-current={p === data.page ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>))}
                <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
              </nav>
              <div className="u-page-size">
                <SearchSelect variant="field" label="Rows per page" value={pageSize} searchable={false}
                  onChange={(v) => { setPageSize(v); setPage(1) }}
                  options={[10, 25, 50].map((x) => ({ value: x, label: `${x} / page` }))} />
              </div>
            </footer>
          )}
        </section>
      </div>

      <div className="u-drawer-backdrop" onClick={() => setDetailsOpen(false)} />
      <NotificationDetails n={selected} now={now} onClose={() => setDetailsOpen(false)} onToggleRead={(n) => setRead([n.id], !n.read)} />

      {toast && (
        <div className={`u-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
