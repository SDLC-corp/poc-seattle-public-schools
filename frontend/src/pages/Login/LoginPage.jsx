import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import {
  School, ShieldCheck, Layers, ClipboardCheck, CalendarDays, FolderOpen, CircleAlert, Info, Loader, LogOut, ArrowRight,
  BadgeCheck, History, KeyRound, UsersRound, LifeBuoy,
} from 'lucide-react'
import { useAuth } from '../../auth/authContext'
import { takeLoginError, takeSignedOut, entraTenant, redirectUri } from '../../auth/msalConfig'
import { findNav } from '../../components/layout/navItems'
import './login.css'

// Microsoft's four-square mark, as used on "Sign in with Microsoft" buttons
function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

// Faint floor-plan line drawing behind the brand panel (decorative)
function PlanPattern() {
  return (
    <svg className="login-plan" viewBox="0 0 600 600" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="60" y="60" width="480" height="480" rx="4" />
        <path d="M60 230h200v-170M260 230h120v-170M380 230h160M60 370h480M200 370v170M330 370v170M440 370v80h100" />
        <path d="M150 230v-30M320 230v-24M470 230v-28M120 370v26M270 370v22M390 370v26" strokeDasharray="2 6" />
      </g>
      <g fill="currentColor">
        <circle cx="160" cy="145" r="5" /><circle cx="320" cy="145" r="5" /><circle cx="460" cy="145" r="5" />
        <circle cx="130" cy="455" r="5" /><circle cx="265" cy="455" r="5" /><circle cx="490" cy="410" r="5" />
      </g>
    </svg>
  )
}

const FEATURES = [
  { icon: Layers, title: 'ACM inventory', text: 'Every material mapped to its room on the floor plan.' },
  { icon: ClipboardCheck, title: 'Inspections & surveillance', text: 'Assign, record, review and approve on schedule.' },
  { icon: CalendarDays, title: 'Outlook calendar & mail', text: 'Inspections on your calendar, notices from your mailbox.' },
  { icon: FolderOpen, title: 'SharePoint documents', text: 'Management plans and lab reports in district libraries.' },
]

const TRUST = [
  { icon: BadgeCheck, text: 'Built around AHERA (40 CFR 763)' },
  { icon: History, text: 'Every change in the audit trail' },
  { icon: KeyRound, text: 'Microsoft Entra single sign-on' },
]

// "Sign in to continue to Inspections" — names the page the user was sent here from
function destinationLabel(path) {
  if (!path || path === '/') return null
  const nav = findNav(path.split('?')[0])
  return nav ? (nav.child?.label ?? nav.item.label) : null
}

export default function LoginPage() {
  const { configured, ready, account, signIn, takePostLoginPath } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState(() => takeLoginError())
  const [signedOut] = useState(() => takeSignedOut())
  const [busy, setBusy] = useState(false)
  const from = location.state?.from && location.state.from !== '/login' ? location.state.from : '/'
  const destination = destinationLabel(from)
  const [year] = useState(() => new Date().getFullYear())

  // Back from Microsoft (or already signed in): continue where the user was going
  if (account) return <Navigate to={takePostLoginPath() || from} replace />

  const start = async () => {
    setError(null)
    setBusy(true)
    try {
      await signIn(from)
    } catch (err) {
      setError(err.errorMessage || err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand">
        <PlanPattern />
        <div className="login-brand-inner">
          <div className="login-mark">
            <span className="login-logo"><School size={24} /></span>
            <span>Seattle Public Schools<small>Environmental Health &amp; Safety</small></span>
          </div>

          <h1>Asbestos Reporting &amp; Compliance Management</h1>
          <p className="login-lead-brand">
            One place to track asbestos-containing materials, inspections and AHERA compliance across every school building.
          </p>

          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="login-feature-icon"><Icon size={18} /></span>
                <span><strong>{title}</strong>{text}</span>
              </li>
            ))}
          </ul>

          <ul className="login-trust">
            {TRUST.map(({ icon: Icon, text }) => <li key={text}><Icon size={14} />{text}</li>)}
          </ul>
        </div>
      </section>

      <main className="login-main">
        <div className="login-mobile-brand">
          <span className="login-logo"><School size={20} /></span>
          <span>Seattle Public Schools<small>Asbestos Reporting &amp; Compliance</small></span>
        </div>

        <div className="login-card">
          <h2>Welcome back</h2>
          <p className="login-lead">Sign in with your district Microsoft 365 account to continue.</p>

          {signedOut && !error && (
            <div className="login-alert ok" role="status">
              <LogOut size={16} />
              <div><strong>You’ve signed out</strong><span>Close the browser on shared computers to finish your session.</span></div>
            </div>
          )}
          {destination && !error && (
            <div className="login-alert info" role="status">
              <ArrowRight size={16} />
              <div><span>Sign in to continue to <strong>{destination}</strong>.</span></div>
            </div>
          )}
          {error && (
            <div className="login-alert error" role="alert">
              <CircleAlert size={16} />
              <div>
                <strong>Sign-in didn’t complete</strong>
                <span>{error}</span>
                <span className="login-alert-hint">Try again. If it keeps failing, send this message to your EHS administrator.</span>
              </div>
            </div>
          )}

          {configured ? (
            <>
              <button type="button" className="ms-btn" onClick={start} disabled={busy || !ready} autoFocus>
                {busy || !ready ? <Loader size={18} className="spin" /> : <MicrosoftLogo />}
                <span>{busy ? 'Redirecting to Microsoft…' : !ready ? 'Checking your session…' : 'Sign in with Microsoft'}</span>
              </button>

              <div className="login-points">
                <p><ShieldCheck size={15} /><span>Your password and multi-factor sign-in stay with Microsoft — this app never sees them.</span></p>
                <p><UsersRound size={15} /><span>For district staff, accredited inspectors and contractors with a district-issued account{entraTenant === 'organizations' ? ' (any work or school account is accepted in this environment)' : ''}.</span></p>
              </div>

              <div className="login-help">
                <LifeBuoy size={15} />
                <span><strong>Can’t sign in?</strong> Your account may not have access yet. Ask your EHS administrator to add you to the asbestos program.</span>
              </div>
            </>
          ) : (
            <>
              <div className="login-alert info">
                <Info size={16} />
                <div>
                  <strong>Microsoft sign-in isn’t set up yet</strong>
                  <span>Add the Entra app registration to <code>frontend/.env</code> and restart the dev server:</span>
                  <pre>{`VITE_ENTRA_CLIENT_ID=<application (client) id>
VITE_ENTRA_TENANT_ID=<directory (tenant) id>`}</pre>
                  <span>In Entra, add a <b>Single-page application</b> platform with the redirect URI <code>{redirectUri}</code>.</span>
                </div>
              </div>
              <button type="button" className="ms-btn" disabled><MicrosoftLogo /><span>Sign in with Microsoft</span></button>
              <button type="button" className="u-btn u-btn-outline login-demo" onClick={() => navigate(from === '/' ? '/dashboard' : from)}>Continue in demo mode</button>
            </>
          )}
        </div>

        <footer className="login-foot">
          <span>Authorized use only. Sign-ins and changes are recorded in the audit log.</span>
          <span>© {year} Seattle Public Schools</span>
        </footer>
      </main>
    </div>
  )
}
