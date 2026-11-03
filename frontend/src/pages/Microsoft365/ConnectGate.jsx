import { Link } from 'react-router'
import { Plug, Loader, CircleAlert, LogIn } from 'lucide-react'

// Shown in place of a service's content until the user has connected (consented to) it
export default function ConnectGate({ g, name, what, children }) {
  if (g.status === 'connected') return children
  if (g.status === 'checking') return <div className="m365-gate"><Loader size={22} className="spin" /><span>Checking your {name} connection…</span></div>
  if (g.status === 'notConfigured') {
    return (
      <div className="m365-gate">
        <CircleAlert size={24} />
        <strong>Microsoft sign-in isn’t set up</strong>
        <span>Add the Entra app registration (see the sign-in page) to use {name}.</span>
        <Link to="/login" className="u-btn u-btn-outline u-btn-sm">Open sign-in page</Link>
      </div>
    )
  }
  if (g.status === 'signedOut') {
    return <div className="m365-gate"><LogIn size={24} /><strong>Sign in with Microsoft</strong><Link to="/login" className="u-btn u-btn-primary u-btn-sm">Sign in</Link></div>
  }
  return (
    <div className="m365-gate">
      <Plug size={26} />
      <strong>Connect {name}</strong>
      <span>{what}</span>
      <code className="m365-scopes">{g.scopes.join(' · ')}</code>
      {g.error && <span className="uf-error">{g.error}</span>}
      <button type="button" className="u-btn u-btn-primary" onClick={g.connect}><Plug size={15} />Connect {name}</button>
      <small className="u-muted">Microsoft asks you to approve these permissions. Some need an administrator’s consent in your tenant.</small>
    </div>
  )
}
