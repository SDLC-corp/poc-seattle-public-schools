import { useCallback, useMemo } from 'react'
import { MsalProvider, useMsal } from '@azure/msal-react'
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser'
import { msalInstance, entraConfigured, SCOPES, rememberPostLoginPath, takePostLoginPath, markSignedOut } from './msalConfig'
import { AuthContext } from './authContext'

function MsalAuth({ children }) {
  const { instance, inProgress, accounts } = useMsal()
  const account = instance.getActiveAccount() ?? accounts[0] ?? null

  const signIn = useCallback((from) => {
    rememberPostLoginPath(from)
    return instance.loginRedirect({ scopes: SCOPES.login, prompt: 'select_account' })
  }, [instance])

  const signOut = useCallback(() => {
    markSignedOut()
    return instance.logoutRedirect({ account })
  }, [instance, account])

  /**
   * Access token for Microsoft Graph. Silent first; `interactive` opens a consent/sign-in popup
   * when Entra needs the user (first use of Outlook or SharePoint, or an expired session).
   */
  const getToken = useCallback(async (scopes, { interactive = false } = {}) => {
    if (!account) throw new Error('Sign in with Microsoft first')
    try {
      return (await instance.acquireTokenSilent({ scopes, account })).accessToken
    } catch (err) {
      if (!(err instanceof InteractionRequiredAuthError) || !interactive) {
        const e = new Error(err instanceof InteractionRequiredAuthError ? 'consent_required' : (err.errorMessage || err.message))
        e.consentRequired = err instanceof InteractionRequiredAuthError
        throw e
      }
      return (await instance.acquireTokenPopup({ scopes, account })).accessToken
    }
  }, [instance, account])

  const value = useMemo(() => ({
    configured: true,
    ready: inProgress === InteractionStatus.None,
    account: account && { name: account.name || account.username, email: account.username, tenantId: account.tenantId, id: account.localAccountId },
    signIn,
    signOut,
    getToken,
    takePostLoginPath,
  }), [inProgress, account, signIn, signOut, getToken])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Without an Entra app registration the app runs in demo mode (no sign-in, no Microsoft 365)
const DEMO = {
  configured: false,
  ready: true,
  account: null,
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  getToken: () => Promise.reject(new Error('Microsoft sign-in is not configured')),
  takePostLoginPath: () => null,
}

export default function AuthProvider({ children }) {
  if (!entraConfigured) return <AuthContext.Provider value={DEMO}>{children}</AuthContext.Provider>
  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuth>{children}</MsalAuth>
    </MsalProvider>
  )
}
