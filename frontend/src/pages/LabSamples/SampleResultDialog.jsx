import { useEffect, useRef, useState } from 'react'
import { X, FlaskConical, Paperclip, FileText, Trash2 } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, uploadFile, API_BASE } from '../../lib/api'
import '../Inspections/inspections.css'

const MAX_BYTES = 10 * 1024 * 1024
// Analysis methods and standards to choose from; "Other…" takes any other value
export const METHODS = ['Polarized Light Microscopy (PLM)', 'PLM Point Count (400 points)', 'Transmission Electron Microscopy (TEM)', 'Phase Contrast Microscopy (PCM)', 'X-Ray Diffraction (XRD)']
export const STANDARDS = ['EPA 600/R-93/116', 'EPA/600/M4-82/020', 'NIOSH 7400', 'NIOSH 7402', 'AHERA TEM (40 CFR 763 App. A)', 'ASTM D5755', 'ASTM D6480', 'ISO 22262-1']
export const LAB_DETAILS = ['laboratory', 'labSampleId', 'analysisMethod', 'analysisStandard', 'analysisDate', 'materialLayer', 'labReportNo']
const today = () => new Date().toISOString().slice(0, 10)
const OTHER = '__other'

// A dropdown of the common values; "Other…" (or a saved value not in the list) shows a text box for it
export function PickOrType({ label, value, choices, placeholder, onChange }) {
  const [typing, setTyping] = useState(() => Boolean(value) && !choices.includes(value))
  return (
    <div className="uf-field">
      <span>{label}</span>
      <SearchSelect variant="field" label={label} value={typing ? OTHER : value} searchable={false}
        onChange={(v) => { if (v === OTHER) { setTyping(true); onChange('') } else { setTyping(false); onChange(v) } }}
        options={[{ value: '', label: 'Select…' }, ...choices.map((x) => ({ value: x, label: x })), { value: OTHER, label: 'Other…' }]} />
      {typing && <input className="u-input lr-res-other" value={value} maxLength={120} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoFocus />}
    </div>
  )
}

/**
 * A right-side panel to enter or update one inspection sample's lab result where it's listed (Lab & Sampling Results or Air
 * Monitoring) — the same rules as the inspection's Lab Results dialog: the measurement against the sample type's
 * limit gives Pass / Fail, asbestos type when found, "not analysed", notes and lab reports. Saved on the
 * inspection, so its Laboratory Analysis stage and review follow as usual.
 */
