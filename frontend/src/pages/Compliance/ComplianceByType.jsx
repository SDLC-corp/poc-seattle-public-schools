const ORDER = ['Elementary', 'K-8', 'Middle', 'High', 'Other']
const LABEL = { Elementary: 'Elementary', 'K-8': 'K-8', Middle: 'Middle', High: 'High', Other: 'Other Programs' }
const SEGMENTS = [
  { key: 'compliant', label: 'Compliant', cls: 'good' },
  { key: 'dueSoon', label: 'Due Soon', cls: 'warn' },
  { key: 'overdue', label: 'Non-Compliant', cls: 'crit' },
]

// One stacked bar per school type; clicking a row filters the school table to that type
export default function ComplianceByType({ byType, activeType, onSelectType }) {
  const rows = ORDER.filter((t) => byType?.[t]).map((t) => {
    const c = byType[t]
    const total = c.compliant + c.dueSoon + c.overdue
    return { type: t, total, counts: c, pct: total ? Math.round((c.compliant / total) * 100) : 0 }
  })

  return (
    <section className="u-card c-bytype">
      <header className="u-card-head">
        <h2>Compliance by School Type</h2>
        <span className="u-muted u-small">Click a type to filter the table</span>
      </header>
      <ul className="c-bt-legend" aria-hidden="true">
        {SEGMENTS.map((s) => <li key={s.key}><i className={`c-bt-swatch ${s.cls}`} />{s.label}</li>)}
      </ul>
      <ul className="c-bt-rows">
        {rows.map((r) => (
          <li key={r.type}>
            <button type="button" className={`c-bt-row${activeType === r.type ? ' active' : ''}`} aria-pressed={activeType === r.type}
              onClick={() => onSelectType(r.type)}
              aria-label={`${LABEL[r.type]}: ${r.counts.compliant} compliant, ${r.counts.dueSoon} due soon, ${r.counts.overdue} non-compliant of ${r.total}`}>
              <span className="c-bt-name">{LABEL[r.type]}<small>{r.total} schools</small></span>
              <span className="c-bt-bar">
                {SEGMENTS.map((s) => r.counts[s.key] > 0 && (
                  <span key={s.key} className={`c-bt-seg ${s.cls}`} style={{ flexGrow: r.counts[s.key] }}
                    title={`${s.label}: ${r.counts[s.key]}`}>
                    {r.counts[s.key]}
                  </span>
                ))}
              </span>
              <span className="c-bt-pct">{r.pct}%</span>
            </button>
          </li>
        ))}
        {!byType && <li className="u-muted u-small">Loading…</li>}
      </ul>
    </section>
  )
}
