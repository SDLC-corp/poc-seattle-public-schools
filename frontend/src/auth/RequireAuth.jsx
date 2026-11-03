import { Navigate, useLocation } from 'react-router'
import { useAuth } from './authContext'

// With Entra configured, every app page needs a signed-in Microsoft account
export default function RequireAuth({ children }) {
  const { configured, ready, account } = useAuth()
  const location = useLocation()
  if (!configured || account) return children
  if (!ready) return <div className="auth-wait" role="status">Signing you in…</div>
  return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
}
