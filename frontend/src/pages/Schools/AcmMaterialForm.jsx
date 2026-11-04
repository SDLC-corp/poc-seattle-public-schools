import { useRef, useState } from 'react'
import { Plus, Trash2, Paperclip, FileText, Image as ImageIcon, Eye, Download, Save, X, TriangleAlert } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import { request, uploadFile, fmtDate, API_BASE } from '../../lib/api'

const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
const LOCATIONS = ['Ceiling (entire room)', 'Floor (entire room)', 'Walls', 'Above ceiling – pipe runs', 'HVAC duct in ceiling plenum', 'Exterior windows', 'Mechanical room wall', 'Corridor door']
const SCOPE_LABEL = { room: ['Room-level', 'This room only'], floor: ['Floor-level', 'Common areas / multiple rooms'], building: ['Building-level', 'Entire building'] }
const STATUS_CLASSIFICATION = { 'ACM Present': 'Confirmed', 'No ACM': 'Negative', 'Assumed ACM': 'Assumed' }

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// AHERA-style hazard ranking suggestion from friability and condition
function suggestRisk(friability, condition) {
  if (condition === 'Significantly Damaged' || (friability === 'Friable' && condition === 'Damaged')) return 'High'
  if (condition === 'Damaged' || friability === 'Friable') return 'Medium'
  return 'Low'
}

const blank = () => ({
  key: Math.random().toString(36).slice(2),
  values: {
    name: '', materialType: '', location: '', quantity: '', unit: 'Sq ft', friability: 'Non-Friable', classification: 'Confirmed',
    condition: 'Good', riskRanking: 'Low', assessmentDate: todayIso(), notes: '', acmStatus: 'ACM Present', scope: 'room', relatedTracking: [],
  },
  riskTouched: false,
  pending: [], // { key, file, type, description }
  errors: {},
})

const fromMaterial = (m) => ({
  ...blank(),
  values: {
    name: m.name, materialType: m.materialType, location: m.location, quantity: String(m.quantity), unit: m.unit, friability: m.friability,
    classification: m.classification, condition: m.condition, riskRanking: m.riskRanking, assessmentDate: m.assessmentDate,
    notes: m.notes ?? '', acmStatus: m.acmStatus, scope: m.scope, relatedTracking: m.relatedTracking ?? [],
  },
  riskTouched: true,
})

