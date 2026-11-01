import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { InspectionStatusBadge } from '../Compliance/complianceMeta'
import { request, fmtDate } from '../../lib/api'

// Shared by the school page and the building page
const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')

export function InspectionTable({ inspections, empty, showBuilding = true }) {
  return (
    <div className="u-table-wrap">
      <table className="u-table c-table">
        <thead>
          <tr>
            <th>Scheduled</th><th>Type</th>{showBuilding && <th>Building</th>}<th className="b-col-floor">Floor</th>
            <th className="b-col-inspector">Inspector</th><th>Completed</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {inspections.map((i) => (
            <tr key={i.id}>
              <td className="u-nowrap">{fmtDay(i.scheduledDate)}</td>
              <td>{i.type}</td>
              {showBuilding && <td>{i.buildingName ?? 'All buildings'}</td>}
              <td className="b-col-floor">{i.floor ?? '—'}</td>
              <td className="b-col-inspector">{i.inspectorName ?? '—'}</td>
              <td className="u-nowrap">{i.completedAt ? fmtDate(i.completedAt) : '—'}</td>
              <td><InspectionStatusBadge status={i.status} /></td>
            </tr>
          ))}
          {!inspections.length && <tr><td colSpan={showBuilding ? 7 : 6} className="u-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// `filter`: { school } or { school, building } — passed straight to /api/documents
export function DocumentsCard({ filter, emptyText = 'No documents yet.', showBuilding = true }) {
  const qs = new URLSearchParams({ ...filter, pageSize: 100 }).toString()
  const [docs, setDocs] = useState(null)
  useEffect(() => {
    let cancelled = false
    request(`/documents?${qs}`)
      .then((d) => { if (!cancelled) setDocs({ qs, ...d }) })
      .catch(() => { if (!cancelled) setDocs({ qs, documents: [], total: 0 }) })
    return () => { cancelled = true }
  }, [qs])
  const data = docs?.qs === qs ? docs : null
  const cols = showBuilding ? 6 : 5

  return (
    <section className="u-card">
      <header className="u-card-head">
        <h2>Documents {data && `(${data.total})`}</h2>
        <Link className="u-btn u-btn-outline u-btn-sm" to="/documents"><FolderOpen size={13} />Document Management</Link>
      </header>
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead><tr><th>Document</th><th>Type</th>{showBuilding && <th className="b-col-floor">Building</th>}<th>Uploaded</th><th>Access</th><th /></tr></thead>
          <tbody>
            {data?.documents.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.name}</strong></td>
                <td>{d.type}</td>
                {showBuilding && <td className="b-col-floor">{d.buildingName ?? '—'}</td>}
                <td className="u-nowrap">{fmtDate(d.uploadedAt)}</td>
                <td>{d.access}</td>
                <td><a className="u-row-btn" href={`/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer" title="Open" aria-label={`Open ${d.name}`}><ExternalLink size={13} /></a></td>
              </tr>
            ))}
            {data && !data.documents.length && <tr><td colSpan={cols} className="u-empty">{emptyText}</td></tr>}
            {!data && <tr><td colSpan={cols} className="u-empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
