import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './authContext'
import { SCOPES } from './msalConfig'
import { graph, graphTime } from './graph'
import { M365Context, SERVICES } from './m365Context'

const REFRESH_MS = 10 * 60 * 1000

// What each service shows on the Integrations tab (one small Graph read each)
const LOADERS = {
  async entra(token) {
    const [me, org] = await Promise.all([
      graph(token, '/me?$select=displayName,mail,userPrincipalName,jobTitle,department'),
      graph(token, '/organization?$select=displayName,verifiedDomains').catch(() => null),
    ])
    const o = org?.value?.[0]
    return {
      name: me.displayName,
      email: me.mail || me.userPrincipalName,
      jobTitle: [me.jobTitle, me.department].filter(Boolean).join(' · ') || null,
      organization: o?.displayName ?? null,
      domain: o?.verifiedDomains?.find((d) => d.isDefault)?.name ?? null,
    }
  },
  async mail(token) {
    const [inbox, me] = await Promise.all([
      graph(token, '/me/mailFolders/inbox?$select=unreadItemCount,totalItemCount'),
      graph(token, '/me?$select=mail,userPrincipalName'),
    ])
    return { mailbox: me.mail || me.userPrincipalName, unread: inbox.unreadItemCount, total: inbox.totalItemCount }
  },
  async calendar(token) {
    const start = new Date()
    const end = new Date(start.getTime() + 7 * 86400000)
    const [cal, view] = await Promise.all([
      graph(token, '/me/calendar?$select=name,owner'),
      graph(token, `/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start`),
    ])
    const next = view.value[0]
    return {
      calendar: cal.name,
      owner: cal.owner?.address ?? null,
      upcoming7d: view.value.length,
      next: next ? { subject: next.subject, at: graphTime(next.start)?.toISOString() ?? null } : null,
    }
  },
  async sharepoint(token) {
    const [root, followed] = await Promise.all([
      graph(token, '/sites/root?$select=displayName,webUrl'),
      graph(token, '/me/followedSites?$select=id').catch(() => ({ value: [] })),
    ])
    return { rootSite: root.displayName, rootUrl: root.webUrl, followed: followed.value.length }
  },
}

const initial = () => Object.fromEntries(SERVICES.map((s) => [s.id, { status: 'checking', details: null, lastSync: null, error: null }]))

/**
 * Connects Microsoft 365 automatically when the app starts: as soon as there is a signed-in
 * account it checks every service silently (no popups), then again every 10 minutes and when
 * the tab regains focus after a while. Services that still need consent wait for a click.
 */
export default function M365Provider({ children }) {
  const { configured, account, getToken } = useAuth()
  const [services, setServices] = useState(initial)
  const lastRun = useRef(0)

  const update = (id, patch) => setServices((s) => ({ ...s, [id]: { ...s[id], ...patch } }))

  const syncOne = useCallback(async (svc, { interactive = false } = {}) => {
    update(svc.id, { status: 'checking' })
    try {
      const token = await getToken(SCOPES[svc.scopeKey], { interactive })
      const details = await LOADERS[svc.id](token)
      update(svc.id, { status: 'connected', details, lastSync: new Date().toISOString(), error: null })
    } catch (err) {
      update(svc.id, err.consentRequired
        ? { status: 'needsConsent', error: null }
        : { status: 'error', error: err.message })
    }
  }, [getToken])

  const sync = useCallback(async (id) => {
    lastRun.current = Date.now()
    await Promise.all(SERVICES.filter((s) => !id || s.id === id).map((s) => syncOne(s)))
  }, [syncOne])

  const connect = useCallback(async (id) => {
    const svc = SERVICES.find((s) => s.id === id)
    await syncOne(svc, { interactive: true })
    // Outlook consent covers mail and calendar together
    await Promise.all(SERVICES.filter((s) => s.scopeKey === svc.scopeKey && s.id !== id).map((s) => syncOne(s)))
  }, [syncOne])

  // Auto-connect on start / sign-in, then keep fresh
  useEffect(() => {
    if (!configured || !account) return undefined
    sync()
    const timer = setInterval(() => sync(), REFRESH_MS)
    const onFocus = () => { if (Date.now() - lastRun.current > REFRESH_MS / 2) sync() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [configured, account, sync])

  const value = useMemo(() => {
    const base = !configured ? 'notConfigured' : !account ? 'signedOut' : null
    const shown = base ? Object.fromEntries(SERVICES.map((s) => [s.id, { status: base, details: null, lastSync: null, error: null }])) : services
    return { services: shown, sync, connect }
  }, [configured, account, services, sync, connect])

  return <M365Context.Provider value={value}>{children}</M365Context.Provider>
}
