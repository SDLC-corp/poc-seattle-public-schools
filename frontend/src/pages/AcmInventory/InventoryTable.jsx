import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight, ArrowDown, ArrowUp, MoreHorizontal, MapPin, Pencil, Paperclip } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from './Badge'
import { CONDITION_TONE, STATUS_TONE, RISK_TONE, fmtDay, floorLink } from './acmInventoryMeta'

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 4) [2, 3, 4, 5].forEach((p) => set.add(p))
  if (page >= pages - 3) [pages - 4, pages - 3, pages - 2, pages - 1].forEach((p) => set.add(p))
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i && p - sorted[i - 1] > 1 ? ['…', p] : [p]))
}

const COLUMNS = [
  { key: 'id', label: 'ACM ID' },
  { key: 'room', label: 'Room / Location' },
  { key: 'material', label: 'Material' },
  { key: 'quantity', label: 'Quantity', num: true },
  { key: 'status', label: 'ACM Status' },
  { key: 'condition', label: 'Condition' },
  { key: 'risk', label: 'Risk', optional: true },
  { key: 'assessmentDate', label: 'Last Assessed', optional: true },
  { key: 'nextDue', label: 'Next Due' },
]


// Sample IDs embed the facility ("ACM-adamses-b2-f1-r2-1"), which the Room column already shows;
// keep the distinguishing part on screen ("B2-F1-R2-1") and the full ID in the tooltip, CSV and search
const shortId = (r) => {
  const prefix = `ACM-${r.schoolId}-`
  return r.id.startsWith(prefix) ? r.id.slice(prefix.length).toUpperCase() : r.id
}

function RowMenu({ record }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="ai-menu-wrap" ref={ref}>
      <button type="button" className="u-row-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${record.id}`}
        onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="ai-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => navigate(floorLink(record))}>
            <MapPin size={14} />Open room on floor plan
          </button>
          <button type="button" role="menuitem" onClick={() => navigate(floorLink(record), { state: { acm: { materialId: record.id } } })}>
            <Pencil size={14} />Edit ACM record
          </button>
        </div>
      )}
    </div>
  )
}

export default function InventoryTable({ title, data, error, sort, onSort, onPage, pageSize, onPageSize }) {
  const sortKey = sort.key || data?.sort
  const sortDir = sort.dir || data?.dir
  const from = data?.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0

  return (
    <section className="u-card ai-records">
      <h2 className="ai-records-title">{title}</h2>
      {error && <div className="u-banner">Couldn't load the inventory ({error}).</div>}
      <div className="u-table-wrap">
        <table className="u-table ai-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={[c.num && 'num', c.optional && 'ai-col-opt'].filter(Boolean).join(' ') || undefined}
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button type="button" className="a-sort" onClick={() => onSort(c.key)}>
                    {c.label}
                    {sortKey === c.key && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              <th className="ai-col-actions"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data?.records.map((r) => (
              <tr key={r.id}>
                <td className="ai-id" title={r.id}>{shortId(r)}</td>
                <td className="ai-room">
                  <strong>{r.roomNumber ? `${r.roomNumber} – ${r.roomName}` : r.roomName || '—'}</strong>
                  <small>{r.schoolName} · {r.buildingName} · {r.floorName}</small>
                </td>
                <td className="ai-material">
                  <strong>{r.name}</strong>
                  <small>{r.location}{r.attachments > 0 && <> · <Paperclip size={11} aria-label="attachments" />{r.attachments}</>}</small>
                </td>
                <td className="num u-nowrap">{r.quantity.toLocaleString('en-US')} <span className="u-muted">{r.unit}</span></td>
                <td><Badge tone={STATUS_TONE[r.acmStatus]}>{r.acmStatus}</Badge></td>
                <td><Badge tone={CONDITION_TONE[r.condition]}>{r.condition}</Badge></td>
                <td className="u-nowrap ai-col-opt"><i className={`ai-dot tone-${RISK_TONE[r.riskRanking] ?? 'neutral'}`} aria-hidden="true" />{r.riskRanking || '—'}</td>
                <td className="u-nowrap ai-col-opt">{fmtDay(r.assessmentDate)}</td>
                <td className="u-nowrap">{fmtDay(r.nextDue)}</td>
                <td className="ai-col-actions"><RowMenu record={r} /></td>
              </tr>
            ))}
            {data && !data.records.length && (
              <tr><td colSpan={COLUMNS.length + 1} className="u-empty">No ACM records match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {data && (
        <footer className="u-pager">
          <span className="u-muted">Showing {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {data.total.toLocaleString('en-US')} records</span>
          <nav className="u-pages" aria-label="Pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            {pageList(data.page, data.pages).map((p, i) => (p === '…'
              ? <span key={`gap${i}`} className="u-gap">…</span>
              : <button key={p} type="button" className={p === data.page ? 'active' : ''} aria-current={p === data.page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>))}
            <button type="button" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
          <div className="u-page-size">
            <SearchSelect variant="field" label="Rows per page" value={pageSize} searchable={false} onChange={onPageSize}
              options={[10, 25, 50, 100].map((n) => ({ value: n, label: `${n} / page` }))} />
          </div>
        </footer>
      )}
    </section>
  )
}
