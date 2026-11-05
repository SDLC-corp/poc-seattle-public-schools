import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ClipboardCheck, UserRoundPlus } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import { STATUS_TONE, fmtTime } from '../Inspections/inspMeta'
import { fmtDay } from '../Surveillance/survMeta'
import { request } from '../../lib/api'

// Status chips: every stage an inspection goes through (server: inspectionMeta.statusOf)
const STAGES = [
  { key: '', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'pendingReview', label: 'In Review' },
  { key: 'completed', label: 'Completed' },
]

/**
 * A school's inspection records at every stage (scheduled, in progress, in review, completed), newest activity first,
 * each linking to the inspection. Follow-ups and damage inspections requested from surveillance are marked.
 */
export default function SchoolInspections({ schoolId }) {
  const [records, setRecords] = useState(null)
  const [error, setError] = useState(null)
  const [stage, setStage] = useState('')

  useEffect(() => {
    let cancelled = false
    request(`/inspection-records?school=${encodeURIComponent(schoolId)}&pageSize=100`)
      .then((d) => { if (!cancelled) { setRecords(d.records); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [schoolId])

  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.key, (records ?? []).filter((r) => !s.key || r.status === s.key).length])), [records])
  const shown = (records ?? []).filter((r) => !stage || r.status === stage)

  return (
    <section className="u-card">
      <header className="u-card-head b-head">
        <h2><ClipboardCheck size={16} /> Inspections ({records?.length ?? '…'})</h2>
        <Link className="u-btn u-btn-outline u-btn-sm" to="/inspections/assign"><UserRoundPlus size={13} />Assign Inspection</Link>
      </header>

      <div className="sch-insp-stages" role="tablist" aria-label="Inspection stage">
        {STAGES.map((s) => (
          <button key={s.key || 'all'} type="button" role="tab" aria-selected={stage === s.key} className={stage === s.key ? 'on' : undefined} onClick={() => setStage(s.key)}>
            {s.label}<span>{records ? counts[s.key] : ''}</span>
          </button>
        ))}
      </div>

      {error && <div className="u-banner">Couldn't load this school's inspections ({error}).</div>}
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead>
            <tr><th>Inspection</th><th>Type</th><th>Date</th><th>Location / ACM</th><th>Inspector</th><th>Status</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="u-nowrap">
                  <Link className="b-link" to={`/inspections/records/${r.id}`}>{r.id}</Link>
                  {r.parentId && <small className="p-sub">Follow-up of {r.parentId}</small>}
                  {r.surveillanceId && <small className="p-sub">From surveillance {r.surveillanceId}</small>}
                </td>
                <td>{r.type}</td>
                <td className="u-nowrap">
                  {fmtDay(r.shownDate)}{r.state === 'scheduled' && r.scheduledTime ? ` · ${fmtTime(r.scheduledTime)}` : ''}
                  {r.overdue && <small className="p-sub sch-insp-late">Overdue</small>}
                </td>
                <td>
                  {r.buildingName} · {r.floorName} · {r.roomNumber} {r.roomName}
                  <small className="p-sub">{r.materialName}{r.acmCount > 1 ? ` (${r.acmCount} ACMs)` : ''}</small>
                </td>
                <td className="u-nowrap">{r.inspectorName ?? '—'}</td>
                <td><Badge tone={STATUS_TONE[r.status]}>{r.statusText}</Badge></td>
              </tr>
            ))}
            {records && !shown.length && (
              <tr><td colSpan={6} className="u-empty">{records.length ? 'No inspections at this stage.' : 'No inspections recorded for this school yet.'}</td></tr>
            )}
            {!records && !error && <tr><td colSpan={6} className="u-empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
