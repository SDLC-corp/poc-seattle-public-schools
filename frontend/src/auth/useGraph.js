import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './authContext'
import { SCOPES } from './msalConfig'
import { graph } from './graph'

/**
 * One Microsoft 365 service ('login' | 'outlook' | 'sharepoint') for the signed-in user.
 * status: notConfigured | signedOut | checking | connected | needsConsent | error
 */
export function useGraph(service) {
  const { configured, account, getToken } = useAuth()
  const scopes = SCOPES[service]
  const [state, setState] = useState({ key: null, status: 'checking', error: null })
  const key = `${account?.id ?? ''}:${service}`

  // Is it already consented? (silent token, no popup)
  useEffect(() => {
    if (!configured || !account) return undefined
    let cancelled = false
    getToken(scopes)
      .then(() => { if (!cancelled) setState({ key, status: 'connected', error: null }) })
      .catch((e) => { if (!cancelled) setState({ key, status: e.consentRequired ? 'needsConsent' : 'error', error: e.consentRequired ? null : e.message }) })
    return () => { cancelled = true }
  }, [configured, account, getToken, scopes, key])

  const status = !configured ? 'notConfigured' : !account ? 'signedOut' : state.key === key ? state.status : 'checking'

  // Opens Microsoft's consent / sign-in popup
  const connect = useCallback(async () => {
    try {
      await getToken(scopes, { interactive: true })
      setState({ key, status: 'connected', error: null })
      return true
    } catch (e) {
      setState({ key, status: e.consentRequired ? 'needsConsent' : 'error', error: e.message })
      return false
    }
  }, [getToken, scopes, key])

  const call = useCallback(async (path, opts) => graph(await getToken(scopes, { interactive: true }), path, opts), [getToken, scopes])

  return { status, error: state.key === key ? state.error : null, connect, call, scopes }
}