function Radio({ name, value, current, onChange, children }) {
  return (
    <label className={`fr-radio${current === value ? ' on' : ''}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />{children}
    </label>
  )
}

/**
 * Add one or more ACM materials to a room, or edit one existing material (`editing`).
 * Files are uploaded after each material is saved. `embedded`: shown inside the room panel (no card frame).
 */
export default function AcmMaterialForm({ room, meta, editing, onSaved, onCancel, onToast, embedded = false }) {
  const [blocks, setBlocks] = useState(() => [editing ? fromMaterial(editing) : blank()])
  const [attachments, setAttachments] = useState(() => editing?.attachments ?? [])
  const [saving, setSaving] = useState(false)
  const fileRefs = useRef({})

  const update = (key, fn) => setBlocks((bs) => bs.map((b) => (b.key === key ? fn(b) : b)))
  const setValue = (key, field) => (value) => update(key, (b) => {
    const values = { ...b.values, [field]: value }
    if (field === 'acmStatus' && STATUS_CLASSIFICATION[value]) values.classification = STATUS_CLASSIFICATION[value]
    if (field === 'acmStatus' && value === 'No ACM') { values.condition = 'Good'; values.riskRanking = 'Low' }
    if ((field === 'friability' || field === 'condition') && !b.riskTouched && values.acmStatus !== 'No ACM') {
      values.riskRanking = suggestRisk(values.friability, values.condition)
    }
    return { ...b, values, riskTouched: b.riskTouched || field === 'riskRanking', errors: { ...b.errors, [field]: undefined } }
  })

  const addFiles = (key, list) => {
    const files = [...list]
    const bad = files.find((f) => !FILE_TYPES.includes(f.type) || f.size > meta.maxAttachmentBytes)
    if (bad) { onToast({ kind: 'error', text: `${bad.name}: attach JPG, PNG, WebP or PDF files up to 10 MB` }); return }
    update(key, (b) => ({
      ...b,
      pending: [...b.pending, ...files.map((file) => ({
        key: Math.random().toString(36).slice(2), file, type: file.type === 'application/pdf' ? 'Sample Report' : 'Photo', description: '',
      }))],
    }))
  }

  // Save every block (new) or the one being edited; keep failed blocks on screen with their errors
  const save = async (andAnother) => {
    setSaving(true)
    const failed = []
    let savedCount = 0
    let uploadProblem = null
    for (const b of blocks) {
      const body = { ...b.values, roomId: room.id, quantity: b.values.quantity === '' ? null : Number(b.values.quantity) }
      try {
        const saved = editing
          ? await request(`/acm-materials/${editing.id}`, { method: 'PUT', body })
          : await request('/acm-materials', { method: 'POST', body })
        for (const p of b.pending) {
          try {
            await uploadFile(`/acm-materials/${saved.id}/attachments`, p.file, { type: p.type, description: p.description })
          } catch (err) {
            uploadProblem = `${p.file.name}: ${err.message}`
          }
        }
        savedCount += 1
      } catch (err) {
        failed.push({ ...b, errors: err.fields ?? { form: err.message } })
      }
    }
    setSaving(false)
    if (uploadProblem) onToast({ kind: 'error', text: `Saved, but an attachment failed — ${uploadProblem}` })
    if (savedCount) onSaved(savedCount, { editing: Boolean(editing), quiet: Boolean(uploadProblem) })
    if (failed.length) setBlocks(failed)
    else if (andAnother) setBlocks([blank()])
    else onCancel()
  }

  const removeAttachment = async (f) => {
    try {
      await request(`/acm-materials/${editing.id}/attachments/${f.id}`, { method: 'DELETE' })
      setAttachments((list) => list.filter((x) => x.id !== f.id))
      onSaved(0, { editing: true, quiet: true })
    } catch (err) {
      onToast({ kind: 'error', text: err.message })
    }
  }

  return (
    <section className={`${embedded ? 'fr-pane' : 'u-card'} fr-card`}>
      <header className="fr-card-head">
        <h2>{editing ? `Edit ACM Material – ${editing.name}` : 'ACM Material Details'}</h2>
        {!editing && (
          <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={() => setBlocks((bs) => [...bs, blank()])}><Plus size={14} />Add Another Material</button>
        )}
      </header>
      {editing && editing.roomId !== room.id && (
        <p className="b-note warn"><TriangleAlert size={14} />This is a {editing.scope}-level material recorded from room {editing.roomNumber}; changes apply everywhere it’s shown.</p>
      )}

      {blocks.map((b, idx) => {
        const v = b.values
        const set = (f) => setValue(b.key, f)
        const err = (f) => b.errors[f] && <em>{b.errors[f]}</em>
        const sel = (f, label, options, placeholder) => (
          <SearchSelect variant="field" label={label} value={v[f]} onChange={set(f)} searchable={options.length > 8}
            options={[...(placeholder ? [{ value: '', label: placeholder }] : []), ...options.map((o) => ({ value: o, label: o }))]} />
        )
        const noAcm = v.acmStatus === 'No ACM'
        return (
          <div key={b.key} className="fr-block">
            {!editing && (
              <div className="fr-block-head">
                <span className="fr-block-num">{idx + 1}</span>
                {blocks.length > 1 && (
                  <button type="button" className="u-row-btn danger" onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))} aria-label={`Remove material ${idx + 1}`}><Trash2 size={14} /></button>
                )}
              </div>
            )}

            <div className="uf-field fr-status-field">
              <span>ACM Status for this Material *</span>
              <div className="fr-radios fr-radios-status" role="radiogroup">
                {meta.statuses.map((s) => <Radio key={s} name={`st-${b.key}`} value={s} current={v.acmStatus} onChange={set('acmStatus')}>{s}</Radio>)}
              </div>
              {err('acmStatus')}
            </div>

            <div className="fr-grid fr-grid-3">
              <label className="uf-field fr-span-row"><span>Material Name *</span>
                <input className={`u-input${b.errors.name ? ' invalid' : ''}`} list="acm-names" value={v.name} maxLength={80} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Ceiling Tile" />{err('name')}
              </label>
              <div className="uf-field"><span>Material Type *</span>{sel('materialType', 'Material type', meta.types, 'Select type…')}{err('materialType')}</div>
              <label className="uf-field"><span>Location in Room *</span>
                <input className={`u-input${b.errors.location ? ' invalid' : ''}`} list="acm-locations" value={v.location} maxLength={120} onChange={(e) => set('location')(e.target.value)} placeholder="e.g. Ceiling (entire room)" />{err('location')}
              </label>
            </div>
            <div className="fr-grid fr-grid-4">
              <label className="uf-field"><span>Quantity *</span>
                <input className={`u-input${b.errors.quantity ? ' invalid' : ''}`} inputMode="decimal" value={v.quantity} onChange={(e) => set('quantity')(e.target.value)} />{err('quantity')}
              </label>
              <div className="uf-field"><span>Unit *</span>{sel('unit', 'Unit', meta.units)}{err('unit')}</div>
              <div className="uf-field"><span>Friability *</span>{sel('friability', 'Friability', meta.friability)}{err('friability')}</div>
              <div className="uf-field"><span>ACM Classification *</span>{sel('classification', 'Classification', meta.classifications)}{err('classification')}</div>
            </div>
            <div className="fr-grid fr-grid-3">
              <div className="uf-field"><span>Condition *</span>{sel('condition', 'Condition', meta.conditions)}{err('condition')}</div>
              <div className="uf-field"><span>Risk Ranking * {!noAcm && !b.riskTouched && <small className="fr-auto">suggested</small>}</span>{sel('riskRanking', 'Risk ranking', meta.riskRankings)}{err('riskRanking')}</div>
              <label className="uf-field"><span>Assessment Date *</span>
                <input type="date" className={`u-input${b.errors.assessmentDate ? ' invalid' : ''}`} value={v.assessmentDate} max={todayIso()} onChange={(e) => set('assessmentDate')(e.target.value)} />{err('assessmentDate')}
              </label>
            </div>
            <label className="uf-field"><span>Material Notes</span>
              <textarea className="u-input fr-textarea" rows={2} maxLength={500} value={v.notes} onChange={(e) => set('notes')(e.target.value)} placeholder='e.g. 12" x 12" acoustic ceiling tiles, confirmed ACM per bulk sample report.' />
              <small className="fr-count">{v.notes.length}/500</small>
            </label>

            {/* Attachments */}
            <div className="uf-field">
              <span className="fr-attach-head">Attachments <small>(photos, reports, plans)</small>
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => fileRefs.current[b.key]?.click()}><Paperclip size={13} />Add Attachment</button>
              </span>
              <input ref={(el) => { fileRefs.current[b.key] = el }} type="file" multiple hidden accept={FILE_TYPES.join(',')}
                onChange={(e) => { addFiles(b.key, e.target.files ?? []); e.target.value = '' }} />
              {(attachments.length > 0 || b.pending.length > 0) ? (
                <div className="u-table-wrap">
                  <table className="u-table c-table fr-files">
                    <thead><tr><th>File Name</th><th>Type</th><th>Description</th><th>Uploaded</th><th className="b-col-actions">Action</th></tr></thead>
                    <tbody>
                      {editing && attachments.map((f) => (
                        <tr key={f.id}>
                          <td><span className="fr-file">{f.mime === 'application/pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}{f.name}</span></td>
                          <td>{f.type}</td><td>{f.description || '—'}</td><td className="u-nowrap">{fmtDate(f.uploadedAt)}</td>
                          <td className="b-col-actions"><span className="b-actions">
                            <a className="u-row-btn" href={`${API_BASE}/acm-materials/${editing.id}/attachments/${f.id}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${f.name}`}><Eye size={13} /></a>
                            <a className="u-row-btn" href={`${API_BASE}/acm-materials/${editing.id}/attachments/${f.id}?download=1`} aria-label={`Download ${f.name}`}><Download size={13} /></a>
                            <button type="button" className="u-row-btn danger" onClick={() => removeAttachment(f)} aria-label={`Delete ${f.name}`}><Trash2 size={13} /></button>
                          </span></td>
                        </tr>
                      ))}
                      {b.pending.map((p) => (
                        <tr key={p.key} className="fr-pending">
                          <td><span className="fr-file">{p.file.type === 'application/pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}{p.file.name}</span></td>
                          <td><SearchSelect variant="field" label="Attachment type" value={p.type} searchable={false}
                            onChange={(t) => update(b.key, (x) => ({ ...x, pending: x.pending.map((q) => (q.key === p.key ? { ...q, type: t } : q)) }))}
                            options={meta.attachmentTypes.map((t) => ({ value: t, label: t }))} /></td>
                          <td><input className="u-input" value={p.description} maxLength={120} placeholder="Description"
                            onChange={(e) => update(b.key, (x) => ({ ...x, pending: x.pending.map((q) => (q.key === p.key ? { ...q, description: e.target.value } : q)) }))} /></td>
                          <td className="u-nowrap u-muted">On save</td>
                          <td className="b-col-actions"><button type="button" className="u-row-btn danger" aria-label={`Remove ${p.file.name}`}
                            onClick={() => update(b.key, (x) => ({ ...x, pending: x.pending.filter((q) => q.key !== p.key) }))}><X size={13} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="fr-empty-files">No attachments. Add photos, bulk sample reports or inspection reports (JPG, PNG, WebP, PDF up to 10 MB).</p>}
            </div>

            <div className="fr-grid fr-grid-2 fr-options">
              <div className="uf-field">
                <span>Related Tracking <small>(optional)</small></span>
                <div className="fr-checks">
                  {meta.relatedTracking.map((t) => (
                    <label key={t} className="fr-check">
                      <input type="checkbox" checked={v.relatedTracking.includes(t)}
                        onChange={(e) => set('relatedTracking')(e.target.checked ? [...v.relatedTracking, t] : v.relatedTracking.filter((x) => x !== t))} />{t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="uf-field">
                <span>ACM Mapping Scope *</span>
                <div className="fr-radios fr-radios-col" role="radiogroup">
                  {meta.scopes.map((s) => (
                    <Radio key={s} name={`sc-${b.key}`} value={s} current={v.scope} onChange={set('scope')}>
                      <strong>{SCOPE_LABEL[s][0]}</strong>&nbsp;<span className="u-muted">({SCOPE_LABEL[s][1]})</span>
                    </Radio>
                  ))}
                </div>
                {err('scope')}
              </div>
            </div>
            {b.errors.form && <p className="uf-error">{b.errors.form}</p>}
          </div>
        )
      })}

      <datalist id="acm-names">{meta.names.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="acm-locations">{LOCATIONS.map((n) => <option key={n} value={n} />)}</datalist>

      <footer className="fr-card-foot">
        <button type="button" className="u-btn u-btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
        {!editing && <button type="button" className="u-btn u-btn-outline" disabled={saving} onClick={() => save(true)}><Plus size={14} />Save &amp; Add Another</button>}
        <button type="button" className="u-btn u-btn-primary" disabled={saving} onClick={() => save(false)}>
          <Save size={14} />{saving ? 'Saving…' : editing ? 'Save Changes' : blocks.length > 1 ? `Save ${blocks.length} Materials` : 'Save'}
        </button>
      </footer>
    </section>
  )
}
