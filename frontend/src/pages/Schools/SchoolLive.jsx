import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ClipboardCheck, ShieldCheck, Wrench, Layers, CircleCheck, TriangleAlert, Clock, Eye, Plus, CircleDashed,
} from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import { fmtDay, CONDITION_TONE } from '../Surveillance/survMeta'
import { AcmBadge } from './BuildingParts'
import { fmtNum } from './buildingUtils'
import { request } from '../../lib/api'

/**
 * Live figures for one school from every module (inspection records, surveillance, O&M, ACM inventory), so the
 * school page shows what's actually recorded rather than sample totals. Each part loads on its own; a part that
 * fails shows dashes.
 */
export function useSchoolLive(schoolId) {
  const [d, setD] = useState({ id: schoolId })
  useEffect(() => {
    let cancelled = false
    const q = encodeURIComponent(schoolId)
    const sources = {
      ins: `/inspection-records?school=${q}&pageSize=100`,
      sv: `/surveillance?school=${q}&pageSize=6`,
      sched: `/surveillance/schedule?school=${q}&pageSize=10`,
      om: `/om/activities?school=${q}&status=open&sort=dueDate&dir=asc&pageSize=5`,
      acm: `/acm-inventory?school=${q}&pageSize=1`,
      groups: `/acm-inventory/groups?by=building&school=${q}`,
    }
    setD({ id: schoolId })
    Object.entries(sources).forEach(([k, url]) => {
      request(url).then((v) => { if (!cancelled) setD((cur) => (cur.id === schoolId ? { ...cur, [k]: v } : cur)) }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [schoolId])

  return useMemo(() => {
    const records = d.ins?.records ?? []
    const today = new Date().toISOString().slice(0, 10)
    const done = records.filter((r) => r.status === 'completed' && r.date).sort((a, b) => b.date.localeCompare(a.date))
    const upcoming = records.filter((r) => r.state === 'scheduled' && r.scheduledDate)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
    return {
      ...d,
      loaded: Boolean(d.ins && d.sv && d.om && d.acm),
      lastInspection: done[0] ?? null,
      // The next one not yet overdue, else the most overdue
      nextInspection: upcoming.find((r) => r.scheduledDate >= today) ?? upcoming[0] ?? null,
      inspections: d.ins ? {
        total: records.length,
        open: records.filter((r) => r.status === 'scheduled' || r.status === 'inProgress').length,
        inReview: records.filter((r) => r.status === 'pendingReview').length,
        overdue: records.filter((r) => r.overdue).length,
        completed: done.length,
      } : null,
    }
  }, [d])
}

const dash = (v) => (v == null ? '—' : fmtNum(v))

/** Overview: the school's live state across modules. */
export function LiveSnapshot({ live, schoolId }) {
  const ins = live.inspections
  const sv = live.sv?.stats
  const om = live.om?.stats
  const acm = live.acm?.stats
  return (
    <section className="u-card">
      <header className="u-card-head"><h2><Layers size={16} /> Asbestos at a Glance</h2><span className="u-muted u-small">Live from every module</span></header>
      <ul className="sl-tiles">
        <Tile to={`/schools/${schoolId}/acm`} icon={Layers} tone="violet" label="ACM Locations" value={acm && acm.acmPresent + acm.assumed}
          sub={acm ? `${fmtNum(acm.acmPresent)} present · ${fmtNum(acm.assumed)} assumed · ${fmtNum(acm.damaged + acm.significantlyDamaged)} damaged` : null} />
        <Tile to={`/schools/${schoolId}/inspections`} icon={ClipboardCheck} tone={ins?.overdue ? 'critical' : 'primary'} label="Open Inspections" value={ins?.open}
          sub={ins ? `${ins.inReview} in review · ${ins.overdue} overdue · ${ins.completed} completed` : null} />
        <Tile to={`/schools/${schoolId}/surveillance`} icon={ShieldCheck} tone={sv?.overdue ? 'critical' : 'good'} label="Surveillance Overdue" value={sv?.overdue}
          sub={sv ? `${fmtNum(sv.dueNext30)} due in 30 days · ${fmtNum(sv.actionRequired)} need corrective action` : null} />
        <Tile to="/operations" icon={Wrench} tone={om?.overdue ? 'critical' : 'teal'} label="Open O&M Work" value={om && om.pending + om.inProgress + om.overdue}
          sub={om ? `${fmtNum(om.overdue)} overdue · ${fmtNum(om.completed)} completed` : null} />
      </ul>
      <dl className="cd-facts sd-facts">
        <div className="cd-row"><dt>Last Inspection</dt><dd>{live.lastInspection
          ? <><Link to={`/inspections/records/${live.lastInspection.id}`}>{live.lastInspection.id}</Link> · {live.lastInspection.type} · {fmtDay(live.lastInspection.date)}</>
          : live.ins ? 'None completed yet' : '—'}</dd></div>
        <div className="cd-row"><dt>Next Inspection</dt><dd>{live.nextInspection
          ? <><Link to={`/inspections/records/${live.nextInspection.id}`}>{live.nextInspection.id}</Link> · {live.nextInspection.type} · {fmtDay(live.nextInspection.scheduledDate)}{live.nextInspection.overdue ? <b className="sl-late"> · overdue</b> : ''}</>
          : live.ins ? 'None scheduled' : '—'}</dd></div>
      </dl>
    </section>
  )
}

function Tile({ to, icon: Icon, tone, label, value, sub }) {
  return (
    <li>
      <Link to={to} className={`sl-tile tone-${tone}`}>
        <span className="sl-tile-icon"><Icon size={16} /></span>
        <span className="sl-tile-text"><strong>{dash(value)}</strong><span>{label}</span>{sub && <small>{sub}</small>}</span>
      </Link>
    </li>
  )
}

/** ACM Summary: per building, from the ACM inventory records (not the buildings' sample room counts). */
export function SchoolAcmSummary({ buildings, live, schoolId }) {
  const rows = useMemo(() => {
    const byId = new Map((live.groups?.rows ?? []).map((g) => [g.key, g]))
    return buildings.map((b) => ({ b, g: byId.get(b.id) ?? null }))
  }, [buildings, live.groups])
  const sum = (f) => rows.reduce((n, { g }) => n + (g ? f(g) : 0), 0)
  const present = (g) => g.status['ACM Present'] ?? 0
  const assumed = (g) => g.status['Assumed ACM'] ?? 0
  const none = (g) => g.status['No ACM'] ?? 0
  const damaged = (g) => (g.condition.Damaged ?? 0) + (g.condition['Significantly Damaged'] ?? 0)
  const loaded = Boolean(live.groups)

  return (
    <section className="u-card">
      <header className="u-card-head">
        <h2>ACM by Building</h2>
        <span className="u-muted u-small">{loaded ? `${fmtNum(sum(present))} ACM present · ${fmtNum(sum(assumed))} assumed · ${fmtNum(sum(none))} sampled no ACM` : 'Loading…'}</span>
      </header>
      <div className="u-table-wrap">
        <table className="u-table c-table">
          <thead>
            <tr><th>Building</th><th>Status</th><th className="c-num">ACM Present</th><th className="c-num">Assumed</th><th className="c-num">No ACM</th>
              <th className="c-num">Damaged</th><th className="c-num">Friable</th><th className="c-num">Rooms with ACM</th><th>Last Assessed</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(({ b, g }) => (
              <tr key={b.id}>
                <td><strong>{b.name}</strong><small className="p-sub">{b.code} · built {b.yearBuilt}</small></td>
                <td><AcmBadge status={b.acmStatus} /></td>
                <td className="c-num">{loaded ? fmtNum(g ? present(g) : 0) : '…'}</td>
                <td className="c-num">{loaded ? fmtNum(g ? assumed(g) : 0) : '…'}</td>
                <td className="c-num">{loaded ? fmtNum(g ? none(g) : 0) : '…'}</td>
                <td className={`c-num${g && damaged(g) ? ' sl-late' : ''}`}>{loaded ? fmtNum(g ? damaged(g) : 0) : '…'}</td>
                <td className="c-num">{loaded ? fmtNum(g?.friable ?? 0) : '…'}</td>
                <td className="c-num">{loaded ? fmtNum(g?.acmRooms ?? 0) : '…'}</td>
                <td className="u-nowrap">{g?.lastAssessed ? fmtDay(g.lastAssessed) : '—'}</td>
                <td className="b-col-actions">
                  <Link className="u-row-btn" title="Open in the ACM Inventory" aria-label={`Open ${b.name} in the ACM Inventory`}
                    to="/acm" state={{ place: { school: schoolId, building: b.id } }}><Eye size={14} /></Link>
                </td>
              </tr>
            ))}
            {!buildings.length && <tr><td colSpan={10} className="u-empty">No buildings yet.</td></tr>}
          </tbody>
          {buildings.length > 0 && loaded && (
            <tfoot>
              <tr><td>Total</td><td /><td className="c-num">{fmtNum(sum(present))}</td><td className="c-num">{fmtNum(sum(assumed))}</td><td className="c-num">{fmtNum(sum(none))}</td>
                <td className="c-num">{fmtNum(sum(damaged))}</td><td className="c-num">{fmtNum(sum((g) => g.friable))}</td><td className="c-num">{fmtNum(sum((g) => g.acmRooms))}</td><td /><td /></tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="ad-sample">Counts come from the ACM inventory records. “Assumed” is suspect material not yet sampled — AHERA treats it as ACM until lab results show otherwise; “No ACM” is material sampled and found free of asbestos.</p>
    </section>
  )
}

/** Surveillance: what each ACM needs next, and the latest surveillance recorded at the school. */
export function SchoolSurveillance({ live, schoolId }) {
  const st = live.sched?.stats
  const sv = live.sv?.stats
  return (
    <>
      <section className="u-card">
        <header className="u-card-head">
          <h2><ShieldCheck size={16} /> 6-Month Surveillance by ACM</h2>
          <Link className="u-btn u-btn-outline u-btn-sm" to={`/surveillance/schedule`}>Full Schedule</Link>
        </header>
        <ul className="sl-tiles sl-tiles-sm">
          <Tile to="/surveillance/schedule" icon={Layers} tone="primary" label="ACM Under Surveillance" value={st?.total} />
          <Tile to="/surveillance/schedule" icon={TriangleAlert} tone="critical" label="Overdue" value={st?.overdue} />
          <Tile to="/surveillance/schedule" icon={Clock} tone="warning" label="Due in 30 Days" value={st?.dueSoon} />
          <Tile to="/surveillance/schedule" icon={CircleDashed} tone="violet" label="Never Surveyed" value={st?.never} />
          <Tile to="/surveillance/findings" icon={Wrench} tone="teal" label="Corrective Action Open" value={sv?.actionRequired} />
        </ul>
        <div className="u-table-wrap">
          <table className="u-table c-table">
            <thead><tr><th>ACM</th><th>Location</th><th>Last Surveyed</th><th>Next Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {(live.sched?.items ?? []).map((x) => (
                <tr key={x.materialId}>
                  <td><strong>{x.materialName}</strong><small className="p-sub">{x.acmStatus}</small></td>
                  <td>{x.buildingName} · {x.floorName} · {x.roomNumber} {x.roomName}</td>
                  <td className="u-nowrap">{x.lastId ? <><Link to={`/surveillance/records/${x.lastId}`}>{fmtDay(x.lastDate)}</Link>{x.lastCondition && <small className="p-sub">{x.lastCondition}</small>}</> : 'Never'}</td>
                  <td className="u-nowrap">{fmtDay(x.nextDue)}</td>
                  <td><Badge tone={{ overdue: 'critical', dueSoon: 'warning', scheduled: 'good' }[x.status]}>{{ overdue: 'Overdue', dueSoon: 'Due Soon', scheduled: 'Up to Date' }[x.status]}</Badge></td>
                  <td className="b-col-actions"><Link className="u-row-btn" title="Record surveillance" aria-label={`Record surveillance of ${x.materialName}`} to={`/surveillance/new?material=${x.materialId}`}><Plus size={14} /></Link></td>
                </tr>
              ))}
              {live.sched && !live.sched.items.length && <tr><td colSpan={6} className="u-empty">No known or assumed ACM to survey at this school.</td></tr>}
              {!live.sched && <tr><td colSpan={6} className="u-empty">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
        {st && st.total > (live.sched?.items.length ?? 0) && <p className="u-muted u-small sl-more">Showing the {live.sched.items.length} due first of {fmtNum(st.total)} — see the full schedule for the rest.</p>}
      </section>

      <section className="u-card">
        <header className="u-card-head"><h2>Latest Surveillance Records</h2><Link className="u-btn u-btn-outline u-btn-sm" to="/surveillance">All Records</Link></header>
        <div className="u-table-wrap">
          <table className="u-table c-table">
            <thead><tr><th>Record</th><th>Date</th><th>ACM</th><th>Inspector</th><th>Condition</th><th>Status</th></tr></thead>
            <tbody>
              {(live.sv?.records ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="u-nowrap"><Link className="b-link" to={`/surveillance/records/${r.id}`}>{r.id}</Link></td>
                  <td className="u-nowrap">{fmtDay(r.date)}</td>
                  <td>{r.materialName}<small className="p-sub">{r.buildingName} · {r.roomNumber} {r.roomName}</small></td>
                  <td>{r.inspectorName ?? '—'}</td>
                  <td>{r.condition ? <Badge tone={CONDITION_TONE[r.condition]}>{r.condition}</Badge> : '—'}</td>
                  <td>{r.status === 'actionRequired' ? <Badge tone="warning">Action Required</Badge> : r.status === 'draft' ? <Badge tone="neutral">Draft</Badge> : <Badge tone="good">Completed</Badge>}</td>
                </tr>
              ))}
              {live.sv && !live.sv.records.length && <tr><td colSpan={6} className="u-empty">No surveillance recorded at this school yet.</td></tr>}
              {!live.sv && <tr><td colSpan={6} className="u-empty">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/** Compliance: the AHERA obligations checked against what's recorded. */
export function LiveChecks({ live }) {
  const ins = live.inspections
  const st = live.sched?.stats
  const om = live.om?.stats
  const checks = [
    { label: 'Inspections on time', detail: ins ? (ins.overdue ? `${ins.overdue} scheduled inspection${ins.overdue === 1 ? ' is' : 's are'} past their date` : `${ins.open} open, none overdue`) : null, ok: ins && !ins.overdue, link: '/inspections/overdue' },
    { label: 'Inspections reviewed', detail: ins ? (ins.inReview ? `${ins.inReview} waiting for the reviewer` : 'Nothing waiting for review') : null, ok: ins && !ins.inReview, warnOnly: true, link: '/inspections/review' },
    { label: '6-month surveillance up to date', detail: st ? (st.overdue ? `${st.overdue} of ${st.total} ACM overdue${st.never ? ` (${st.never} never surveyed)` : ''}` : `All ${st.total} ACM within 6 months`) : null, ok: st && !st.overdue, link: '/surveillance/schedule' },
    { label: 'O&M work on time', detail: om ? (om.overdue ? `${om.overdue} O&M activit${om.overdue === 1 ? 'y' : 'ies'} overdue` : `${om.pending + om.inProgress} open, none overdue`) : null, ok: om && !om.overdue, link: '/operations' },
  ]
  return (
    <ul className="sl-checks">
      {checks.map((c) => {
        const state = c.ok == null ? 'na' : c.ok ? 'ok' : c.warnOnly ? 'warn' : 'bad'
        const Icon = state === 'ok' ? CircleCheck : state === 'na' ? CircleDashed : TriangleAlert
        return (
          <li key={c.label} className={`sl-check ${state}`}>
            <Icon size={16} />
            <span><strong>{c.label}</strong><small>{c.detail ?? 'Loading…'}</small></span>
            <Link className="u-btn u-btn-ghost u-btn-sm" to={c.link}>View</Link>
          </li>
        )
      })}
    </ul>
  )
}

