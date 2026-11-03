import { ChevronLeft, ChevronRight } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { pageList } from './survMeta'

// Shared footer: "Showing a–b of n", page buttons and rows-per-page
export default function Pager({ data, noun, onPage, pageSize, onPageSize }) {
  const from = data.total ? (data.page - 1) * data.pageSize + 1 : 0
  const to = Math.min(data.total, data.page * data.pageSize)
  return (
    <footer className="u-pager">
      <span className="u-muted">Showing {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {data.total.toLocaleString('en-US')} {noun}</span>
      <nav className="u-pages" aria-label="Pagination">
        <button type="button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
        {pageList(data.page, data.pages).map((p, i) => (p === '…'
          ? <span key={`gap${i}`} className="u-gap">…</span>
          : <button key={p} type="button" className={p === data.page ? 'active' : ''} aria-current={p === data.page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>))}
        <button type="button" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
      </nav>
      {onPageSize && (
        <div className="u-page-size">
          <SearchSelect variant="field" label="Rows per page" value={pageSize} searchable={false} onChange={onPageSize}
            options={[10, 25, 50, 100].map((n) => ({ value: n, label: `${n} / page` }))} />
        </div>
      )}
    </footer>
  )
}
