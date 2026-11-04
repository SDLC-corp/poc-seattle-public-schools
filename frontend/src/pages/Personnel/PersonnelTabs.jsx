import { Fragment, useEffect, useState } from 'react'
import { Search, BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleMinus, TriangleAlert } from 'lucide-react'
import { request } from '../../lib/api'
import TrainingMaterials from './TrainingMaterials'
import HelpLearning from '../Help/HelpLearning'

const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')
const PAGE_SIZE = 12

export function Pager({ page, pages, total, from, to, onPage, label }) {
  return (
    <footer className="u-pager">
      <span className="u-muted">{total ? `Showing ${from} to ${to} of ${total} ${label}` : `No ${label}`}</span>
      <nav className="u-pages" aria-label="Pagination">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
        <span className="u-gap">Page {page} of {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
      </nav>
    </footer>
  )
}

// Training tab: the programs as a card grid; the selected program's details and learning material on the right;
// the software training below
export function TrainingTab({ meta, summary, notify }) {
  const [materials, setMaterials] = useState(null)
  const [materialsKey, setMaterialsKey] = useState(0)
  const [programId, setProgramId] = useState(() => meta.programs[0]?.id ?? '')

  useEffect(() => {
    let cancelled = false
    request('/personnel/materials').then((d) => { if (!cancelled) setMaterials(d.materials) }).catch(() => { if (!cancelled) setMaterials([]) })
    return () => { cancelled = true }
  }, [materialsKey])
  const materialCount = (id) => (materials ?? []).filter((m) => m.programId === id).length

  const byProgram = Object.fromEntries((summary?.byProgram ?? []).map((p) => [p.id, p]))
  const sel = meta.programs.find((p) => p.id === programId)
  const selStats = sel && byProgram[sel.id]

  return (
    <>
      <div className="tr-split">
        <section className="u-card tr-main">
          <header className="u-card-head">
            <h2>Training Programs <span>({meta.programs.length})</span></h2>
            <span className="u-muted p-hint-inline">Select a program to see its details and material</span>
          </header>
          <ul className="tr-grid">
            {meta.programs.map((p) => {
              const s = byProgram[p.id]
              const total = (s?.valid ?? 0) + (s?.dueSoon ?? 0) + (s?.lapsed ?? 0)
              const n = materialCount(p.id)
              return (
                <li key={p.id}>
                  <button type="button" className={`tr-card${programId === p.id ? ' on' : ''}`} aria-pressed={programId === p.id} onClick={() => setProgramId(p.id)}>
                    <span className="tr-card-top">
                      <strong>{p.name}</strong>
                      {p.accredited && <span className="tr-acc"><BadgeCheck size={12} />EPA accredited</span>}
                    </span>
                    <span className="tr-facts">{p.hours} h · {p.renewalMonths ? `renews every ${p.renewalMonths} months` : 'no expiry'}</span>
                    <span className="tr-bar" aria-label={`${s?.valid ?? 0} current, ${s?.dueSoon ?? 0} due soon, ${s?.lapsed ?? 0} lapsed or missing`}>
                      {total > 0 && [['valid', 'good'], ['dueSoon', 'warn'], ['lapsed', 'crit']].map(([k, cls]) => s[k] > 0 && <i key={k} className={cls} style={{ flexGrow: s[k] }} />)}
                    </span>
                    <span className="tr-card-foot">
                      <span>{s ? `${s.valid} of ${total} current` : '—'}</span>
                      <span>{materials ? `${n} material${n === 1 ? '' : 's'}` : ''}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {sel && (
          <aside className="tr-side" aria-label={`${sel.name} details`}>
            <section className="u-card">
              <header className="u-card-head">
                <h2>{sel.name}</h2>
                {sel.accredited && <span className="tr-acc"><BadgeCheck size={12} />EPA accredited</span>}
              </header>
              <dl className="tr-details">
                <div><dt>Requirement</dt><dd>{sel.basis}</dd></div>
                <div><dt>Duration</dt><dd>{sel.hours} hour{sel.hours === 1 ? '' : 's'}</dd></div>
                <div><dt>Renewal</dt><dd>{sel.renewalMonths ? `Every ${sel.renewalMonths} months` : 'No expiry'}</dd></div>
                <div><dt>Certificate</dt><dd>{sel.accredited ? 'Certificate number required' : 'Completion record'}</dd></div>
                <div><dt>Required For</dt><dd>{meta.categories.filter((c) => c.required.includes(sel.id)).map((c) => c.label).join(', ') || '—'}</dd></div>
              </dl>
              <div className="tr-counts">
                <span className="good"><b>{selStats?.valid ?? '—'}</b>Current</span>
                <span className="warn"><b>{selStats?.dueSoon ?? '—'}</b>Due Soon</span>
                <span className="crit"><b>{selStats?.lapsed ?? '—'}</b>Lapsed / Missing</span>
              </div>
            </section>
            <TrainingMaterials meta={meta} materials={materials} programId={sel.id} onChanged={() => setMaterialsKey((k) => k + 1)} notify={notify} />
          </aside>
        )}
      </div>

      <HelpLearning />
    </>
  )
}

const SECTIONS = [
  { key: 'certified', label: 'Certified', cls: 'good', icon: CircleCheck, empty: 'No one is fully certified yet.' },
  { key: 'notCertified', label: 'Not Certified', cls: 'crit', icon: CircleMinus, empty: 'No missing training.' },
  { key: 'overdue', label: 'Overdue', cls: 'warn', icon: TriangleAlert, empty: 'Nothing overdue.' },
]
const SECTION = Object.fromEntries(SECTIONS.map((s) => [s.key, s]))

function SchoolStatus({ status }) {
  const s = SECTION[status]
  const Icon = s.icon
  return <span className={`p-status ${s.cls}`}><Icon size={12} />{s.label}</span>
}

function personNote(p, key) {
  if (key === 'notCertified') return `Missing: ${p.missing.join(', ')}`
  if (key === 'overdue') return p.lapsed.map((l) => `${l.programName} expired ${fmt(l.expiresOn)}`).join(' · ')
  return p.dueSoon ? `Renewal due ${fmt(p.nextExpiry)}` : p.nextExpiry ? `Valid until ${fmt(p.nextExpiry)}` : 'No expiry'
}

// School Compliance tab: each school's staff split into Certified / Not Certified / Overdue
export function SchoolComplianceTab({ refreshKey, onOpenPerson }) {
  const [schools, setSchools] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [show, setShow] = useState('')
  const [open, setOpen] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    request('/personnel/schools').then((d) => { if (!cancelled) { setSchools(d.schools); setError(null) } }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [refreshKey])

  const term = q.trim().toLowerCase()
  const matching = (schools ?? []).filter((s) => !term || s.name.toLowerCase().includes(term))
  const count = (key) => matching.filter((s) => (key === 'certified' ? s.status === 'certified' : s[key].length)).length
  const filtered = matching.filter((s) => !show || (show === 'certified' ? s.status === 'certified' : s[show].length))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  return (
    <section className="u-card">
      <div className="p-filters p-filters-sc">
        <label className="u-search"><Search size={15} />
          <input type="search" placeholder="Search schools…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} aria-label="Search schools" />
        </label>
        <div className="p-seg" role="group" aria-label="Show schools">
          <button type="button" aria-pressed={!show} className={!show ? 'on' : undefined} onClick={() => { setShow(''); setPage(1) }}>All Schools <b>{matching.length}</b></button>
          {SECTIONS.map((s) => (
            <button key={s.key} type="button" aria-pressed={show === s.key} className={show === s.key ? `on ${s.cls}` : undefined} onClick={() => { setShow(s.key); setPage(1) }}>
              {s.key === 'certified' ? 'Fully Certified' : `With ${s.label}`} <b>{count(s.key)}</b>
            </button>
          ))}
        </div>
      </div>
      {error && <div className="u-banner">Couldn't load school compliance ({error}). Restart the backend if it was just updated.</div>}
      <div className="u-table-wrap">
        <table className="u-table c-table p-sc-table">
          <thead><tr><th>School</th><th className="c-num">Staff</th><th className="c-num">Certified</th><th className="c-num">Not Certified</th><th className="c-num">Overdue</th><th>Status</th></tr></thead>
          <tbody>
            {visible.map((s) => {
              const expanded = open === s.id
              return (
                <Fragment key={s.id || 'district'}>
                  <tr className={expanded ? 'p-row-on' : undefined} onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                    <td><strong className="p-name">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{s.name}</strong></td>
                    <td className="c-num">{s.total}</td>
                    <td className="c-num">{s.certified.length}</td>
                    <td className={`c-num${s.notCertified.length ? ' p-bad' : ''}`}>{s.notCertified.length}</td>
                    <td className={`c-num${s.overdue.length ? ' p-bad' : ''}`}>{s.overdue.length}</td>
                    <td><SchoolStatus status={s.status} /></td>
                  </tr>
                  {expanded && (
                    <tr className="p-sc-detail">
                      <td colSpan={6}>
                        <div className="p-sc-sections">
                          {SECTIONS.map((sec) => (
                            <div key={sec.key} className={`p-sc-sec ${sec.cls}`}>
                              <h3><sec.icon size={14} />{sec.label} <span>{s[sec.key].length}</span></h3>
                              {s[sec.key].length ? (
                                <ul>
                                  {s[sec.key].map((p) => (
                                    <li key={p.id}>
                                      <button type="button" onClick={() => onOpenPerson(p.id)}>
                                        <strong>{p.name}</strong>
                                        <small>{p.categoryLabel}</small>
                                        <small className={sec.key === 'certified' && !p.dueSoon ? undefined : 'p-sc-note'}>{personNote(p, sec.key)}</small>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="u-muted">{sec.empty}</p>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {schools && !visible.length && <tr><td colSpan={6} className="u-empty">No schools match.</td></tr>}
            {!schools && !error && <tr><td colSpan={6} className="u-empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={current} pages={pages} total={filtered.length} from={(current - 1) * PAGE_SIZE + 1} to={Math.min(filtered.length, current * PAGE_SIZE)} onPage={setPage} label="schools" />
    </section>
  )
}
