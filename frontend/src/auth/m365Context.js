import { createContext, useContext } from 'react'

/**
 * Live Microsoft 365 connections for the signed-in user.
 * services: { [id]: { status, details, lastSync, error } } with id ∈ entra | mail | calendar | sharepoint
 * status: notConfigured | signedOut | checking | connected | needsConsent | error
 * sync(id?) re-checks silently; connect(id) opens Microsoft's consent popup (needs a click).
 */
export const M365Context = createContext(null)
export const useM365 = () => useContext(M365Context)

export const SERVICES = [
  { id: 'entra', scopeKey: 'login', name: 'Microsoft Entra ID', icon: 'microsoft' },
  { id: 'mail', scopeKey: 'outlook', name: 'Outlook Mail', icon: 'outlook' },
  { id: 'calendar', scopeKey: 'outlook', name: 'Outlook Calendar', icon: 'outlook' },
  { id: 'sharepoint', scopeKey: 'sharepoint', name: 'SharePoint Online', icon: 'sharepoint' },
]
