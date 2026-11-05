import { useEffect, useRef, useState } from 'react'
import { Search, Globe, Star, Library, Folder, FileText, Upload, FolderPlus, ExternalLink, Download, ChevronRight, RefreshCw } from 'lucide-react'
import { useGraph } from '../../auth/useGraph'
import { fmtBytes } from '../../auth/graph'
import ConnectGate from './ConnectGate'
import SharePointSync from './SharePointSync'

const MAX_UPLOAD = 250 * 1024 * 1024 // Graph simple upload limit
const ITEM_SELECT = 'id,name,size,lastModifiedDateTime,lastModifiedBy,webUrl,folder,file'
const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function SharePointTab({ onToast }) {
  const g = useGraph('sharepoint')
  const { call } = g
  const fileRef = useRef(null)
  const [sites, setSites] = useState(null)
  const [siteQuery, setSiteQuery] = useState('')
  const [siteSearch, setSiteSearch] = useState('')
  const [site, setSite] = useState(null)
  const [drives, setDrives] = useState(null)
  const [drive, setDrive] = useState(null)
  const [path, setPath] = useState([]) // [{ id, name }] from the library root
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [folderName, setFolderName] = useState(null) // null = the "new folder" field is closed

  // Sites: search results, or the ones the user follows (plus the tenant's root site)
  useEffect(() => {
    if (g.status !== 'connected') return undefined
    let cancelled = false
    const load = siteSearch
      ? call(`/sites?search=${encodeURIComponent(siteSearch)}&$select=id,displayName,webUrl,name`).then((d) => d.value.map((s) => ({ ...s, kind: 'search' })))
      : Promise.all([
        call('/me/followedSites?$select=id,displayName,webUrl,name').then((d) => d.value).catch(() => []),
        call('/sites/root?$select=id,displayName,webUrl,name').catch(() => null),
      ]).then(([followed, root]) => [...(root ? [{ ...root, kind: 'root' }] : []), ...followed.filter((s) => s.id !== root?.id).map((s) => ({ ...s, kind: 'followed' }))])
    load.then((v) => { if (!cancelled) { setSites(v); setError(null) } }).catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [g.status, call, siteSearch])

  useEffect(() => {
    if (!site) return undefined
    let cancelled = false
    call(`/sites/${site.id}/drives?$select=id,name,webUrl,driveType,description`)
      .then((d) => {
        if (cancelled) return
        setDrives(d.value)
        if (d.value.length === 1) { setDrive(d.value[0]); setPath([]) }
      })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [site, call])

  const folderId = path.at(-1)?.id ?? 'root'
  useEffect(() => {
    if (!drive) return undefined
    let cancelled = false
    call(`/drives/${drive.id}/items/${folderId}/children?$select=${ITEM_SELECT}&$top=200&$orderby=name`)
      .then((d) => { if (!cancelled) { setItems(d.value.sort((a, b) => Boolean(b.folder) - Boolean(a.folder))); setError(null) } })
      .catch((e) => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [drive, folderId, call, reload])

  const pickSite = (s) => { setSite(s); setDrives(null); setDrive(null); setPath([]); setItems(null) }
  const pickDrive = (d) => { setDrive(d); setPath([]); setItems(null) }

  const upload = async (file) => {
    if (file.size > MAX_UPLOAD) { onToast({ kind: 'error', text: 'Files over 250 MB can’t be uploaded here — use SharePoint directly.' }); return }
    setBusy(true)
    try {
      await call(`/drives/${drive.id}/items/${folderId}:/${encodeURIComponent(file.name)}:/content?@microsoft.graph.conflictBehavior=rename`, {
        method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      onToast({ kind: 'success', text: `Uploaded ${file.name} to ${drive.name}${path.length ? ` / ${path.map((p) => p.name).join(' / ')}` : ''}` })
      setReload((n) => n + 1)
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const newFolder = async (e) => {
    e.preventDefault()
    const name = folderName?.trim()
    if (!name) return
    if (/["*:<>?/\\|]/.test(name)) { onToast({ kind: 'error', text: 'Folder names can’t contain " * : < > ? / \\ |' }); return }
    try {
      await call(`/drives/${drive.id}/items/${folderId}/children`, { method: 'POST', body: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' } })
      setFolderName(null)
      setReload((n) => n + 1)
    } catch (err) {
      onToast({ kind: 'error', text: err.message })
    }
  }

  const download = async (item) => {
    try {
      const d = await call(`/drives/${drive.id}/items/${item.id}?$select=id,@microsoft.graph.downloadUrl`)
      window.location.assign(d['@microsoft.graph.downloadUrl'])
    } catch (e) {
      onToast({ kind: 'error', text: e.message })
    }
  }

  return (
    <ConnectGate g={g} name="SharePoint" what="Browse district sites and document libraries, and upload inspection reports and plans.">
      {error && <div className="u-banner">SharePoint: {error}</div>}
      {/* After creating / syncing, refresh the library listing so the new folder and files show */}
      <SharePointSync call={call} site={site} drive={drive} onToast={onToast} onChanged={() => setReload((n) => n + 1)} />
      <div className="m365-sp">
        <aside className="u-card m365-sites">
          <form className="u-search" onSubmit={(e) => { e.preventDefault(); setSiteSearch(siteQuery.trim()) }}>
            <Search size={15} />
            <input type="search" placeholder="Search sites…" value={siteQuery} onChange={(e) => { setSiteQuery(e.target.value); if (!e.target.value) setSiteSearch('') }} aria-label="Search SharePoint sites" />
          </form>
          <h4>{siteSearch ? 'Search results' : 'Your sites'}</h4>
          {!sites && <p className="u-muted sv-empty-line">Loading…</p>}
          {sites && !sites.length && <p className="u-muted sv-empty-line">{siteSearch ? 'No sites found.' : 'You don’t follow any sites yet — search for one.'}</p>}
          <ul>
            {sites?.map((s) => (
              <li key={s.id}>
                <button type="button" className={s.id === site?.id ? 'active' : undefined} onClick={() => pickSite(s)}>
                  {s.kind === 'root' ? <Globe size={15} /> : s.kind === 'followed' ? <Star size={15} /> : <Library size={15} />}
                  <span>{s.displayName || s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="u-card m365-files">
          {!site && <div className="m365-gate"><Library size={26} /><strong>Choose a site</strong><span>Pick a site on the left to see its document libraries.</span></div>}
          {site && (
            <>
              <header className="m365-files-head">
                <div>
                  <h3>{site.displayName || site.name}</h3>
                  <a href={site.webUrl} target="_blank" rel="noreferrer" className="ai-link"><ExternalLink size={12} />Open site</a>
                </div>
                <div className="m365-libs">
                  {drives?.map((d) => (
                    <button key={d.id} type="button" className={d.id === drive?.id ? 'active' : undefined} onClick={() => pickDrive(d)}><Library size={13} />{d.name}</button>
                  ))}
                </div>
              </header>

              {drive && (
                <>
                  <div className="m365-files-bar">
                    <nav className="m365-crumbs" aria-label="Folder path">
                      <button type="button" onClick={() => setPath([])}>{drive.name}</button>
                      {path.map((p, i) => (
                        <span key={p.id}><ChevronRight size={13} /><button type="button" onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</button></span>
                      ))}
                    </nav>
                    <div className="m365-files-actions">
                      <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setReload((n) => n + 1)} aria-label="Refresh"><RefreshCw size={13} /></button>
                      {folderName === null
                        ? <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setFolderName('')}><FolderPlus size={13} />New Folder</button>
                        : (
                          <form className="m365-newfolder" onSubmit={newFolder}>
                            <input className="u-input" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Folder name" maxLength={120} aria-label="New folder name"
                              autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setFolderName(null) }} />
                            <button type="submit" className="u-btn u-btn-primary u-btn-sm" disabled={!folderName.trim()}>Create</button>
                            <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => setFolderName(null)}>Cancel</button>
                          </form>
                        )}
                      <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f) }} />
                      <button type="button" className="u-btn u-btn-primary u-btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={13} />{busy ? 'Uploading…' : 'Upload'}</button>
                    </div>
                  </div>
                  <div className="u-table-wrap">
                    <table className="u-table m365-table">
                      <thead><tr><th>Name</th><th>Modified</th><th>Modified By</th><th className="num">Size</th><th><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>
                        {items?.map((it) => (
                          <tr key={it.id}>
                            <td>
                              {it.folder
                                ? <button type="button" className="m365-item" onClick={() => setPath([...path, { id: it.id, name: it.name }])}><Folder size={16} className="m365-folder" />{it.name}<small>{it.folder.childCount} items</small></button>
                                : <a className="m365-item" href={it.webUrl} target="_blank" rel="noreferrer"><FileText size={16} />{it.name}</a>}
                            </td>
                            <td className="u-nowrap">{when(it.lastModifiedDateTime)}</td>
                            <td className="u-nowrap">{it.lastModifiedBy?.user?.displayName ?? '—'}</td>
                            <td className="num u-nowrap">{it.folder ? '' : fmtBytes(it.size)}</td>
                            <td className="ai-col-actions">
                              {it.file && <button type="button" className="u-row-btn" onClick={() => download(it)} aria-label={`Download ${it.name}`}><Download size={14} /></button>}
                            </td>
                          </tr>
                        ))}
                        {items && !items.length && <tr><td colSpan={5} className="u-empty">This folder is empty.</td></tr>}
                        {!items && <tr><td colSpan={5} className="u-empty">Loading…</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {drives && !drives.length && <p className="u-muted sv-empty-line">This site has no document libraries you can access.</p>}
            </>
          )}
        </section>
      </div>
    </ConnectGate>
  )
}
