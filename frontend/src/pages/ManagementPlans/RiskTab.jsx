import { useEffect, useMemo, useState } from 'react'
import {
  Layers, TriangleAlert, CircleAlert, CircleCheck, CalendarDays, ListChecks, Grid3x3, SlidersHorizontal, History, Info,
  Search, Download, Plus, Eye, Pencil, X, FilterX,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { fmtDay } from '../Surveillance/survMeta'
import { request } from '../../lib/api'
import { Tile, RowMenu } from './RegisterTab'

const SCALE = ['', 'Very Low', 'Low', 'Medium', 'High']
const LEVEL_TONE = { High: 'critical', Medium: 'warning', Low: 'good', 'Very Low': 'good' }
const SCALE_TONE = ['', 'good', 'good', 'warning', 'critical']
const levelFor = (score) => (score >= 12 ? 'High' : score >= 6 ? 'Medium' : score >= 2 ? 'Low' : 'Very Low')
const LEVELS = [
  { range: '12 – 16', level: 'High', guidance: 'Urgent action – remediate, remove or contain as soon as possible.' },
  { range: '6 – 11', level: 'Medium', guidance: 'Manage and monitor – implement control measures and review regularly.' },
  { range: '2 – 5', level: 'Low', guidance: 'Keep under review – maintain in good condition and monitor.' },
  { range: '1', level: 'Very Low', guidance: 'Minimal risk – routine management and re-inspect at next review.' },
]
const MATERIAL_CRITERIA = [
  'Non-friable material in good condition; fibres firmly bound.',
  'Friable in good condition, or non-friable with minor damage.',
  'Friable with damage, or non-friable significantly damaged.',
  'Friable and significantly damaged or deteriorating; fibre release likely.',
]
const PRIORITY_CRITERIA = [
  'Rarely accessed space (closed storage, sealed voids); disturbance unlikely.',
  'Occasional use or maintenance access (offices, staff rooms, plant rooms).',
  'Regular occupancy or routine maintenance in the area (classrooms, labs).',
  'Heavy use or activity likely to disturb the material (corridors, gyms, works planned).',
]
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const scoreBadge = (n) => <Badge tone={SCALE_TONE[n]}>{SCALE[n]} ({n})</Badge>

function Matrix({ records, large = false, onPick, picked }) {
  const counts = new Map()
  for (const r of records) counts.set(`${r.materialRisk}-${r.priorityRisk}`, (counts.get(`${r.materialRisk}-${r.priorityRisk}`) ?? 0) + 1)
  return (
    <div className={`rk-matrix${large ? ' large' : ''}`}>
      <span className="rk-axis-y">Material Risk (Fibre Release)</span>
      <div className="rk-grid" role="grid" aria-label="Risk matrix: material risk by priority risk">
        {[4, 3, 2, 1].map((m) => (
          <div key={m} className="rk-row" role="row">
            <span className="rk-label-y">{SCALE[m]} ({m})</span>
            {[1, 2, 3, 4].map((p) => {
              const score = m * p
              const n = counts.get(`${m}-${p}`) ?? 0
              const key = `${m}-${p}`
              return (
                <button key={p} type="button" role="gridcell" className={`rk-cell s${score}${picked === key ? ' on' : ''}`}
                  onClick={onPick ? () => onPick(picked === key ? null : key) : undefined} disabled={!onPick}
                  title={`${SCALE[m]} material × ${SCALE[p]} priority = ${score} (${levelFor(score)}) · ${n} ACM${n === 1 ? '' : 's'}`}>
                  <strong>{score}</strong>
                  {n > 0 && <small>{n} ACM{n === 1 ? '' : 's'}</small>}
                </button>
              )
            })}
          </div>
        ))}
        <div className="rk-row rk-labels-x" aria-hidden="true"><span className="rk-label-y" />{[1, 2, 3, 4].map((p) => <span key={p}>{SCALE[p]}<br />({p})</span>)}</div>
      </div>
      <span className="rk-axis-x">Priority Risk (Exposure)</span>
    </div>
  )
}

function AssessDialog({ records, initial, onClose, onSaved, schoolId }) {
  const [id, setId] = useState(initial?.id ?? '')
  const rec = records.find((r) => r.id === id)
  const [mr, setMr] = useState(initial?.materialRisk ?? 0)
  const [pr, setPr] = useState(initial?.priorityRisk ?? 0)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const pick = (value) => {
    setId(value)
    const r = records.find((x) => x.id === value)
    if (r) { setMr(r.materialRisk); setPr(r.priorityRisk); setNotes(r.notes ?? '') }
  }
  const score = mr * pr
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const saved = await request(`/management-plans/${schoolId}/risk-assessment/${encodeURIComponent(id)}`, { method: 'PUT', body: { materialRisk: mr, priorityRisk: pr, notes } })
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const scalePicker = (label, value, set, criteria) => (
    <fieldset className="rk-scale">
      <legend>{label}</legend>
      {[1, 2, 3, 4].map((n) => (
        <label key={n} className={value === n ? 'on' : undefined}>
          <input type="radio" name={label} checked={value === n} onChange={() => set(n)} />
          <span className={`rk-scale-n s${n}`}>{n}</span>
          <span><strong>{SCALE[n]}</strong><small>{criteria[n - 1]}</small></span>
        </label>
      ))}
    </fieldset>
  )
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal rk-dialog" role="dialog" aria-modal="true" aria-labelledby="rk-dialog-title">
        <header className="u-modal-head">
          <h2 id="rk-dialog-title">{initial ? `Reassess ${initial.ref}` : 'Add Risk Assessment'}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rk-dialog-body">
          {!initial && (
            <div className="a-field"><span>ACM record</span>
              <SearchSelect variant="field" label="ACM record" value={id} onChange={pick} searchPlaceholder="Search ACMs…"
                options={[{ value: '', label: 'Select an ACM' }, ...records.map((r) => ({ value: r.id, label: `${r.ref} – ${r.building} / ${r.room} – ${r.description}` }))]} />
            </div>
          )}
          {rec && <p className="rk-dialog-acm"><strong>{rec.description}</strong> · {rec.materialType} · {rec.friability} · {rec.condition} · {rec.building} / {rec.room}{rec.roomType && ` (${rec.roomType})`}</p>}
          <div className="rk-dialog-grid">
            {scalePicker('Material Risk (likelihood of fibre release)', mr, setMr, MATERIAL_CRITERIA)}
            {scalePicker('Priority Risk (likelihood of exposure)', pr, setPr, PRIORITY_CRITERIA)}
          </div>
          <div className="rk-result">
            <span>Risk score</span><strong>{score || '—'}</strong>
            {score > 0 && <Badge tone={LEVEL_TONE[levelFor(score)]}>{levelFor(score)}</Badge>}
            {score > 0 && <small>{LEVELS.find((l) => l.level === levelFor(score)).guidance}</small>}
          </div>
          <label className="a-field"><span>Notes</span>
            <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations, access, activities that could disturb the material…" />
          </label>
          {error && <p className="u-banner">{error}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" disabled={!rec || !mr || !pr || busy} onClick={save}>{busy ? 'Saving…' : 'Save Assessment'}</button>
        </footer>
      </div>
    </div>
  )
}

function ViewDialog({ record: r, onClose, onEdit }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const entries = [
    { date: r.date, by: r.assessedBy, materialRisk: r.materialRisk, priorityRisk: r.priorityRisk, score: r.score, level: r.level, notes: r.notes, baseline: r.baseline },
    ...r.history.map((h) => ({ ...h, by: h.assessedBy })),
  ]
  return (
    <div className="u-modal-backdrop cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="u-modal rk-dialog" role="dialog" aria-modal="true" aria-labelledby="rk-view-title">
        <header className="u-modal-head">
          <h2 id="rk-view-title">{r.ref} – {r.description}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body rk-dialog-body">
          <p className="rk-dialog-acm">{r.materialType} · {r.friability} · {r.condition} · {r.building} / {r.room}{r.roomType && ` (${r.roomType})`}</p>
          <ol className="rk-history">
            {entries.map((h, i) => (
              <li key={i}>
                <div><strong>{fmtDay(h.date)}</strong>{i === 0 && <Badge tone="neutral">Current</Badge>}<span className="u-muted">{h.baseline ? 'Baseline from AHERA inspection' : `by ${h.by}`}</span></div>
                <div>{scoreBadge(h.materialRisk)} × {scoreBadge(h.priorityRisk)} = <strong>{h.score}</strong> <Badge tone={LEVEL_TONE[h.level]}>{h.level}</Badge></div>
                {h.notes && <p>{h.notes}</p>}
              </li>
            ))}
          </ol>
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Close</button>
          <button type="button" className="u-btn u-btn-primary" onClick={onEdit}><Pencil size={14} />Reassess</button>
        </footer>
      </div>
    </div>
  )
}

const VIEWS = [
  { id: 'overview', label: 'Risk Assessment', icon: ListChecks },
  { id: 'matrix', label: 'Assessment Matrix', icon: Grid3x3 },
  { id: 'criteria', label: 'Risk Criteria', icon: SlidersHorizontal },
  { id: 'history', label: 'Assessment History', icon: History },
]

// Management plan › Risk Assessment: material risk × priority risk for every ACM at the school
export default function RiskTab({ schoolId, nextReview }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('overview')
  const [q, setQ] = useState('')
  const [cell, setCell] = useState(null)
  const [dialog, setDialog] = useState(null) // { mode: 'add' | 'edit' | 'view', record }
  const [today] = useState(() => new Date().toLocaleDateString('en-CA')) // YYYY-MM-DD, for overdue reviews

  const load = () => request(`/management-plans/${schoolId}/risk-assessment`).then(setData).catch((e) => setError(e.message))
  useEffect(() => {
    request(`/management-plans/${schoolId}/risk-assessment`).then(setData).catch((e) => setError(e.message))
  }, [schoolId])

  const records = data?.records
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (records ?? []).filter((r) => (!cell || `${r.materialRisk}-${r.priorityRisk}` === cell)
      && (!term || [r.id, r.ref, r.building, r.room, r.description, r.materialType, r.level].some((v) => String(v ?? '').toLowerCase().includes(term))))
  }, [records, q, cell])
  const history = useMemo(() => (records ?? []).flatMap((r) => {
    if (r.baseline) return []
    return [{ ...r, current: true }, ...r.history.map((h) => ({ ...r, ...h, current: false }))]
  }).sort((a, b) => String(b.at ?? b.date).localeCompare(String(a.at ?? a.date))), [records])

  if (error) return <div className="u-banner">Couldn't load the risk assessment ({error}).</div>
  if (!data) return <div className="mp-loading">Loading risk assessment…</div>
  const s = data.stats

  const exportCsv = () => {
    const head = ['ACM ID', 'Building', 'Room', 'ACM', 'Material Type', 'Material Risk', 'Priority Risk', 'Risk Score', 'Risk Level', 'Assessment Date', 'Assessed By', 'Next Review']
    const lines = rows.map((r) => [r.id, r.building, r.room, r.description, r.materialType, `${SCALE[r.materialRisk]} (${r.materialRisk})`, `${SCALE[r.priorityRisk]} (${r.priorityRisk})`, r.score, r.level, r.date, r.baseline ? 'AHERA inspection (baseline)' : r.assessedBy, r.nextReview].map(csvCell).join(','))
    const blob = new Blob([[head.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `risk-assessment-${schoolId}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const onSaved = () => {
    setDialog(null)
    load() // stats, matrix and history all change
  }

  return (
    <div className="rk">
      <div className="rk-tiles">
        <Tile icon={Layers} value={s.total} label="ACM Records Assessed" tone="purple" />
        <Tile icon={TriangleAlert} value={s.high} label="High Risk" tone="red" />
        <Tile icon={CircleAlert} value={s.medium} label="Medium Risk" tone="amber" />
        <Tile icon={CircleCheck} value={s.low + s.veryLow} label="Low Risk" tone="green" />
        <div className="mp-tile sky rk-next"><span className="mp-tile-icon"><CalendarDays size={24} strokeWidth={1.8} /></span>
          <span className="mp-tile-text"><span>Next Review</span><strong>{fmtDay(nextReview)}</strong></span></div>
      </div>

      <div className="rk-layout">
        <nav className="rk-nav" aria-label="Risk assessment sections">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={view === v.id ? 'on' : undefined} aria-current={view === v.id ? 'page' : undefined} onClick={() => setView(v.id)}>
              <v.icon size={17} />{v.label}
            </button>
          ))}
        </nav>

        <div className="rk-main">
          {view === 'overview' && (
            <>
              <section className="mp-card rk-method">
                <h2><Info size={18} />Risk Assessment Overview</h2>
                <div className="rk-method-row">
                  <span className="rk-method-chip"><strong>Assessment Method:</strong> Material Risk (likelihood of fibre release) <b>×</b> Priority Risk (likelihood of exposure)</span>
                  <span className="rk-method-meta">Last Assessed: <strong>{fmtDay(data.lastAssessed)}</strong><i>|</i>{s.saved} of {s.total} reassessed in this plan; others from the AHERA inspection</span>
                </div>
              </section>
              <div className="rk-cards">
                <section className="mp-card"><h3>Risk Matrix <span>(Material Risk × Priority Risk)</span></h3><Matrix records={records} /></section>
                <section className="mp-card">
                  <h3>Risk Level Definition</h3>
                  <table className="mp-table rk-defs">
                    <thead><tr><th>Risk Score</th><th>Risk Level</th><th>Action Guidance</th></tr></thead>
                    <tbody>{LEVELS.map((l) => <tr key={l.level}><td className="u-nowrap">{l.range}</td><td><Badge tone={LEVEL_TONE[l.level]}>{l.level}</Badge></td><td>{l.guidance}</td></tr>)}</tbody>
                  </table>
                </section>
              </div>
            </>
          )}

          {view === 'matrix' && (
            <section className="mp-card">
              <h3>Assessment Matrix</h3>
              <p className="u-muted rk-sub">Each cell shows the risk score and how many ACMs sit there. Select a cell to list those ACMs below.</p>
              <Matrix records={records} large onPick={setCell} picked={cell} />
            </section>
          )}

          {view === 'criteria' && (
            <div className="rk-criteria">
              {[['Material Risk', 'Likelihood of fibre release, from the material’s friability and condition.', MATERIAL_CRITERIA],
                ['Priority Risk', 'Likelihood that people will be exposed, from how the area is used and maintained.', PRIORITY_CRITERIA]].map(([title, sub, list]) => (
                <section key={title} className="mp-card">
                  <h3>{title}</h3>
                  <p className="u-muted rk-sub">{sub}</p>
                  <table className="mp-table rk-defs">
                    <thead><tr><th>Score</th><th>Rating</th><th>Description</th></tr></thead>
                    <tbody>{[1, 2, 3, 4].map((n) => <tr key={n}><td className="num">{n}</td><td>{scoreBadge(n)}</td><td>{list[n - 1]}</td></tr>)}</tbody>
                  </table>
                </section>
              ))}
              <section className="mp-card rk-criteria-wide">
                <h3>Risk Level</h3>
                <p className="u-muted rk-sub">Risk score = Material Risk × Priority Risk (1–16).</p>
                <table className="mp-table rk-defs">
                  <thead><tr><th>Risk Score</th><th>Risk Level</th><th>Action Guidance</th></tr></thead>
                  <tbody>{LEVELS.map((l) => <tr key={l.level}><td className="u-nowrap">{l.range}</td><td><Badge tone={LEVEL_TONE[l.level]}>{l.level}</Badge></td><td>{l.guidance}</td></tr>)}</tbody>
                </table>
              </section>
            </div>
          )}

          {view === 'history' && (
            <section className="mp-card">
              <h3>Assessment History</h3>
              {history.length ? (
                <table className="mp-table">
                  <thead><tr><th>Date</th><th>ACM</th><th>Location</th><th>Material Risk</th><th>Priority Risk</th><th className="num">Score</th><th>Level</th><th>Assessed By</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={`${h.id}-${i}`}>
                        <td className="u-nowrap">{fmtDay(h.date)}{h.current && <Badge tone="neutral">Current</Badge>}</td>
                        <td><span className="mp-reg-ref">{h.ref}</span> {h.description}</td>
                        <td>{h.building} / {h.room}</td>
                        <td>{scoreBadge(h.materialRisk)}</td><td>{scoreBadge(h.priorityRisk)}</td>
                        <td className="num">{h.materialRisk * h.priorityRisk}</td>
                        <td><Badge tone={LEVEL_TONE[levelFor(h.materialRisk * h.priorityRisk)]}>{levelFor(h.materialRisk * h.priorityRisk)}</Badge></td>
                        <td>{h.assessedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="u-muted rk-sub">No assessments have been recorded in this plan yet. Current scores are baselines from the AHERA inspection; use Add Assessment or the edit button on an ACM to record one.</p>}
            </section>
          )}
        </div>
      </div>

      <section className="mp-card rk-table-card">
        <header className="rk-table-head">
          <h2>ACM Risk Assessment</h2>
          {cell && <button type="button" className="u-btn u-btn-outline rk-cell-chip" onClick={() => setCell(null)}><FilterX size={14} />Score {Number(cell[0]) * Number(cell[2])} cell ({SCALE[cell[0]]} × {SCALE[cell[2]]})</button>}
          <label className="u-search rk-search"><Search size={15} />
            <input type="search" placeholder="Search by ACM, building, room…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ACM risk assessments" />
          </label>
          <button type="button" className="u-btn u-btn-primary" onClick={() => setDialog({ mode: 'add' })}><Plus size={15} />Add Assessment</button>
          <button type="button" className="u-btn u-btn-outline" onClick={exportCsv} disabled={!rows.length}><Download size={15} />Export</button>
        </header>
        <div className="mp-reg-scroll">
          <table className="mp-table rk-table">
            <thead>
              <tr>
                <th>ACM ID</th><th>Location (Building / Room)</th><th>Material Type</th><th>Material Risk</th><th>Priority Risk</th>
                <th className="num">Risk Score</th><th>Risk Level</th><th>Assessment Date</th><th>Assessed By</th><th>Next Review</th><th className="mp-reg-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={11} className="u-muted">No ACMs match.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className="mp-reg-ref" title={r.id}>{r.ref}</span></td>
                  <td>{r.building} / {r.room}<small>{r.description}</small></td>
                  <td>{r.materialType}</td>
                  <td>{scoreBadge(r.materialRisk)}</td>
                  <td>{scoreBadge(r.priorityRisk)}</td>
                  <td className="num"><strong>{r.score}</strong></td>
                  <td><Badge tone={LEVEL_TONE[r.level]}>{r.level}</Badge></td>
                  <td className="u-nowrap">{fmtDay(r.date)}</td>
                  <td>{r.baseline ? <span className="u-muted" title="Baseline worked out from the AHERA inspection record">AHERA inspection</span> : r.assessedBy}</td>
                  <td className={`u-nowrap${r.nextReview && r.nextReview < today ? ' mp-late' : ''}`} title={r.nextReview && r.nextReview < today ? 'Review overdue' : undefined}>{fmtDay(r.nextReview)}</td>
                  <td className="mp-reg-actions">
                    <button type="button" className="u-row-btn" title="View assessment" aria-label={`View assessment for ${r.ref}`} onClick={() => setDialog({ mode: 'view', record: r })}><Eye size={16} /></button>
                    <button type="button" className="u-row-btn" title="Reassess" aria-label={`Reassess ${r.ref}`} onClick={() => setDialog({ mode: 'edit', record: r })}><Pencil size={15} /></button>
                    <RowMenu record={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mp-reg-count">Showing {rows.length} of {records.length} ACMs</p>
      </section>

      {(dialog?.mode === 'add' || dialog?.mode === 'edit') && (
        <AssessDialog schoolId={schoolId} records={records} initial={dialog.mode === 'edit' ? dialog.record : null} onClose={() => setDialog(null)} onSaved={onSaved} />
      )}
      {dialog?.mode === 'view' && (
        <ViewDialog record={dialog.record} onClose={() => setDialog(null)} onEdit={() => setDialog({ mode: 'edit', record: dialog.record })} />
      )}
    </div>
  )
}
