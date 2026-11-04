import { Link, useNavigate } from 'react-router'
import { ArrowDown, ArrowUp, Eye, Pencil, MapPin, Trash2, CircleCheck, TriangleAlert, Play, Paperclip } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import RowMenu from '../Surveillance/RowMenu'
import Pager from '../Surveillance/Pager'
import { fmtDay, shortAcm, floorLink } from '../Surveillance/survMeta'
import { STATUS_TONE } from './omMeta'
import DueDate from '../../lib/DueDate'

const COLUMNS = {
  id: { key: 'id', label: 'Activity ID' },
  inspection: { key: null, label: 'Inspection / Sample ID' },
  type: { key: 'type', label: 'Activity Type' },
  place: { key: 'facility', label: 'Facility / Location' },
  material: { key: 'material', label: 'ACM Material' },
  dueDate: { key: 'dueDate', label: 'Due Date' },
  assignee: { key: 'assignee', label: 'Assigned To' },
  completedAt: { key: 'completedAt', label: 'Completed' },
  status: { key: 'status', label: 'Status' },
}

/**
 * O&M activities table shared by the Overview, Work Orders and History tabs.
 * `columns` picks and orders the columns; actions: onStart / onDelete (optional).
 */
export default function ActivityTable({ data, columns, sort, onSort, onPage, pageSize, onPageSize, onStart, onDelete, empty = 'No O&M activities match these filters.' }) {
  const navigate = useNavigate()
  const sortKey = sort.key || data?.sort
  const sortDir = sort.dir || data?.dir
  const open = (id) => navigate(`/operations/activities/${id}`)
  // The activity's inspection (or the latest inspection of its ACM) and that inspection's sample always follow its ID
  const shown = columns.flatMap((c) => (c === 'id' ? ['id', 'inspection'] : [c]))
  const cols = shown.map((c) => COLUMNS[c])

  return (
    <>
      <div className="u-table-wrap">
        <table className="u-table ai-table om-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.label} aria-sort={c.key && sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.key ? (
                    <button type="button" className="a-sort" onClick={() => onSort(c.key)}>
                      {c.label}{sortKey === c.key && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th className="om-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.activities.map((r) => (
              <tr key={r.id}>
                {shown.map((c) => {
                  switch (c) {
                    case 'id': return <td key={c} className="u-nowrap"><Link to={`/operations/activities/${r.id}`} className="sv-id">{r.id}</Link></td>
                    // The inspection (its O&M Tasks), and the sample — opened at the lab once it's been sent
                    case 'inspection': return (
                      <td key={c} className="u-nowrap om-insp">
                        {r.inspectionId
                          ? <Link to={`/inspections/records/${r.inspectionId}${r.relatedInspection ? '' : '?tab=om'}`} className="sv-id"
                            title={r.relatedInspection ? 'Latest inspection of this ACM' : 'Created from this inspection'}>{r.inspectionId}</Link>
                          : <span className="u-muted" title="This ACM hasn’t been inspected">Not inspected</span>}
                        {r.sampleId && (
                          <small>
                            {r.sampleLink ? <Link to={r.sampleLink} className="a-mono">{r.sampleId}</Link> : <span className="a-mono" title="Not sent to the lab yet">{r.sampleId}</span>}
                            {r.labSampleId && <span className="u-muted" title="Laboratory sample ID"> · {r.labSampleId}</span>}
                          </small>
                        )}
                        {r.inspectionId && !r.sampleId && <small className="u-muted">No sample taken</small>}
                      </td>
                    )
                    case 'type': return <td key={c} className="ai-material"><strong>{r.type}</strong><small title={r.description}>{r.description}</small></td>
                    case 'place': return <td key={c} className="ai-room om-loc"><strong>{r.schoolName}</strong><small>{r.buildingName} / {r.floorName} / {r.roomNumber} {r.roomName}</small></td>
                    case 'material': return <td key={c} className="ai-room"><strong>{r.materialName}</strong><small title={r.materialId}>{shortAcm(r.materialId, r.schoolId)}</small></td>
                    case 'dueDate': return <td key={c} className="u-nowrap"><DueDate date={r.dueDate} done={r.status === 'completed'} soonDays={7}>{fmtDay(r.dueDate)}</DueDate></td>
                    case 'assignee': return <td key={c} className="u-nowrap">{r.assignedToName ?? <span className="u-muted">Unassigned</span>}</td>
                    case 'completedAt': return <td key={c} className="u-nowrap">{r.completedAt ? fmtDay(r.completedAt.slice(0, 10)) : '—'}</td>
                    default: return (
                      <td key={c}>
                        <Badge tone={STATUS_TONE[r.status]}>{r.status === 'completed' && <CircleCheck size={12} />}{r.status === 'overdue' && <TriangleAlert size={12} />}{r.statusLabel}</Badge>
                        {r.attachments > 0 && <small className="om-clip" title={`${r.attachments} file(s)`}><Paperclip size={11} />{r.attachments}</small>}
                      </td>
                    )
                  }
                })}
                <td className="om-col-actions">
                  <Link to={`/operations/activities/${r.id}`} className="u-row-btn" aria-label={`View ${r.id}`} title="View"><Eye size={15} /></Link>
                  <RowMenu label={`More actions for ${r.id}`} items={[
                    r.status !== 'completed' && { icon: Pencil, label: 'Update / record work', onClick: () => open(r.id) },
                    onStart && r.state === 'pending' && { icon: Play, label: 'Start work', onClick: () => onStart(r) },
                    { icon: MapPin, label: 'Open room on floor plan', onClick: () => navigate(floorLink(r)) },
                    onDelete && r.state === 'pending' && { icon: Trash2, label: 'Delete activity', danger: true, onClick: () => onDelete(r) },
                  ]} />
                </td>
              </tr>
            ))}
            {data && !data.activities.length && <tr><td colSpan={cols.length + 1} className="u-empty">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <Pager data={data} noun="records" onPage={onPage} pageSize={pageSize} onPageSize={onPageSize} />}
    </>
  )
}