export default function SampleResultDialog({ inspectionId, materialId, onClose, onSaved }) {
  const [record, setRecord] = useState(null)
  const [meta, setMeta] = useState(null)
  const [row, setRow] = useState(null) // { notAnalyzed, value, asbestosTypes, notes, files, removeReports }
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState('')
  const fileInput = useRef(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([request(`/inspection-records/records/${inspectionId}`), request('/inspection-records/meta')])
      .then(([d, m]) => {
        if (cancelled) return
        const r = d.record
        const a = [r, ...(r.extra ?? [])].find((x) => x.materialId === materialId)
        setRecord(r)
        setMeta(m)
        if (a) {
          setRow({
            notAnalyzed: a.sampling.result === 'Not Analyzed', value: a.sampling.airValue ?? a.sampling.measuredValue ?? '',
            asbestosTypes: a.sampling.asbestosTypes ?? [], notes: a.sampling.resultNotes ?? '', files: [], removeReports: [],
            ...Object.fromEntries(LAB_DETAILS.map((k) => [k, a.sampling[k] ?? ''])),
          })
        }
      })
      .catch((e) => { if (!cancelled) setErrors({ form: e.message }) })
    return () => { cancelled = true }
  }, [inspectionId, materialId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const acm = record && [record, ...(record.extra ?? [])].find((x) => x.materialId === materialId)
  const s = acm?.sampling
  const isAir = s?.sampleType === 'Air Sample'
  const m = !s ? null : isAir
    ? (() => { const l = meta?.air?.limits[`${s.airType}|${/TEM/.test(s.testMethod ?? '') ? 'TEM' : 'PCM'}`]; return { label: 'Fibre Count', unit: l?.unit ?? 'f/cc', limit: l?.value, basis: l?.basis } })()
    : meta?.sampleTypes?.find((t) => t.value === (s.sampleType || 'Bulk Material Sample'))?.measure ?? { label: 'Result', unit: '' }
  const withUnit = (v, unit) => `${v}${unit === '%' ? '' : ' '}${unit}`
  const set = (k) => (v) => setRow((r) => ({ ...r, [k]: v }))
  const reports = (record?.attachments ?? []).filter((f) => f.category === 'Laboratory Report' && (f.materialId ?? record.materialId) === materialId)
  const kept = row ? reports.filter((f) => !row.removeReports.includes(f.id)) : []

  const verdict = () => {
    if (row.notAnalyzed) return { text: 'Not analysed', tone: '' }
    if (row.value === '' || row.value == null) return { text: 'Pending', tone: '' }
    const fail = m.limit != null && Number(row.value) > m.limit
    const finding = isAir ? (fail ? 'Exceeds limit' : 'Below limit') : Number(row.value) > 0 ? 'Asbestos detected' : 'No asbestos detected'
    return { text: `${fail ? 'Fail' : 'Pass'} · ${finding}`, tone: fail ? 'bad' : 'good' }
  }

  const addFiles = (list) => {
    const picked = [...list]
    const tooBig = picked.filter((f) => f.size > MAX_BYTES)
    setErrors((e) => ({ ...e, files: tooBig.length ? `${tooBig.map((f) => f.name).join(', ')} is larger than 10 MB` : undefined }))
    setRow((r) => ({ ...r, files: [...r.files, ...picked.filter((f) => f.size <= MAX_BYTES)].slice(0, 5) }))
  }

  const save = async () => {
    setErrors({})
    const failed = []
    try {
      for (const fid of row.removeReports) {
        setSaving('Removing report…')
        await request(`/inspection-records/records/${inspectionId}/attachments/${fid}`, { method: 'DELETE' })
      }
      for (const f of row.files) {
        setSaving(`Uploading report ${f.name}…`)
        try {
          await uploadFile(`/inspection-records/records/${inspectionId}/stage-documents`, f, { category: 'Laboratory Report', stage: 'lab', material: materialId })
        } catch (e) {
          failed.push(`${f.name} (${e.message})`)
        }
      }
      setSaving('Saving result…')
      const details = Object.fromEntries(LAB_DETAILS.map((k) => [k, row[k]]))
      const result = row.notAnalyzed
        ? { materialId, result: 'Not Analyzed', notes: row.notes, ...details }
        : { materialId, value: row.value, asbestosTypes: row.asbestosTypes, notes: row.notes, ...details }
      await request(`/inspection-records/records/${inspectionId}/lab-results`, { method: 'POST', body: { results: [result] } })
      const recorded = s.result && s.result !== 'Pending'
      onSaved(`${recorded ? 'Lab result updated' : 'Lab result saved'} on inspection ${inspectionId}.${failed.length ? ` Not uploaded: ${failed.join(', ')}.` : ''}`, failed.length > 0)
    } catch (e) {
      // The endpoint keys errors by the result's position; this dialog sends one
      const f = e.fields ?? {}
      setErrors(Object.keys(f).length
        ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k.replace(/^results\.0\.?/, '') || 'form', v]))
        : { form: e.message })
    } finally {
      setSaving('')
    }
  }

  const v = row && m ? verdict() : null

  return (
    <div className="lr-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="lr-drawer" role="dialog" aria-modal="true" aria-labelledby="lr-res-title">
        <header className="u-modal-head lr-drawer-head">
          <h2 id="lr-res-title"><FlaskConical size={18} />{s?.result && s.result !== 'Pending' ? 'Update' : 'Enter'} Lab Result{s?.sampleId ? ` – ${s.sampleId}` : ''}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} disabled={!!saving} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body lr-drawer-body">
          <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          {!record && !errors.form && <p className="u-muted">Loading…</p>}
          {record && !acm && <p className="uf-error">This sample is no longer on inspection {inspectionId}.</p>}
          {row && m && (
            <>
              <p className="ai-add-intro">
                Enter what the lab measured – Pass / Fail is worked out against the limit – and attach the lab report. The result is saved on
                inspection <strong>{inspectionId}</strong> and can be corrected until its Laboratory Analysis review approves it.
              </p>
              <div className="in-labres">
                <div className="in-labres-row lr-res-row">
                  <div className="in-labres-head">
                    <strong>{s.sampleId || 'Sample'} <span className="in-labres-type">{s.sampleType || 'Bulk Material Sample'}{isAir && s.airType ? ` · ${s.airType}` : ''}</span></strong>
                    <small className="u-muted">{[s.laboratory, s.testMethod].filter(Boolean).join(' · ')}</small>
                  </div>
                  <h3 className="lr-res-h">Laboratory Details</h3>
                  <div className="lr-res-grid">
                    <label className="uf-field"><span>Laboratory Name</span>
                      <input className="u-input" value={row.laboratory} maxLength={120} placeholder="e.g. ABC Environmental Testing Laboratory" onChange={(e) => set('laboratory')(e.target.value)} />
                    </label>
                    <label className="uf-field"><span>Laboratory Sample ID</span>
                      <input className="u-input" value={row.labSampleId} maxLength={120} placeholder="e.g. LAB-2026-13382" onChange={(e) => set('labSampleId')(e.target.value)} />
                    </label>
                    <label className="uf-field"><span>Lab Report No.</span>
                      <input className="u-input" value={row.labReportNo} maxLength={120} placeholder="e.g. LAB-RPT-2026-13382" onChange={(e) => set('labReportNo')(e.target.value)} />
                    </label>
                    <PickOrType label="Analysis Method" value={row.analysisMethod} choices={METHODS} placeholder="Enter the method" onChange={set('analysisMethod')} />
                    <PickOrType label="Analysis Standard" value={row.analysisStandard} choices={STANDARDS} placeholder="Enter the standard" onChange={set('analysisStandard')} />
                    <label className="uf-field"><span>Analysis Date</span>
                      <input type="date" className={`u-input${errors.analysisDate ? ' invalid' : ''}`} max={today()} value={row.analysisDate} onChange={(e) => set('analysisDate')(e.target.value)} />
                      {errors.analysisDate && <em className="uf-error">{errors.analysisDate}</em>}
                    </label>
                    {!isAir && (
                      <label className="uf-field"><span>Material Layer</span>
                        <input className="u-input" value={row.materialLayer} maxLength={120} placeholder="e.g. Floor Tile" onChange={(e) => set('materialLayer')(e.target.value)} />
                      </label>
                    )}
                  </div>


                  <h3 className="lr-res-h">Result</h3>
                  <div className="in-labres-fields">
                    <label className="uf-field">
                      <span>{m.unit === '%' ? 'Asbestos Percentage' : m.label} ({m.unit})</span>
                      <input type="number" min={0} max={m.max} step="any" className={`u-input${errors.value ? ' invalid' : ''}`} value={row.value} placeholder="Empty = pending"
                        disabled={row.notAnalyzed} onChange={(e) => set('value')(e.target.value)} autoFocus />
                      {errors.value && <em className="uf-error">{errors.value}</em>}
                    </label>
                    <div className="uf-field">
                      <span>{isAir ? 'Test Result' : 'Asbestos Detected · Result'}</span>
                      <span className={`in-labres-verdict ${v.tone}`}>{v.text}</span>
                      {m.limit != null && <small className="u-muted" title={m.basis}>Pass at or below {withUnit(m.limit, m.unit)}</small>}
                    </div>
                    <label className="in-labres-na">
                      <input type="checkbox" checked={row.notAnalyzed} onChange={(e) => set('notAnalyzed')(e.target.checked)} />Not analysed by the lab
                    </label>
                    {!isAir && !row.notAnalyzed && Number(row.value) > 0 && (
                      <div className="uf-field in-labres-wide">
                        <span>Asbestos Type Found *</span>
                        <div className="in-labres-types" role="group" aria-label="Asbestos type">
                          {(meta?.asbestosTypes ?? []).map((t) => (
                            <button key={t} type="button" className={`in-labres-type-chip${row.asbestosTypes.includes(t) ? ' on' : ''}`} aria-pressed={row.asbestosTypes.includes(t)}
                              onClick={() => set('asbestosTypes')(row.asbestosTypes.includes(t) ? row.asbestosTypes.filter((x) => x !== t) : [...row.asbestosTypes, t])}>{t}</button>
                          ))}
                        </div>
                        {errors.asbestosTypes && <em className="uf-error">{errors.asbestosTypes}</em>}
                      </div>
                    )}
                    <label className="uf-field in-labres-wide">
                      <span>Result Notes</span>
                      <input className="u-input" value={row.notes} maxLength={1000} placeholder={isAir ? 'e.g. 12 fibres counted in 100 fields' : 'e.g. Layer 2 (mastic) only'} onChange={(e) => set('notes')(e.target.value)} />
                    </label>
                  </div>
                  <div className="in-labres-reports">
                    <span className="in-labres-cap">Lab Report Files</span>
                    {kept.map((f) => (
                      <span key={f.id} className="in-cl-file">
                        <a href={`${API_BASE}/inspection-records/records/${inspectionId}/attachments/${f.id}`} target="_blank" rel="noreferrer"><FileText size={12} />{f.name}</a>
                        <button type="button" onClick={() => set('removeReports')([...row.removeReports, f.id])} aria-label={`Remove ${f.name}`}><Trash2 size={11} /></button>
                      </span>
                    ))}
                    {row.removeReports.length > 0 && <button type="button" className="in-labres-undo" onClick={() => set('removeReports')([])}>Undo removal of {row.removeReports.length}</button>}
                    <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileInput.current?.click()} disabled={row.files.length >= 5}>
                      <Paperclip size={13} />{kept.length ? 'Upload More' : 'Upload Files'}
                    </button>
                  </div>
                  {row.files.length > 0 && (
                    <div className="in-cl-files">
                      {row.files.map((f, j) => (
                        <span key={`${f.name}-${j}`} className="in-cl-file">
                          <FileText size={12} /><span>{f.name}</span>
                          <button type="button" onClick={() => set('files')(row.files.filter((_, q) => q !== j))} aria-label={`Remove ${f.name}`}><Trash2 size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {errors.files && <em className="uf-error">{errors.files}</em>}
                </div>
              </div>
            </>
          )}
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot lr-drawer-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose} disabled={!!saving}>Cancel</button>
          <button type="button" className="u-btn u-btn-primary" onClick={save} disabled={!row || !!saving}>{saving || 'Save Result'}</button>
        </footer>
      </div>
    </div>
  )
}
