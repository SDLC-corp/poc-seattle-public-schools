import { useCallback, useEffect, useState } from 'react'
import { FolderSync, FolderPlus, RefreshCw, ExternalLink, CircleCheck, CircleAlert, ClipboardCheck, Receipt, ChartColumn, FileText, ChevronRight } from 'lucide-react'
import { request, authHeaders, API_BASE, fmtDateTime } from '../../lib/api'

const ICONS = { Inspections: ClipboardCheck, Invoices: Receipt, Reports: ChartColumn, Documents: FileText }
const PARALLEL = 3
// Each path segment encoded for a Graph path address (…/items/{id}:/a/b/c.pdf:)
const graphPath = (...parts) => parts.join('/').split('/').map(encodeURIComponent).join('/')

// A Microsoft Graph / API error in words someone can act on
function explain(e) {
  if (e.status === 401 || e.consentRequired || /consent/i.test(e.message)) return 'Microsoft needs your permission to write to SharePoint — sign in again and accept the SharePoint permissions (Files.ReadWrite.All).'
  if (e.status === 403 || e.code === 'accessDenied') return `SharePoint refused access (${e.message}). Your account needs edit rights on this library, and the app's SharePoint permission (Files.ReadWrite.All) may need an administrator's approval in Entra ID.`
  if (e.status === 404 && e.code === 'itemNotFound') return 'The SharePoint folder no longer exists — select Change Location and create it again.'
  return e.message
}

/**
 * Creates "Seattle Public Schools" (with Inspections, Invoices, Reports and Documents) in a SharePoint library and
 * uploads the app's files into it with the signed-in user's Microsoft Graph token. The backend lists the files and
 * remembers what was uploaded, so later syncs only send new or changed files.
 */
