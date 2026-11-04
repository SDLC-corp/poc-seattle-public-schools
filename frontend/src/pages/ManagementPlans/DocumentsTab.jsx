import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search, Plus, Download, Eye, FolderOpen, FileText, Building2, Lock, Info, CalendarDays, FileUp } from 'lucide-react'
import Badge from '../AcmInventory/Badge'
import UploadDialog from '../Documents/UploadDialog'
import { FileBadge, SourceLabel } from '../Documents/docUtils'
import { fmtSize } from '../Documents/docMeta'
import { fmtDay } from '../Surveillance/survMeta'
import { request, fmtDateTime, API_BASE } from '../../lib/api'
import { Tile } from './RegisterTab'
import '../Documents/documents.css'

const ACCESS_TONE = { Public: 'good', Internal: 'neutral', Restricted: 'warning' }
const TYPE = 'Management Plan'
const q = (type, school) => `/documents?type=${encodeURIComponent(type)}&school=${encodeURIComponent(school)}&pageSize=100`

// Document Management records and O&M plan PDFs → one list of plan documents
const fromDoc = (d, scope) => ({
  key: d.id, name: d.name, ext: d.ext, size: d.size, scope, source: d.source, where: d.buildingName ?? (scope === 'district' ? 'District-wide' : 'Whole school'),
  access: d.access, uploadedAt: d.uploadedAt, uploadedBy: d.uploadedBy?.name, from: 'Document Management',
  open: d.storedName ? `${API_BASE}/documents/${d.id}/file` : null, download: d.storedName ? `${API_BASE}/documents/${d.id}/file?download=1` : null,
})
const fromAttachment = (plan, f, scope) => ({
  key: `${plan.id}-${f.id}`, name: f.name, ext: (f.name.split('.').pop() || 'pdf').toLowerCase(), size: f.size, scope, source: 'upload',
  where: scope === 'district' ? 'District-wide' : 'Whole school', access: 'Internal', uploadedAt: f.uploadedAt, uploadedBy: f.uploadedBy?.name,
  from: `${plan.name} v${plan.version}`, open: `${API_BASE}/om/plans/${plan.id}/attachments/${f.id}`, download: `${API_BASE}/om/plans/${plan.id}/attachments/${f.id}?download=1`,
})

