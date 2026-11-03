import { X, FlaskConical, MapPin, Microscope, FileSpreadsheet, Copy } from 'lucide-react'
import { ResultChip, RESULT_META } from './labMeta'

function Row({ label, children }) {
  return (
    <div className="ad-row">
      <dt>{label}</dt>
      <dd>{children ?? <span className="u-muted">Not recorded</span>}</dd>
    </div>
  )
}

export default function SampleDetails({ sample, source, onClose, onSelect, onFilterSite }) {
  const { siteSummary } = sample
  return (
    <aside className="u-card a-details lr-details" aria-label="Sample details">
      <header className="u-card-head">
        <h2>Sample Details</h2>
        <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </header>

      <div className="lr-title">
        <span className="lr-title-icon"><FlaskConical size={18} /></span>
        <div>
          <strong className="a-mono">{sample.sampleNo}</strong>
          <ResultChip resultClass={sample.resultClass} label={RESULT_META[sample.resultClass].label} />
        </div>
      </div>

      <section className="ad-section">
        <h3><MapPin size={16} />Sample Information</h3>
        <dl>
          <Row label="Site">{sample.site}</Row>
          <Row label="Room">{sample.room}</Row>
          <Row label="Homog. Area">{sample.homogeneousArea}</Row>
          <Row label="Description">{sample.description}</Row>
          <Row label="Sample Type">Bulk Sample</Row>
        </dl>
      </section>

      <section className="ad-section">
        <h3><Microscope size={16} />Laboratory Result</h3>
        <dl>
          <Row label="Classification"><ResultChip resultClass={sample.resultClass} label={RESULT_META[sample.resultClass].label} /></Row>
          {sample.components.length > 0 && (
            <Row label="Asbestos">
              <ul className="lr-components">
                {sample.components.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </Row>
          )}
          <Row label="As Reported"><q className="lr-raw">{sample.result}</q></Row>
        </dl>
      </section>

      {sample.sameNumber.length > 0 && (
        <section className="ad-section">
          <h3><Copy size={16} />Same Sample No. ({sample.sameNumber.length})</h3>
          <ul className="lr-same">
            {sample.sameNumber.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onSelect(s.id)}>
                  <span>{s.site} · {s.description || '—'}</span>
                  <ResultChip resultClass={s.resultClass} label={s.resultLabel} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ad-section">
        <h3><FileSpreadsheet size={16} />Source</h3>
        <dl>
          <Row label="File">{source?.file}</Row>
          <Row label="Worksheet">{source?.worksheet}</Row>
          <Row label="Row">{Number(sample.id).toLocaleString('en-US')}</Row>
        </dl>
        <p className="lr-site-note">
          {siteSummary.detected.toLocaleString('en-US')} of {siteSummary.total.toLocaleString('en-US')} samples at {sample.site} had asbestos detected.{' '}
          <button type="button" className="lr-link" onClick={() => onFilterSite(sample.site)}>Show all {sample.site} samples</button>
        </p>
      </section>
    </aside>
  )
}