export default function SharePointSync({ call, site, drive, onToast, onChanged }) {
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null) // shown in the panel until the next attempt
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(null) // 'create' | 'sync'
  const [progress, setProgress] = useState(null) // { done, total, current }
  const [reload, setReload] = useState(0)

  useEffect(() => {
    request('/sharepoint-sync').then((d) => { setInfo(d); setLoadError(null) })
      .catch((e) => setLoadError(e.status === 404
        ? 'The server doesn’t have SharePoint folder sync yet — restart (or redeploy) the backend.'
        : `Couldn’t load the SharePoint sync settings (${e.message}).`))
  }, [reload])

  // The folder by path under a parent, created when missing
  const ensureFolder = useCallback(async (driveId, parentId, name) => {
    try {
      return await call(`/drives/${driveId}/items/${parentId}:/${graphPath(name)}?$select=id,name,webUrl,folder`)
    } catch (e) {
      if (e.status !== 404) throw e
      return call(`/drives/${driveId}/items/${parentId}/children`, { method: 'POST', body: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' } })
    }
  }, [call])

  // Where to create the folder: the library open below, else the main SharePoint site's default "Documents" library
  const resolveLocation = async () => {
    if (site && drive) return { site, drive }
    const [rootSite, rootDrive] = await Promise.all([
      call('/sites/root?$select=id,displayName,webUrl,name'),
      call('/sites/root/drive?$select=id,name,webUrl'),
    ])
    return { site: rootSite, drive: rootDrive }
  }

  // Creates the folder and its sub-folders, saves the location, then uploads everything (first sync)
  const create = async () => {
    setBusy('create')
    setError(null)
    let target
    try {
      const where = await resolveLocation()
      const root = await ensureFolder(where.drive.id, 'root', info.rootFolder)
      for (const f of info.folders) await ensureFolder(where.drive.id, root.id, f)
      const res = await request('/sharepoint-sync/target', {
        method: 'PUT',
        body: { siteId: where.site.id, siteName: where.site.displayName || where.site.name, driveId: where.drive.id, driveName: where.drive.name, folderId: root.id, webUrl: root.webUrl },
      })
      target = res.target
      onToast({ kind: 'success', text: `Created “${info.rootFolder}” (${info.folders.join(', ')}) in ${target.siteName} › ${target.driveName}. Uploading the files…` })
      onChanged?.()
    } catch (e) {
      setError(explain(e))
      setBusy(null)
      return
    }
    await sync(target)
  }

  const sync = async (target = info.target) => {
    const t = target
    setError(null)
    setBusy('sync')
    const started = Date.now()
    const uploaded = []
    const failed = []
    try {
      const { items } = await request('/sharepoint-sync/manifest')
      // The folders again, in case someone deleted one in SharePoint
      for (const f of info.folders) await ensureFolder(t.driveId, t.folderId, f)
      const todo = items.filter((x) => !x.synced)
      setProgress({ done: 0, total: todo.length, current: '' })
      const headers = await authHeaders()
      let next = 0
      let done = 0
      const worker = async () => {
        while (next < todo.length) {
          const x = todo[next]
          next += 1
          setProgress((p) => ({ ...p, current: `${x.folder}/${x.name}` }))
          try {
            const res = await fetch(`${API_BASE}${x.href}`, { headers })
            if (!res.ok) throw new Error(`Couldn't read the file (HTTP ${res.status})`)
            const blob = await res.blob()
            // Uploading by path creates any missing sub-folders (e.g. Invoices/2026); replace keeps one copy
            await call(`/drives/${t.driveId}/items/${t.folderId}:/${graphPath(x.folder, x.name)}:/content?@microsoft.graph.conflictBehavior=replace`, {
              method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            })
            uploaded.push({ key: x.key, version: x.version })
          } catch (e) {
            failed.push({ key: x.key, error: `${x.folder}/${x.name}: ${e.message}` })
          }
          done += 1
          setProgress((p) => ({ ...p, done }))
        }
      }
      await Promise.all(Array.from({ length: PARALLEL }, worker))
      const { run } = await request('/sharepoint-sync/runs', {
        method: 'POST', body: { uploaded, failed, skipped: items.length - todo.length, durationMs: Date.now() - started },
      })
      if (run.failed) setError(`${run.failed} file${run.failed === 1 ? '' : 's'} couldn't be uploaded — ${failed[0].error}`)
      onToast(run.failed
        ? { kind: 'error', text: `Synced ${run.uploaded} file${run.uploaded === 1 ? '' : 's'}; ${run.failed} failed.` }
        : { kind: 'success', text: run.uploaded ? `Uploaded ${run.uploaded} file${run.uploaded === 1 ? '' : 's'} to SharePoint (${run.skipped} unchanged).` : 'SharePoint is up to date — nothing new to upload.' })
      onChanged?.()
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(null)
      setProgress(null)
      setReload((n) => n + 1)
    }
  }

  const changeLocation = async () => {
    await request('/sharepoint-sync/target', { method: 'PUT', body: { clear: true } }).catch(() => {})
    setReload((n) => n + 1)
  }

  if (loadError) return <section className="u-card m365-sync"><p className="m365-sync-last warn" role="alert"><CircleAlert size={14} />{loadError}</p></section>
  if (!info) return null
  const t = info.target
  const pending = info.summary.reduce((n, s) => n + s.pending, 0)
  const last = info.runs?.[0]

  return (
    <section className="u-card m365-sync">
      <header className="m365-sync-head">
        <span className="m365-sync-icon"><FolderSync size={20} /></span>
        <div>
          <h3>{info.rootFolder} – SharePoint Folder Sync</h3>
          {t ? (
            <p className="m365-sync-where">
              {t.siteName}<ChevronRight size={12} />{t.driveName}<ChevronRight size={12} /><strong>{info.rootFolder}</strong>
              <a href={t.webUrl} target="_blank" rel="noreferrer" className="ai-link"><ExternalLink size={12} />Open in SharePoint</a>
            </p>
          ) : <p className="u-muted">Keeps a folder per kind of file in SharePoint: {info.folders.join(', ')}.</p>}
        </div>
        <div className="m365-sync-actions">
          {t ? (
            <>
              <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={changeLocation} disabled={Boolean(busy)}>Change Location</button>
              <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={() => sync()} disabled={Boolean(busy)}>
                <RefreshCw size={13} className={busy === 'sync' ? 'm365-spin' : undefined} />{busy === 'sync' ? 'Syncing…' : `Sync Now${pending ? ` (${pending})` : ''}`}
              </button>
            </>
          ) : (
            <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={create} disabled={Boolean(busy)}>
              <FolderPlus size={13} />{busy === 'create' ? 'Creating…' : busy === 'sync' ? 'Uploading…' : `Create Folder & Sync${site && drive ? ` in ${drive.name}` : ''}`}
            </button>
          )}
        </div>
      </header>

      <ul className="m365-sync-folders">
        {info.summary.map((s) => {
          const Icon = ICONS[s.folder] ?? FileText
          return (
            <li key={s.folder}>
              <Icon size={16} />
              <span><strong>{s.folder}</strong><small>{s.total} file{s.total === 1 ? '' : 's'}{t ? (s.pending ? ` · ${s.pending} to upload` : ' · up to date') : ''}</small></span>
            </li>
          )
        })}
      </ul>

      {progress && (
        <div className="m365-sync-progress" role="status">
          <div className="m365-sync-bar"><span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} /></div>
          <small>{progress.total ? `Uploading ${progress.done} of ${progress.total}${progress.current ? ` · ${progress.current}` : ''}` : 'Checking folders…'}</small>
        </div>
      )}
      {!progress && last && (
        <p className={`m365-sync-last${last.failed ? ' warn' : ''}`}>
          {last.failed ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
          Last sync {fmtDateTime(last.at)} by {last.by}: {last.uploaded} uploaded, {last.skipped} unchanged{last.failed ? `, ${last.failed} failed` : ''}.
        </p>
      )}
      {error && <p className="m365-sync-last warn" role="alert"><CircleAlert size={14} />{error}</p>}
      {!t && !error && (
        <p className="u-muted m365-sync-hint">
          {site && drive
            ? <>The folder will be created in <strong>{site.displayName || site.name} › {drive.name}</strong> (the library open below).</>
            : <>The folder will be created in your main SharePoint site’s <strong>Documents</strong> library — or open another site and library below first.</>}
        </p>
      )}
    </section>
  )
}
