import { useEffect, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import Badge from './Badge'
import { request } from '../../lib/api'
import { CONDITION_TONE, STATUS_TONE, fmtDay } from './acmInventoryMeta'

const CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged', 'Not Assessed']
const PAGE = 25

// Condition mix as one thin stacked bar; the legend above the table names the colours
function ConditionBar({ row }) {
  return (
    <div className="ai-bar" role="img"
      aria-label={CONDITIONS.map((c) => `${c}: ${row.condition[c]}`).join(', ')}
      title={CONDITIONS.map((c) => `${c}: ${row.condition[c]}`).join('\n')}>
      {CONDITIONS.filter((c) => row.condition[c]).map((c) => (
        <span key={c} className={`tone-${CONDITION_TONE[c]}`} style={{ flexGrow: row.condition[c] }} />
      ))}
    </div>
  )
}

/**
 * Summary of the (filtered) inventory grouped by material type, building, condition or ACM status.
 * Clicking a row opens the Inventory tab filtered to that group.
 */
export default function GroupTab({ tab, qs, onOpen }) {
  const [state, setState] = useState({ key: null, rows: null, error: null })
  const [page, setPage] = useState(1)
  const key = `${tab.groupBy}?${qs}`

  useEffect(() => {
    let cancelled = false
    request(`/acm-inventory/groups?by=${tab.groupBy}&${qs}`)
      .then((d) => { if (!cancelled) { setState({ key, rows: d.rows, error: null }); setPage(1) } })
      .catch((e) => { if (!cancelled) setState({ key, rows: null, error: e.message }) })
    return () => { cancelled = true }
  }, [tab.groupBy, qs, key])

  const rows = state.key === key ? state.rows : null
  const pages = rows ? Math.max(1, Math.ceil(rows.length / PAGE)) : 1
  const shown = rows?.slice((page - 1) * PAGE, page * PAGE)
  const total = rows?.reduce((n, r) => n + r.total, 0) ?? 0

  return (
    <section className="u-card ai-records">
      <header className="ai-group-head">
        <h2 className="ai-records-title">ACM Inventory by {tab.groupLabel}</h2>
        <ul className="ai-legend" aria-label="Condition colours">
          {CONDITIONS.map((c) => <li key={c}><i className={`tone-${CONDITION_TONE[c]}`} />{c}</li>)}
        </ul>
      </header>
      {state.error && <div className="u-banner">Couldn't load the summary ({state.error}).</div>}
      <div className="u-table-wrap">
        <table className="u-table ai-table ai-group-table">
          <thead>
            <tr>
              <th>{tab.groupLabel}</th>
              <th className="num">Records</th>
              <th className="num">Share</th>
              <th className="num">ACM Present</th>
              <th className="num">Assumed</th>
              <th className="num">No ACM</th>
              <th className="ai-col-bar">Condition</th>
              <th className="num">Friable ACM</th>
              <th>ACM Quantity</th>
              <th>Last Assessed</th>
              <th><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {shown?.map((r) => (
              <tr key={r.key} className="ai-clickable" tabIndex={0} onClick={() => onOpen(r.filter)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r.filter) }}>
                <td className="ai-room">
                  {tab.groupBy === 'condition' ? <Badge tone={CONDITION_TONE[r.label]}>{r.label}</Badge>
                    : tab.groupBy === 'status' ? <Badge tone={STATUS_TONE[r.label]}>{r.label}</Badge>
                      : <strong>{r.label}</strong>}
                  {r.sub && <small>{r.sub}</small>}
                </td>
                <td className="num"><strong>{r.total.toLocaleString('en-US')}</strong></td>
                <td className="num u-muted">{total ? `${((r.total / total) * 100).toFixed(1)}%` : '—'}</td>
                <td className="num">{r.status['ACM Present'] || <span className="u-muted">0</span>}</td>
                <td className="num">{r.status['Assumed ACM'] || <span className="u-muted">0</span>}</td>
                <td className="num">{r.status['No ACM'] || <span className="u-muted">0</span>}</td>
                <td className="ai-col-bar"><ConditionBar row={r} /></td>
                <td className="num">{r.friable || <span className="u-muted">0</span>}</td>
                <td className="u-nowrap">
                  {r.quantities.length ? r.quantities.map((q) => `${q.total.toLocaleString('en-US')} ${q.unit}`).join(' · ') : <span className="u-muted">—</span>}
                </td>
                <td className="u-nowrap">{fmtDay(r.lastAssessed)}</td>
                <td className="ai-col-actions"><ArrowRight size={15} className="ai-open-icon" aria-hidden="true" /></td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={11} className="u-empty">No ACM records match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows && (
        <footer className="u-pager">
          <span className="u-muted">{rows.length.toLocaleString('en-US')} {rows.length === 1 ? 'group' : 'groups'} · {total.toLocaleString('en-US')} records · click a row to open it in the inventory</span>
          {pages > 1 && (
            <nav className="u-pages" aria-label="Pagination">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <span className="u-muted ai-page-of">Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </nav>
          )}
        </footer>
      )}
    </section>
  )
}