// Management plan › Documents: every management plan document for the school (and the district plan)
export default function DocumentsTab({ schoolId, schoolName, plan }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [facets, setFacets] = useState(null)
  const [lists, setLists] = useState({ schools: [], buildings: [] })
  const [term, setTerm] = useState('')
  const [scope, setScope] = useState('school')
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    Promise.all([request(q(TYPE, schoolId)), request(q(TYPE, 'district')), request('/om/plans')])
      .then(([s, d, om]) => {
        const own = om.facility.find((p) => p.schoolId === schoolId)
        setData({
          school: [...s.documents.map((x) => fromDoc(x, 'school')), ...(own?.attachments ?? []).map((f) => fromAttachment(own, f, 'school'))],
          district: [...d.documents.map((x) => fromDoc(x, 'district')), ...(om.district?.attachments ?? []).map((f) => fromAttachment(om.district, f, 'district'))],
        })
      })
      .catch((e) => setError(e.message))
  }, [schoolId, refresh])
  useEffect(() => {
    Promise.all([request('/documents/facets'), request('/schools'), request('/buildings')])
      .then(([fa, s, b]) => { setFacets(fa); setLists({ schools: s.schools, buildings: b.buildings }) })
      .catch(() => {})
  }, [])

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase()
    return (data?.[scope] ?? [])
      .filter((d) => !t || [d.name, d.where, d.uploadedBy, d.from].some((v) => String(v ?? '').toLowerCase().includes(t)))
      // newest first; uploads in the same minute by name, latest version first (v1.2 before v1.1)
      .sort((a, b) => String(b.uploadedAt).slice(0, 16).localeCompare(String(a.uploadedAt).slice(0, 16)) || b.name.localeCompare(a.name, 'en', { numeric: true }))
  }, [data, scope, term])

  if (error) return <div className="u-banner">Couldn't load management plan documents ({error}).</div>
  if (!data) return <div className="mp-loading">Loading management plan documents…</div>
  const latest = [...data.school].sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0]

  return (
    <section className="mp-card dc">
      <header className="mp-reg-head">
        <div>
          <h2>Management Plan Documents</h2>
          <p>Signed and published versions of the asbestos management plan for {schoolName}, and the district-wide plan it follows.</p>
        </div>
        <button type="button" className="u-btn u-btn-primary" onClick={() => setUploading(true)} disabled={!facets}><Plus size={15} />Upload Plan Document</button>
      </header>
      {notice && <p className="u-banner dc-notice">{notice}</p>}

      <div className="cm-tiles">
        <Tile icon={FileText} value={data.school.length} label="Plan Documents" tone="blue" />
        <div className="mp-tile purple rk-next"><span className="mp-tile-icon"><FileUp size={24} strokeWidth={1.8} /></span>
          <span className="mp-tile-text"><span>Current Plan Version</span><strong>v{plan.version}</strong></span></div>
        <div className="mp-tile green rk-next"><span className="mp-tile-icon"><CalendarDays size={24} strokeWidth={1.8} /></span>
          <span className="mp-tile-text"><span>Latest Upload</span><strong>{latest ? fmtDay(latest.uploadedAt.slice(0, 10)) : 'None yet'}</strong></span></div>
        <Tile icon={Building2} value={data.district.length} label="District Plan Documents" tone="sky" />
      </div>

      <div className="dc-filters">
        <div className="ms-views" role="tablist" aria-label="Plan documents shown">
          <button type="button" role="tab" aria-selected={scope === 'school'} className={scope === 'school' ? 'on' : undefined} onClick={() => setScope('school')}>{schoolName} ({data.school.length})</button>
          <button type="button" role="tab" aria-selected={scope === 'district'} className={scope === 'district' ? 'on' : undefined} onClick={() => setScope('district')}>District-wide Plan ({data.district.length})</button>
        </div>
        <div className="dc-filter-row">
          <label className="u-search"><Search size={15} />
            <input type="search" placeholder="Search plan documents…" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search plan documents" />
          </label>
        </div>
      </div>

      {rows.length ? (
        <div className="mp-reg-scroll">
          <table className="mp-table dc-table">
            <colgroup><col /><col className="dc-col-type" /><col className="dc-col-where" /><col className="dc-col-access" /><col className="dc-col-up" /><col className="dc-col-actions" /></colgroup>
            <thead><tr><th>Document</th><th>Stored In</th><th>Applies To</th><th>Access</th><th>Uploaded</th><th className="ms-actions">Actions</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.key}>
                  <td><div className="dc-name"><FileBadge ext={d.ext} size={18} /><span><strong>{d.name}</strong><small>{d.ext?.toUpperCase()}{d.size ? ` · ${fmtSize(d.size)}` : ''} · <SourceLabel source={d.source} /></small></span></div></td>
                  <td>{d.from}</td>
                  <td>{d.where}</td>
                  <td><Badge tone={ACCESS_TONE[d.access] ?? 'neutral'}>{d.access === 'Restricted' && <Lock size={11} />}{d.access}</Badge></td>
                  <td className="u-nowrap">{d.uploadedAt ? fmtDateTime(d.uploadedAt) : '—'}{d.uploadedBy && <small>{d.uploadedBy}</small>}</td>
                  <td className="ms-actions"><div>
                    {d.open ? (
                      <>
                        <a className="u-row-btn dc-btn" href={d.open} target="_blank" rel="noreferrer" title="Open" aria-label={`Open ${d.name}`}><Eye size={16} /></a>
                        <a className="u-row-btn dc-btn" href={d.download} title="Download" aria-label={`Download ${d.name}`}><Download size={16} /></a>
                      </>
                    ) : (
                      <Link className="u-row-btn dc-btn" to="/documents/management-plans" title={d.source === 'sharepoint' ? 'Stored in SharePoint – open Document Management' : 'Sample record (no file) – open Document Management'} aria-label={`Open ${d.name} in Document Management`}><FolderOpen size={15} /></Link>
                    )}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dc-empty">
          <FileText size={30} />
          <strong>{term ? 'No plan documents match your search.' : scope === 'school' ? `No management plan documents for ${schoolName} yet` : 'No district-wide plan documents yet'}</strong>
          {!term && <span>Upload the signed plan (PDF) so the current version is on file. AHERA requires a copy of the management plan to be available at the school.</span>}
          {!term && <button type="button" className="u-btn u-btn-primary" onClick={() => setUploading(true)} disabled={!facets}><Plus size={15} />Upload Plan Document</button>}
        </div>
      )}
      <p className="mp-reg-count">Plan documents from Document Management (type “Management Plan”) and the school’s O&amp;M plan · <Link to="/documents/management-plans" className="ai-link">Open Document Management</Link></p>

      <div className="mp-reg-note">
        <Info size={20} />
        <p><strong>Note</strong>Upload a new version whenever the plan is reviewed or approved, so the latest signed plan is always available to staff, contractors and parents on request.</p>
      </div>

      {uploading && facets && (
        <UploadDialog facets={facets} schools={lists.schools} buildings={lists.buildings} defaultType={TYPE} defaultSchoolId={schoolId}
          onClose={() => setUploading(false)}
          onUploaded={(doc) => { setUploading(false); setNotice(`Uploaded ${doc.name}${doc.type === TYPE ? '' : ` as ${doc.type} – it’s in Document Management, not this list`}.`); setScope(doc.schoolId === schoolId ? 'school' : 'district'); setRefresh((k) => k + 1) }} />
      )}
    </section>
  )
}
