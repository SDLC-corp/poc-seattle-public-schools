import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { ActionBadge } from '../Audit/ActionBadge'
import { request, fmtDateTime } from '../../lib/api'

// Changes to one module's records, straight from the audit log (ACM Inventory, Surveillance…)
export default function HistoryTab({ module = 'ACM Inventory', title = 'Inventory History' }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    request(`/audit?module=${encodeURIComponent(module)}&page=${page}&pageSize=15`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [module, page])

  return (
    <section className="u-card ai-records">
      <header className="ai-group-head">
        <h2 className="ai-records-title">{title}</h2>
        <Link to="/audit" className="ai-link">Open full audit log <ExternalLink size={13} /></Link>
      </header>
      {error && <div className="u-banner">Couldn't load the history ({error}).</div>}
      <div className="u-table-wrap">
        <table className="u-table ai-table">
          <thead>
            <tr><th>Date &amp; Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th><th><span className="sr-only">Open</span></th></tr>
          </thead>
          <tbody>
            {data?.entries.map((e) => (
              <tr key={e.id}>
                <td className="u-nowrap">{fmtDateTime(e.at)}</td>
                <td className="u-nowrap">{e.user.name}</td>
                <td><ActionBadge action={e.action} /></td>
                <td className="ai-id" title={e.recordId}>{e.recordId}</td>
                <td className="ai-history-details">{e.summary}</td>
                <td className="ai-col-actions">
                  {e.link && e.action !== 'export' && (
                    <Link to={e.link} className="u-row-btn" aria-label="Open record" title="Open record"><ExternalLink size={14} /></Link>
                  )}
                </td>
              </tr>
            ))}
            {data && !data.entries.length && <tr><td colSpan={6} className="u-empty">No changes recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <footer className="u-pager">
          <span className="u-muted">{data.total.toLocaleString('en-US')} changes recorded</span>
          <nav className="u-pages" aria-label="Pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
            <span className="u-muted ai-page-of">Page {data.page} of {data.pages}</span>
            <button type="button" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
          </nav>
        </footer>
      )}
    </section>
  )
}
