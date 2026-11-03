import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Mail, CalendarDays, FolderOpen, CircleCheck, Plug, CircleAlert, Loader, LogOut, KeyRound } from 'lucide-react'
import { useAuth } from '../../auth/authContext'
import { useGraph } from '../../auth/useGraph'
import { graph } from '../../auth/graph'
import { SCOPES, entraTenant } from '../../auth/msalConfig'

const STATUS = {
  connected: { icon: CircleCheck, label: 'Connected', cls: 'ok' },
  needsConsent: { icon: Plug, label: 'Not connected', cls: 'off' },
  checking: { icon: Loader, label: 'Checking…', cls: 'off' },
  error: { icon: CircleAlert, label: 'Error', cls: 'err' },
  signedOut: { icon: Plug, label: 'Sign in first', cls: 'off' },
  notConfigured: { icon: CircleAlert, label: 'Not set up', cls: 'off' },
}

function ServiceCard({ icon: Icon, name, text, g, links }) {
  const s = STATUS[g.status]
  return (
    <article className="u-card m365-service">
      <header>
        <span className="m365-service-icon"><Icon size={20} /></span>
        <div>
          <h3>{name}</h3>
          <span className={`m365-pill ${s.cls}`}><s.icon size={12} className={g.status === 'checking' ? 'spin' : undefined} />{s.label}</span>
        </div>
      </header>
      <p>{text}</p>
      <code className="m365-scopes">{g.scopes.join(' · ')}</code>
      {g.error && <p className="uf-error">{g.error}</p>}
      <footer>
        {g.status === 'needsConsent' || g.status === 'error'
          ? <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={g.connect}><Plug size={13} />Connect</button>
          : g.status === 'connected' && links.map(([to, label]) => <Link key={to} to={to} className="u-btn u-btn-outline u-btn-sm">{label}</Link>)}
      </footer>
    </article>
  )
}

export default function OverviewTab() {
  const { configured, account, signOut, getToken } = useAuth()
  const outlook = useGraph('outlook')
  const sharepoint = useGraph('sharepoint')
  const [profile, setProfile] = useState(null)
  const [photo, setPhoto] = useState(null)

  // Profile and photo need only the sign-in permission (User.Read)
  useEffect(() => {
    if (!account) return undefined
    let cancelled = false
    let url = null
    getToken(SCOPES.login).then(async (token) => {
      const me = await graph(token, '/me?$select=displayName,mail,userPrincipalName,jobTitle,department,officeLocation,businessPhones')
      if (!cancelled) setProfile(me)
      try {
        const res = await graph(token, '/me/photos/96x96/$value', { raw: true })
        url = URL.createObjectURL(await res.blob())
        if (!cancelled) setPhoto(url)
      } catch { /* no photo */ }
    }).catch(() => {})
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [account, getToken])

  const initials = (account?.name ?? 'Demo User').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="m365-overview">
      <section className="u-card m365-account">
        <div className="m365-avatar">{photo ? <img src={photo} alt="" /> : initials}</div>
        <div className="m365-account-text">
          <h2>{profile?.displayName ?? account?.name ?? 'Not signed in'}</h2>
          <span>{profile?.mail ?? account?.email ?? (configured ? 'Sign in to connect Microsoft 365' : 'Demo mode — Microsoft sign-in isn’t set up')}</span>
          {profile && <small>{[profile.jobTitle, profile.department, profile.officeLocation].filter(Boolean).join(' · ') || 'No job details in the directory'}</small>}
        </div>
        <dl className="m365-facts">
          <div><dt>Identity provider</dt><dd>Microsoft Entra ID</dd></div>
          <div><dt>Tenant</dt><dd className="m365-mono">{account?.tenantId ?? entraTenant}</dd></div>
          <div><dt>Sign-in permissions</dt><dd className="m365-mono">{SCOPES.login.join(' ')}</dd></div>
        </dl>
        {account
          ? <button type="button" className="u-btn u-btn-outline" onClick={signOut}><LogOut size={15} />Sign out</button>
          : <Link to="/login" className="u-btn u-btn-primary"><KeyRound size={15} />Sign in</Link>}
      </section>

      <div className="m365-services">
        <ServiceCard icon={Mail} name="Outlook Mail" g={outlook} links={[['/microsoft-365/mail', 'Open Mail']]}
          text="Read your inbox and send compliance notices from your own mailbox." />
        <ServiceCard icon={CalendarDays} name="Outlook Calendar" g={outlook} links={[['/microsoft-365/calendar', 'Open Calendar']]}
          text="See upcoming events and add scheduled inspections to your calendar." />
        <ServiceCard icon={FolderOpen} name="SharePoint" g={sharepoint} links={[['/microsoft-365/sharepoint', 'Browse Libraries']]}
          text="Browse district sites and document libraries, open files and upload reports." />
      </div>
    </div>
  )
}
