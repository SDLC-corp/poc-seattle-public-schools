import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Download, ArrowRight } from 'lucide-react'
import { request } from '../../lib/api'
import { TABS, tabForReport, STAT_ICONS } from './reportMeta'

// One card per report: its headline numbers, a link into the report and a full CSV download
export default function ReportsOverview() {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    request('/reports/overview').then(setReports).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="u-banner">Couldn't load the report overview ({error}).</div>
  if (!reports) return <p className="u-muted">Loading reports…</p>

  const byId = new Map(reports.map((r) => [r.id, r]))
  // One grid in tab order; the area is a tag on each card so single-report areas don't leave gaps
  const cards = TABS.flatMap((t) => (t.reports ?? []).map((id) => ({ area: t.label, report: byId.get(id) })))
    .filter((c) => c.report)

  return (
    <div className="rp-ov-grid">
      {cards.map(({ area, report: r }) => {
        const [total, ...rest] = r.stats
        const TotalIcon = STAT_ICONS[total.icon]
        return (
          <article key={r.id} className="u-card rp-ov-card">
            <header>
              <span className={`rp-ov-icon tone-${total.tone}`}><TotalIcon size={18} /></span>
              <div>
                <span className="rp-ov-area">{area}</span>
                <h3>{r.title}</h3>
                <p>{r.description}</p>
              </div>
            </header>
            <div className="rp-ov-total">
              <strong>{total.value.toLocaleString('en-US')}</strong>
              <span>{total.label}</span>
            </div>
            <ul className="rp-ov-stats">
              {rest.map((s) => (
                <li key={s.key} className={`tone-${s.tone}`}>
                  <i aria-hidden="true" />
                  <span>{s.label}</span>
                  <strong>{s.value.toLocaleString('en-US')}</strong>
                </li>
              ))}
            </ul>
            <footer>
              <Link className="u-btn u-btn-outline u-btn-sm" to={`/reports/${tabForReport(r.id).id}/${r.id}`}>
                Open Report<ArrowRight size={14} />
              </Link>
              <a className="u-btn u-btn-ghost u-btn-sm rp-ov-dl" href={`/api/reports/${r.id}/export.csv`} download>
                <Download size={14} />CSV
              </a>
            </footer>
          </article>
        )
      })}
    </div>
  )
}
