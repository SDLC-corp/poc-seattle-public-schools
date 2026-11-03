import { createContext, useContext } from 'react'

// { configured, ready, account: { name, email, tenantId, id } | null, signIn(from), signOut(), getToken(scopes, { interactive }) }
export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)
