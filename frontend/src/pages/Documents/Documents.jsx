import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  FileText, Cloud, CloudUpload, Lock, Plus, FolderPlus, Search, ChevronLeft, ChevronRight, RotateCcw,
  Ellipsis, Eye, Download, Trash2, CircleCheck, CircleAlert, CloudOff, RefreshCw, X,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import UploadDialog from './UploadDialog'
import DocumentPreview from './DocumentPreview'
import { FileBadge, SourceLabel } from './docUtils'
import { CATEGORY_TABS } from './docMeta'
import { request, fmtDateTime, API_BASE } from '../../lib/api'
import '../Users/users.css'
import './documents.css'

const DEFAULT_FILTERS = { school: '', building: '', type: '', year: '', source: '' }

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

function Kpi({ icon: Icon, value, label, tone }) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span className="kpi-icon"><Icon size={18} strokeWidth={1.8} /></span>
      <span className="kpi-text">
        <strong>{value?.toLocaleString('en-US') ?? '—'}</strong>
        <span className="kpi-label">{label}</span>
      </span>
    </div>
  )
}

function RowMenu({ doc, onPreview, onDelete }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  return (
    <div className="u-menu-wrap">
      <button type="button" className="u-row-btn" aria-label={`Actions for ${doc.name}`} aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        <Ellipsis size={16} />
      </button>
      {open && (
        <div className="u-menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPreview() }}><Eye size={14} />Preview</button>
          {doc.source === 'upload' && !doc.sample
            ? <a role="menuitem" href={`${API_BASE}/documents/${doc.id}/file?download=1`} onClick={() => setOpen(false)}><Download size={14} />Download</a>
            : <button type="button" role="menuitem" disabled title="No file stored for this sample record"><Download size={14} />Download</button>}
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); onDelete() }}><Trash2 size={14} />Delete</button>
        </div>
      )}
    </div>
  )
}

