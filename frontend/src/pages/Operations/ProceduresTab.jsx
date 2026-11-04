import { useEffect, useRef, useState } from 'react'
import { BookOpen, Search, Upload, Download, FileText, ExternalLink } from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Badge from '../AcmInventory/Badge'
import { fmtDay } from '../Surveillance/survMeta'
import { request, uploadFile, API_BASE } from '../../lib/api'

// Asbestos-safe work procedures; each has a PDF that crews open from the activity screen
export default function ProceduresTab({ onToast, onUpload }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [reload, setReload] = useState(0)
  const fileRef = useRef(null)
  const target = useRef(null)

  useEffect(() => {
    let cancelled = false
    request('/om/procedures').then((d) => { if (!cancelled) setList(d) }).catch((e) => onToast({ kind: 'error', text: e.message }))
    return () => { cancelled = true }
  }, [reload, onToast])

  const attach = async (file) => {
    try {
      await uploadFile(`/om/procedures/${target.current.id}/file`, file)
      onToast({ kind: 'success', text: `Document added to ${target.current.id}` })
      setReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }

  const term = q.trim().toLowerCase()
  const shown = (list ?? []).filter((p) => (!category || p.category === category) && (!term || [p.id, p.title, p.description].some((v) => v?.toLowerCase().includes(term))))
  const categories = [...new Set((list ?? []).map((p) => p.category))].sort()

  return (
    <section className="u-card ai-records">
      <header className="ai-group-head">
        <h2 className="ai-records-title"><BookOpen size={16} /> Procedures &amp; SOPs</h2>
        <div className="om-head-actions">
          <div className="om-sop-cat">
            <SearchSelect variant="field" label="Category" value={category} onChange={setCategory} searchable={false}
              options={[{ value: '', label: 'All Categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          </div>
          <label className="u-search om-plan-search"><Search size={15} /><input type="search" placeholder="Search procedures…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search procedures" /></label>
          <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={onUpload}><Upload size={13} />Upload SOP</button>
        </div>
      </header>
      <input ref={fileRef} type="file" accept=".pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach(f) }} />
      <ul className="om-sops">
        {shown.map((p) => (
          <li key={p.id} className="om-sop">
            <span className="om-sop-icon"><FileText size={20} /></span>
            <div className="om-sop-body">
              <div className="om-sop-top"><span className="ai-id">{p.id}</span><Badge tone="primary">{p.category}</Badge><span className="u-muted">v{p.version} · effective {fmtDay(p.effectiveDate)}</span></div>
              <strong>{p.title}</strong>
              <span className="u-muted">{p.description}</span>
            </div>
            <div className="om-sop-actions">
              {p.file ? (
                <>
                  <a className="u-btn u-btn-outline u-btn-sm" href={`${API_BASE}/om/procedures/${p.id}/file`} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open</a>
                  <a className="u-row-btn" href={`${API_BASE}/om/procedures/${p.id}/file?download=1`} aria-label={`Download ${p.title}`} title="Download"><Download size={14} /></a>
                </>
              ) : (
                <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => { target.current = p; fileRef.current?.click() }}><Upload size={13} />Add PDF</button>
              )}
            </div>
          </li>
        ))}
        {list && !shown.length && <li className="u-muted sv-empty-line">No procedures match.</li>}
        {!list && <li className="u-muted sv-empty-line">Loading…</li>}
      </ul>
    </section>
  )
}
