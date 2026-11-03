import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { RefreshCw, ExternalLink, CircleCheck, Plug, CircleAlert, Loader, LogIn, Info, ArrowRight } from 'lucide-react'
import { useM365, SERVICES } from '../../auth/m365Context'
import { entraClientId, entraTenant } from '../../auth/msalConfig'
import { timeAgo } from '../../lib/timeAgo'
import { fmtDateTime } from '../../lib/api'

// Microsoft logo (four squares) for Microsoft Entra ID / the Microsoft account
function MicrosoftLogo() {
  return (
    <svg className="lc-icon" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
// Official Microsoft 365 product icons (Fluent brand icons) in /public/integrations
const Icon = ({ name }) => (name === 'microsoft' ? <MicrosoftLogo /> : <img className="lc-icon" src={`/integrations/${name}.svg`} alt="" />)

const STATUS = {
  connected: { label: 'Connected', icon: CircleCheck, cls: 'ok' },
  checking: { label: 'Connecting…', icon: Loader, cls: 'busy' },
  needsConsent: { label: 'Needs approval', icon: Plug, cls: 'off' },
  error: { label: 'Error', icon: CircleAlert, cls: 'err' },
  signedOut: { label: 'Not signed in', icon: LogIn, cls: 'off' },
  notConfigured: { label: 'Not set up', icon: Info, cls: 'off' },
}

const nextEvent = (n) => (n ? `${n.subject || '(no title)'} · ${new Date(n.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Nothing in the next 7 days')

// Per service: detail rows and links (external = opens Microsoft 365; internal = this app)
function view(id, d) {
  switch (id) {
    case 'entra': return {
      rows: [['Account', d?.name], ['Email', d?.email], ['Organization', d?.organization ? `${d.organization}${d.domain ? ` (${d.domain})` : ''}` : null], ['Tenant', entraTenant]],
      links: [
        ['https://myaccount.microsoft.com/', 'My account'],
        ...(entraClientId ? [[`https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/${entraClientId}`, 'App registration']] : []),
      ],
    }
    case 'mail': return {
      rows: [['Mailbox', d?.mailbox], ['Inbox', d ? `${d.unread.toLocaleString('en-US')} unread of ${d.total.toLocaleString('en-US')}` : null]],
      links: [['https://outlook.office.com/mail/', 'Open Outlook'], ['/microsoft-365/mail', 'Mail in app']],
    }
    case 'calendar': return {
      rows: [['Calendar', d?.calendar], ['Next 7 days', d ? `${d.upcoming7d} event${d.upcoming7d === 1 ? '' : 's'}` : null], ['Next event', d ? nextEvent(d.next) : null]],
      links: [['https://outlook.office.com/calendar/', 'Open Calendar'], ['/microsoft-365/calendar', 'Calendar in app']],
    }
    default: return {
      rows: [['Home site', d?.rootSite], ['Followed sites', d ? String(d.followed) : null]],
      links: [...(d?.rootUrl ? [[d.rootUrl, 'Open SharePoint']] : []), ['/microsoft-365/sharepoint', 'Browse in app']],
    }
  }
}

function LiveCard({ svc, state, now, onSync, onConnect }) {
  const s = STATUS[state.status]
  const { rows, links } = view(svc.id, state.details)
  const connected = state.status === 'connected'
  return (
    <article className={`lc-card ${s.cls}`}>
      <header>
        <Icon name={svc.icon} />
        <div className="lc-title">
          <h3>{svc.name}</h3>
          <span className={`lc-pill ${s.cls}`}><s.icon size={12} className={state.status === 'checking' ? 'spin' : undefined} />{s.label}</span>
        </div>
        {connected && (
          <button type="button" className="u-row-btn" onClick={onSync} aria-label={`Refresh ${svc.name}`} title="Refresh now"><RefreshCw size={14} /></button>
        )}
      </header>

      {connected && (
        <dl className="lc-rows">
          {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {state.status === 'needsConsent' && (
        <div className="lc-msg">
          <span>Approve access once with your Microsoft account. After that it connects automatically.</span>
          <button type="button" className="u-btn u-btn-primary u-btn-sm" onClick={onConnect}><Plug size={13} />Connect</button>
        </div>
      )}
      {state.status === 'error' && (
        <div className="lc-msg err">
          <span>{state.error}</span>
          <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={onConnect}><RefreshCw size={13} />Retry</button>
        </div>
      )}
      {state.status === 'signedOut' && (
        <div className="lc-msg"><span>Sign in with Microsoft to connect.</span><Link to="/login" className="u-btn u-btn-primary u-btn-sm"><LogIn size={13} />Sign in</Link></div>
      )}
      {state.status === 'notConfigured' && <div className="lc-msg"><span>Add the Entra app registration to <code>frontend/.env</code> to enable.</span></div>}
      {state.status === 'checking' && !state.lastSync && <div className="lc-msg"><span>Connecting with your Microsoft account…</span></div>}

      <footer>
        <span className="lc-sync" title={state.lastSync ? fmtDateTime(state.lastSync) : undefined}>
          <RefreshCw size={12} />Last synced {state.lastSync ? timeAgo(state.lastSync, now) : 'never'}
        </span>
        {(connected || state.status === 'checking') && (
          <span className="lc-links">
            {links.map(([href, label]) => (href.startsWith('/')
              ? <Link key={href} to={href}><ArrowRight size={12} />{label}</Link>
              : <a key={href} href={href} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{label}</a>))}
          </span>
        )}
      </footer>
    </article>
  )
}

/**
 * Microsoft 365 for the signed-in user. Connected automatically at app start (see M365Provider),
 * using delegated Microsoft Graph permissions — no secrets stored by this app.
 */
export default function LiveConnections() {
  const { services, sync, connect } = useM365()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000) // keep "x min ago" current
    return () => clearInterval(t)
  }, [])

  const list = Object.values(services)
  const connected = list.filter((s) => s.status === 'connected').length
  const busy = list.some((s) => s.status === 'checking')
  const latest = list.map((s) => s.lastSync).filter(Boolean).sort().at(-1)

  return (
    <section className="lc">
      <div className="lc-head">
        <div>
          <h2>Microsoft 365</h2>
          <p>Connects automatically with your Microsoft account when the app starts and refreshes every 10 minutes.</p>
        </div>
        <div className="lc-head-side">
          <span className="lc-count"><strong>{connected}</strong>/{list.length} connected{latest ? ` · synced ${timeAgo(latest, now)}` : ''}</span>
          <button type="button" className="u-btn u-btn-outline u-btn-sm" onClick={() => sync()} disabled={busy || services.entra.status === 'signedOut' || services.entra.status === 'notConfigured'}>
            <RefreshCw size={13} className={busy ? 'spin' : undefined} />Sync all
          </button>
        </div>
      </div>
      <div className="lc-grid">
        {SERVICES.map((svc) => (
          <LiveCard key={svc.id} svc={svc} state={services[svc.id]} now={now} onSync={() => sync(svc.id)} onConnect={() => connect(svc.id)} />
        ))}
      </div>
    </section>
  )
}