export default function Documents() {
  const { category = '' } = useParams()
  const navigate = useNavigate()
  const tab = CATEGORY_TABS.find((t) => t.slug === category)

  const [facets, setFacets] = useState(null)
  const [schools, setSchools] = useState([])
  const [buildings, setBuildings] = useState([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [checked, setChecked] = useState(() => new Set())
  const [uploadOpen, setUploadOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState(null)

  // Tab change: back to page 1 (render-time reset, no effect needed)
  const [pageFor, setPageFor] = useState(category)
  if (pageFor !== category) {
    setPageFor(category)
    setPage(1)
    setChecked(new Set())
  }

  useEffect(() => {
    Promise.all([request('/documents/facets'), request('/schools'), request('/buildings')])
      .then(([f, s, b]) => { setFacets(f); setSchools(s.schools); setBuildings(b.buildings) })
      .catch((err) => setError(err.message))
  }, [])

  // SharePoint status comes from Settings › Integrations (via /documents/facets)
  const [spSyncing, setSpSyncing] = useState(false)
  const sp = facets?.sharepoint
  const syncSharePoint = async () => {
    setSpSyncing(true)
    try {
      const r = await request('/integrations/sharepoint/sync', { method: 'POST' })
      setFacets((f) => ({ ...f, sharepoint: { ...f.sharepoint, lastSync: r.lastSync } }))
      setToast({ kind: 'success', text: `SharePoint: ${r.lastSync.message} (simulated).` })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    } finally {
      setSpSyncing(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(query); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const qs = new URLSearchParams({ ...filters, category, q: debouncedQ, page, pageSize }).toString()

  useEffect(() => {
    let cancelled = false
    request(`/documents?${qs}`).then((d) => {
      if (cancelled) return
      setData(d)
      setError(null)
      setSelectedId((id) => (d.documents.some((x) => x.id === id) ? id : d.documents[0]?.id ?? null))
    }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [qs, refreshKey])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    request(`/documents/${selectedId}`).then((d) => { if (!cancelled) setDetail(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [selectedId, refreshKey])
  const selected = detail?.id === selectedId ? detail : null

  const setFilter = (key) => (value) => {
    setFilters((f) => ({ ...f, [key]: value, ...(key === 'school' ? { building: '' } : {}) }))
    setPage(1)
  }
  const schoolBuildings = useMemo(() => buildings.filter((b) => b.schoolId === filters.school), [buildings, filters.school])
  const filtersActive = query || JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)
  const notify = useCallback((kind, text) => setToast({ kind, text }), [])

  const openPreview = (id) => { setSelectedId(id); setPreviewOpen(true) }

  const deleteDocs = async (docs) => {
    try {
      for (const d of docs) await request(`/documents/${d.id}`, { method: 'DELETE' })
      notify('success', docs.length === 1 ? `Deleted ${docs[0].name}.` : `Deleted ${docs.length} documents.`)
      setChecked(new Set())
      setRefreshKey((k) => k + 1)
    } catch (err) {
      notify('error', err.message)
      setRefreshKey((k) => k + 1)
    }
  }

  const [bulkConfirm, setBulkConfirm] = useState(false)
  useEffect(() => {
    if (!bulkConfirm) return
    const t = setTimeout(() => setBulkConfirm(false), 4000)
    return () => clearTimeout(t)
  }, [bulkConfirm])

  if (!tab) return <Navigate to="/documents" replace />

  const pageDocs = data?.documents ?? []
  const allChecked = pageDocs.length > 0 && pageDocs.every((d) => checked.has(d.id))
  const toggleAll = () => setChecked((prev) => {
    const next = new Set(prev)
    pageDocs.forEach((d) => (allChecked ? next.delete(d.id) : next.add(d.id)))
    return next
  })
  const toggleOne = (id) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0
  const defaultUploadType = { 'management-plans': 'Management Plan', 'inspection-reports': 'Inspection Report', 'lab-reports': 'Lab Report', 'floor-plans': 'Floor Plan', 'training-records': 'Training Record', notifications: 'Notification' }[category]

  return (
    <div className="docs-page">
      <div className="u-head">
        <div>
          <h1>Document Management</h1>
          <p>Store, manage and share asbestos compliance documents</p>
        </div>
        <div className="u-head-actions">
          <button type="button" className="u-btn u-btn-primary" onClick={() => setUploadOpen(true)} disabled={!facets}>
            <Plus size={16} />Upload Document
          </button>
          <button type="button" className="u-btn u-btn-outline" disabled title="Folders aren't available yet">
            <FolderPlus size={15} />New Folder
          </button>
          <Link className="u-btn u-btn-outline" to="/integrations" title="SharePoint integration settings">
            <Cloud size={15} />SharePoint
          </Link>
        </div>
      </div>

      <nav className="u-tabs" role="tablist" aria-label="Document categories">
        {CATEGORY_TABS.map((t) => (
          <button key={t.slug} type="button" role="tab" aria-selected={t.slug === category}
            className={`u-tab${t.slug === category ? ' active' : ''}`}
            onClick={() => navigate(t.slug ? `/documents/${t.slug}` : '/documents')}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="d-top">
        <div className="d-kpis">
          <Kpi icon={FileText} value={data?.stats.total} label="Total Documents" tone="primary" />
          <Kpi icon={Cloud} value={data?.stats.sharepoint} label="Stored in SharePoint" tone="teal" />
          <Kpi icon={CloudUpload} value={data?.stats.thisMonth} label="Uploaded This Month" tone="violet" />
          <Kpi icon={Lock} value={data?.stats.restricted} label="Restricted Documents" tone="warning" />
        </div>
        {sp?.connected ? (
          <div className="u-card d-sp">
            <span className="d-sp-status on"><Cloud size={16} />SharePoint connected</span>
            <small title={sp.siteUrl ?? undefined}>
              {sp.lastSync ? `Last sync ${fmtDateTime(sp.lastSync.at)}${sp.lastSync.status === 'failed' ? ' (failed)' : ''}` : 'Not synced yet'}
            </small>
            <button type="button" className="u-btn u-btn-outline u-btn-sm" disabled={spSyncing} onClick={syncSharePoint} title="Simulated in this demo environment">
              <RefreshCw size={13} />{spSyncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        ) : (
          <div className="u-card d-sp">
            <span className="d-sp-status"><CloudOff size={16} />SharePoint {sp?.status === 'error' ? 'connection error' : 'not connected'}</span>
            <small>Connect it under Settings › Integrations</small>
            <Link className="u-btn u-btn-outline u-btn-sm" to="/integrations">Connect</Link>
          </div>
        )}
      </div>

      <div className={`d-layout${previewOpen ? ' details-open' : ''}`}>
        <section className="u-card d-list">
          <div className="d-filters">
            <label className="u-search">
              <Search size={15} />
              <input type="search" placeholder="Search documents…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
            </label>
            <div className="a-field"><span>School</span>
              <SearchSelect variant="field" label="School" value={filters.school} onChange={setFilter('school')} searchPlaceholder="Search schools…"
                options={[{ value: '', label: 'All Schools' }, { value: 'district', label: 'District-wide' }, ...schools.map((s) => ({ value: s.id, label: s.name }))]} />
            </div>
            <div className="a-field"><span>Building</span>
              <SearchSelect variant="field" label="Building" value={filters.building} onChange={setFilter('building')} searchable={false}
                options={[{ value: '', label: 'All Buildings' }, ...schoolBuildings.map((b) => ({ value: b.id, label: b.name }))]} />
            </div>
            <div className="a-field"><span>Document Type</span>
              <SearchSelect variant="field" label="Document type" value={filters.type} onChange={setFilter('type')}
                options={[{ value: '', label: 'All Types' }, ...(facets?.types ?? []).map((t) => ({ value: t, label: t }))]} />
            </div>
            <div className="a-field"><span>Year</span>
              <SearchSelect variant="field" label="Year" value={filters.year} onChange={setFilter('year')} searchable={false}
                options={[{ value: '', label: 'All Years' }, ...(facets?.years ?? []).map((y) => ({ value: y, label: y }))]} />
            </div>
            <div className="a-field"><span>Source</span>
              <SearchSelect variant="field" label="Source" value={filters.source} onChange={setFilter('source')} searchable={false}
                options={[{ value: '', label: 'All Sources' }, { value: 'sharepoint', label: 'SharePoint' }, { value: 'upload', label: 'Uploaded' }]} />
            </div>
            <button type="button" className="u-btn u-btn-outline d-reset" disabled={!filtersActive}
              onClick={() => { setFilters(DEFAULT_FILTERS); setQuery(''); setPage(1) }}>
              <RotateCcw size={14} />Reset
            </button>
          </div>

          {checked.size > 0 && (
            <div className="d-bulk">
              <span>{checked.size} selected</span>
              <button type="button" className="u-btn u-btn-sm u-btn-outline" onClick={() => setChecked(new Set())}><X size={13} />Clear</button>
              <button type="button" className={`u-btn u-btn-sm ${bulkConfirm ? 'u-btn-danger' : 'u-btn-ghost'}`}
                onClick={() => {
                  if (!bulkConfirm) { setBulkConfirm(true); return }
                  setBulkConfirm(false)
                  deleteDocs([...checked].map((id) => ({ id, name: pageDocs.find((d) => d.id === id)?.name ?? id })))
                }}>
                <Trash2 size={13} />{bulkConfirm ? `Confirm delete ${checked.size}` : 'Delete selected'}
              </button>
            </div>
          )}

          {error && <div className="u-banner">Couldn't load documents ({error}).</div>}

          <div className="u-table-wrap">
            <table className="u-table d-table">
              <thead>
                <tr>
                  <th className="d-col-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all on this page" /></th>
                  <th>Name</th><th>Type</th><th>School / Building</th><th className="d-col-related">Related To</th>
                  <th>Uploaded On</th><th className="d-col-source">Source</th><th>Access</th><th className="u-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageDocs.map((d) => (
                  <tr key={d.id} className={d.id === selectedId ? 'selected' : ''} onClick={() => openPreview(d.id)}>
                    <td className="d-col-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(d.id)} onChange={() => toggleOne(d.id)} aria-label={`Select ${d.name}`} />
                    </td>
                    <td>
                      <span className="d-name">
                        <FileBadge ext={d.ext} />
                        <button type="button" className="u-name" onClick={(e) => { e.stopPropagation(); openPreview(d.id) }}>{d.name}</button>
                      </span>
                    </td>
                    <td>{d.type}</td>
                    <td className="d-place">{d.schoolName ?? 'District-wide'}{d.buildingName && <small>{d.buildingName}</small>}</td>
                    <td className="d-col-related">{d.relatedTo}</td>
                    <td className="u-nowrap">{fmtDateTime(d.uploadedAt)}</td>
                    <td className="d-col-source"><SourceLabel source={d.source} /></td>
                    <td><span className={`d-access ${d.access.toLowerCase()}`}>{d.access}</span></td>
                    <td className="u-col-actions" onClick={(e) => e.stopPropagation()}>
                      <RowMenu doc={d} onPreview={() => openPreview(d.id)} onDelete={() => deleteDocs([d])} />
                    </td>
                  </tr>
                ))}
                {data && !pageDocs.length && (
                  <tr><td colSpan={9} className="u-empty">No documents match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && (
            <footer className="u-pager">
              <span className="u-muted">Showing {from} to {to} of {data.total.toLocaleString('en-US')} documents</span>
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
                  options={[10, 25, 50].map((n) => ({ value: n, label: `${n} / page` }))} />
              </div>
            </footer>
          )}
        </section>

        <div className="u-drawer-backdrop" onClick={() => setPreviewOpen(false)} />
        <DocumentPreview doc={selected} onClose={() => setPreviewOpen(false)} onDelete={(d) => deleteDocs([d])} />
      </div>

      {uploadOpen && facets && (
        <UploadDialog
          facets={facets}
          schools={schools}
          buildings={buildings}
          defaultType={defaultUploadType}
          onClose={() => setUploadOpen(false)}
          onUploaded={(doc) => {
            setUploadOpen(false)
            notify('success', `Uploaded ${doc.name}.`)
            setSelectedId(doc.id)
            setPreviewOpen(true)
            setRefreshKey((k) => k + 1)
          }}
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
