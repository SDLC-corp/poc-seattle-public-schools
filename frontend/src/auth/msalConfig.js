import { PublicClientApplication, EventType } from '@azure/msal-browser'

/**
 * Microsoft Entra ID sign-in (single-page app, auth code + PKCE). Only public values live here:
 * the app registration's client ID and the tenant. There is no client secret in the browser.
 *
 *   VITE_ENTRA_CLIENT_ID   Application (client) ID of an app registration with a "Single-page application"
 *                          platform and the redirect URI <origin>/login (e.g. http://localhost:5173/login)
 *   VITE_ENTRA_TENANT_ID   Directory (tenant) ID, or "organizations" for any work account
 *   VITE_ENTRA_REDIRECT_URI  Optional; must exactly match a redirect URI on the app registration
 *                          (defaults to <origin>/login)
 */
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID?.trim() || ''
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID?.trim() || 'organizations'

export const entraConfigured = Boolean(clientId)
export const entraClientId = clientId
export const entraTenant = tenantId
export const redirectPath = '/login'
export const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI?.trim() || `${window.location.origin}${redirectPath}`

// Where to go after the Microsoft round trip (the redirect URI may be the site root)
const POST_LOGIN_KEY = 'post-login-path'
export const rememberPostLoginPath = (path) => {
  try { sessionStorage.setItem(POST_LOGIN_KEY, path || '/') } catch { /* storage unavailable */ }
}
export const takePostLoginPath = () => {
  try {
    const p = sessionStorage.getItem(POST_LOGIN_KEY)
    sessionStorage.removeItem(POST_LOGIN_KEY)
    return p
  } catch {
    return null
  }
}

// Delegated Microsoft Graph permissions. Sign-in asks only for the basics; Outlook and SharePoint
// are consented to separately when the user connects them (incremental consent).
export const SCOPES = {
  login: ['openid', 'profile', 'email', 'User.Read'],
  outlook: ['Mail.Read', 'Mail.Send', 'Calendars.ReadWrite'],
  sharepoint: ['Sites.Read.All', 'Files.ReadWrite.All'],
}

export const msalInstance = entraConfigured
  ? new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
    },
    // Signed-in state ends with the browser tab
    cache: { cacheLocation: 'sessionStorage' },
  })
  : null

// Set just before sign-out so the sign-in page can confirm it once
const SIGNED_OUT_KEY = 'entra-signed-out'
export const markSignedOut = () => {
  try { sessionStorage.setItem(SIGNED_OUT_KEY, '1') } catch { /* storage unavailable */ }
}
export const takeSignedOut = () => {
  try {
    const v = sessionStorage.getItem(SIGNED_OUT_KEY) === '1'
    sessionStorage.removeItem(SIGNED_OUT_KEY)
    return v
  } catch {
    return false
  }
}

const LOGIN_ERROR_KEY = 'entra-login-error'
export const takeLoginError = () => {
  try {
    const v = sessionStorage.getItem(LOGIN_ERROR_KEY)
    sessionStorage.removeItem(LOGIN_ERROR_KEY)
    return v
  } catch {
    return null
  }
}

// Must run before the app renders: finishes a sign-in redirect and picks the active account
export async function initAuth() {
  if (!msalInstance) return
  await msalInstance.initialize()
  msalInstance.addEventCallback((e) => {
    if ((e.eventType === EventType.LOGIN_SUCCESS || e.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) && e.payload?.account) {
      msalInstance.setActiveAccount(e.payload.account)
    }
  })
  try {
    const result = await msalInstance.handleRedirectPromise()
    if (result?.account) {
      msalInstance.setActiveAccount(result.account)
      // Back from Microsoft: continue to the page the user was heading for
      const next = takePostLoginPath()
      if (next && next.startsWith('/') && !next.startsWith('//')) window.history.replaceState(null, '', next)
    }
  } catch (err) {
    try { sessionStorage.setItem(LOGIN_ERROR_KEY, err.errorMessage || err.message || 'Sign-in failed') } catch { /* storage unavailable */ }
  }
  if (!msalInstance.getActiveAccount()) {
    const [first] = msalInstance.getAllAccounts()
    if (first) msalInstance.setActiveAccount(first)
  }
}
