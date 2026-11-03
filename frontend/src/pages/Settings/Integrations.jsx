import { useCallback, useEffect, useState } from 'react'
import {
  KeyRound, Share2, Mail, Database, PlugZap, Unplug, RefreshCw, FlaskConical, Settings2, CircleCheck,
  CircleAlert, CircleX, TriangleAlert, Info, X, ChevronDown, Clock, ShieldCheck, Lock, MinusCircle,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Toggle from '../../components/ui/Toggle'
import { request, fmtDateTime } from '../../lib/api'
import { timeAgo } from '../../lib/timeAgo'
import LiveConnections from './LiveConnections'
import DatabaseAccessCard from './DatabaseAccessCard'
import '../Users/users.css'

// Fallback glyphs when no official logo file is present in /public/integrations/<id>.svg
const GLYPH = { entra: KeyRound, sharepoint: Share2, outlook: Mail, sql: Database }
const STATUS = {
  connected: { label: 'Connected', icon: CircleCheck },
  disconnected: { label: 'Disconnected', icon: MinusCircle },
  error: { label: 'Connection Error', icon: CircleX },
}

const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')
const maskId = (v) => (v ? `${v.slice(0, 8)}-••••-••••-${v.slice(-4)}` : '—')

function Logo({ integration: i }) {
  const [failed, setFailed] = useState(false)
  const Glyph = GLYPH[i.id] ?? PlugZap
  if (!failed) {
    return <img className="ig-logo" src={`/integrations/${i.id}.svg`} alt={`${i.name} logo`} onError={() => setFailed(true)} />
  }
  return <span className="ig-logo ig-logo-tile" style={{ background: i.brand }} aria-hidden="true"><Glyph size={22} strokeWidth={2} /></span>
}

function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.disconnected
  const Icon = s.icon
  return <span className={`ig-status ${status}`}><Icon size={13} />{s.label}</span>
}

function SyncBadge({ status }) {
  return status === 'success'
    ? <span className="ig-sync ok"><CircleCheck size={12} />Success</span>
    : <span className="ig-sync fail"><CircleX size={12} />Failed</span>
}

// Credential + connection details for one integration (no secret values ever reach the browser)
function Details({ i }) {
  const c = i.config
  const rows = i.id === 'sql'
    ? [
        ['Server', c.server ? `${c.server}:${c.port ?? 1433}` : '—'],
        ['Database', c.database ?? '—'],
        ['Authentication', c.authentication ?? '—'],
        ['Username', c.username ?? '—'],
        ['Password', i.secrets.password ? <span key="pw" className="ig-secret"><Lock size={12} />{i.secrets.password.hint}</span> : 'Not stored'],
        ['Encryption', c.encrypt === false ? 'Off' : 'TLS required'],
      ]
    : [
        ['Tenant ID', <span key="t" className="ig-mono">{maskId(c.tenantId)}</span>],
        ['Client ID', <span key="c" className="ig-mono">{maskId(c.clientId)}</span>],
        ['Client Secret', i.secrets.clientSecret
          ? <span key="cs" className="ig-secret"><Lock size={12} />{i.secrets.clientSecret.hint}</span>
          : 'Not stored'],
        ['Secret Expires', i.secretExpiresOn
          ? <span key="exp" className={i.secretDaysLeft <= 30 ? 'ig-warn-text' : ''}>{fmtDay(i.secretExpiresOn)} ({i.secretDaysLeft > 0 ? `${i.secretDaysLeft} days left` : 'expired'})</span>
          : '—'],
        ...(i.id === 'sharepoint' ? [['Site', c.siteUrl ? <a key="site" href={c.siteUrl} target="_blank" rel="noopener noreferrer">{c.siteUrl.replace('https://', '')}</a> : '—'], ['Library', c.libraryName ?? '—']] : []),
        ...(i.id === 'outlook' ? [['Sender Mailbox', c.senderMailbox ?? '—']] : []),
        ...(i.id === 'entra' ? [['Sign-in Domain', c.allowedDomain || 'Any in tenant']] : []),
      ]
  return (
    <dl className="ig-facts">
      {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      <div><dt>Auth Type</dt><dd>{i.authType}</dd></div>
      <div><dt>Connected</dt><dd>{i.connectedAt ? `${fmtDateTime(i.connectedAt)} by ${i.connectedBy?.name ?? '—'}` : '—'}</dd></div>
    </dl>
  )
}

function IntegrationCard({ i, busy, onConfigure, onTest, onSync, onDisconnect }) {
  const [showHistory, setShowHistory] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [now] = useState(() => Date.now())
  const connected = i.status === 'connected'
  const configured = i.status !== 'disconnected'
  const attention = i.status === 'error' || (connected && i.secretDaysLeft !== null && i.secretDaysLeft <= 30)

  useEffect(() => {
    if (!confirmOff) return undefined
    const t = setTimeout(() => setConfirmOff(false), 4000)
    return () => clearTimeout(t)
  }, [confirmOff])

  return (
    <section className={`s-card ig-card ${i.status}`}>
      <header className="ig-head">
        <Logo integration={i} />
        <div className="ig-title">
          <h2>{i.name}</h2>
          <span>{i.vendor} · {i.category}</span>
        </div>
        <StatusBadge status={i.status} />
      </header>
      <p className="ig-desc">{i.description}</p>

      {i.status === 'error' && i.lastSync?.status === 'failed' && (
        <p className="ig-alert error"><CircleAlert size={14} />{i.lastSync.message}. Update the credentials and reconnect.</p>
      )}
      {connected && i.secretDaysLeft !== null && i.secretDaysLeft <= 30 && (
        <p className="ig-alert warn"><TriangleAlert size={14} />Client secret expires in {i.secretDaysLeft} days. Create a new secret in Entra ID and update it here.</p>
      )}

      {configured ? <Details i={i} /> : (
        <p className="ig-empty">Not connected. Add the {i.id === 'sql' ? 'database connection details' : 'app registration details from Microsoft Entra ID'} to connect.</p>
      )}

      <div className="ig-perms">
        <span>Permissions</span>
        {i.permissions.map((p) => <code key={p}>{p}</code>)}
      </div>

      <div className="ig-sync-box">
        <div>
          <span className="ig-k">Last Sync</span>
          {i.lastSync ? (
            <span className="ig-v"><SyncBadge status={i.lastSync.status} /> {timeAgo(i.lastSync.at)} · {i.lastSync.message}</span>
          ) : <span className="ig-v ig-muted">Never synced</span>}
        </div>
        <div>
          <span className="ig-k">Next Sync</span>
          <span className="ig-v">
            {!i.nextSync ? <span className="ig-muted">{connected ? 'After the first sync' : 'Paused'}</span>
              // No background scheduler runs in the demo, so a due sync waits for "Sync Now"
              : Date.parse(i.nextSync) < now ? <span className="ig-warn-text">Due since {fmtDateTime(i.nextSync)} — use Sync Now (every {i.syncHours} h)</span>
                : `${fmtDateTime(i.nextSync)} (every ${i.syncHours} h)`}
          </span>
        </div>
        {i.history.length > 0 && (
          <button type="button" className="ig-history-btn" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <Clock size={13} />Sync history ({i.history.length})<ChevronDown size={13} className={showHistory ? 'open' : ''} />
          </button>
        )}
        {showHistory && (
          <ul className="ig-history">
            {i.history.map((h) => (
              <li key={h.at}>
                <SyncBadge status={h.status} />
                <span>{fmtDateTime(h.at)}</span>
                <span className="ig-muted">{h.message}{h.durationMs ? ` · ${(h.durationMs / 1000).toFixed(1)} s` : ''} · {h.by}{h.simulated ? ' (simulated)' : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {i.lastTest && (
        <p className={`ig-test ${i.lastTest.ok ? 'ok' : 'fail'}`}>
          <FlaskConical size={13} />Last test {timeAgo(i.lastTest.at)}: {i.lastTest.ok ? 'configuration valid' : 'problems found'}
        </p>
      )}

      <footer className="ig-actions">
        <button type="button" className={`s-btn ${configured ? 's-btn-outline' : 's-btn-primary'}`} disabled={busy} onClick={() => onConfigure(i)}>
          {configured ? <><Settings2 size={15} />Configure</> : <><PlugZap size={15} />Connect</>}
        </button>
        {configured && <button type="button" className="s-btn s-btn-outline" disabled={busy} onClick={() => onTest(i)}><FlaskConical size={15} />Test</button>}
        {configured && i.status !== 'disconnected' && (
          <button type="button" className="s-btn s-btn-outline" disabled={busy || !connected} title={connected ? undefined : 'Fix the connection first'} onClick={() => onSync(i)}>
            <RefreshCw size={15} className={busy === 'sync' ? 'ig-spin' : ''} />Sync Now
          </button>
        )}
        {configured && (
          <button type="button" className={`s-btn s-btn-outline ig-disconnect${confirmOff ? ' confirm' : ''}`} disabled={busy}
            onClick={() => { if (confirmOff) { setConfirmOff(false); onDisconnect(i) } else setConfirmOff(true) }}>
            <Unplug size={15} />{confirmOff ? 'Click again to disconnect' : 'Disconnect'}
          </button>
        )}
        {attention && <span className="ig-attn"><TriangleAlert size={13} />Needs attention</span>}
      </footer>
    </section>
  )
}

// Connect / configure dialog, built from the integration's field definitions
function ConfigureDialog({ i, onClose, onSaved }) {
  const [values, setValues] = useState(() => Object.fromEntries(i.fields.map((f) => [f.key, f.type === 'secret' ? '' : (i.config[f.key] ?? f.default ?? (f.type === 'toggle' ? false : ''))])))
  const [errors, setErrors] = useState({})
  const [test, setTest] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (v) => setValues((s) => ({ ...s, [k]: v }))

  const runTest = async () => {
    setBusy('test')
    try {
      const r = await request(`/integrations/${i.id}/test`, { method: 'POST', body: { values } })
      setTest(r)
      setErrors(r.fields ?? {})
    } catch (err) {
      setTest({ ok: false, checks: [{ label: err.message, ok: false }] })
    } finally {
      setBusy(null)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy('save')
    setErrors({})
    try {
      onSaved(await request(`/integrations/${i.id}/connect`, { method: 'POST', body: { values } }))
    } catch (err) {
      setErrors(err.fields ?? { form: err.message })
      setBusy(null)
    }
  }

  return (
    <div className="u-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="u-modal ig-modal" role="dialog" aria-modal="true" aria-labelledby="ig-title" onSubmit={save} noValidate>
        <header className="u-modal-head">
          <h2 id="ig-title" className="ig-modal-title"><Logo integration={i} />{i.status === 'disconnected' ? `Connect ${i.name}` : `Configure ${i.name}`}</h2>
          <button type="button" className="u-row-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="u-modal-body">
          {i.id !== 'sql' && (
            <p className="ig-help"><Info size={14} />Register an app in <strong>Microsoft Entra admin center › App registrations</strong>, grant the permissions below with admin consent, then paste the IDs and a client secret here.</p>
          )}
          <div className="uf-grid">
            {i.fields.map((f) => {
              const err = errors[f.key] && <em>{errors[f.key]}</em>
              if (f.type === 'toggle') {
                return (
                  <div key={f.key} className="uf-field uf-wide ig-toggle">
                    <Toggle checked={Boolean(values[f.key])} onChange={set(f.key)} label={f.label} /><span>{f.label}</span>
                  </div>
                )
              }
              if (f.type === 'select') {
                return (
                  <div key={f.key} className="uf-field"><span>{f.label}{f.required && ' *'}</span>
                    <SearchSelect variant="field" label={f.label} value={values[f.key]} onChange={set(f.key)} searchable={false}
                      options={f.options.map((o) => ({ value: o, label: o }))} />{err}
                  </div>
                )
              }
              const stored = f.type === 'secret' ? i.secrets[f.key] : null
              const wide = ['redirectUri', 'siteUrl', 'server'].includes(f.key) || f.type === 'secret'
              return (
                <label key={f.key} className={`uf-field${wide ? ' uf-wide' : ''}`}>
                  <span>{f.label}{f.required && !stored && ' *'}</span>
                  <input className={`u-input${errors[f.key] ? ' invalid' : ''}${f.type === 'guid' ? ' ig-mono' : ''}`}
                    type={f.type === 'secret' ? 'password' : f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    autoComplete={f.type === 'secret' ? 'new-password' : 'off'} spellCheck={false}
                    placeholder={stored ? `Stored (${stored.hint}) — leave blank to keep` : f.placeholder}
                    value={values[f.key]} onChange={(ev) => set(f.key)(ev.target.value)} />
                  {err}
                </label>
              )
            })}
          </div>

          <div className="ig-perms ig-perms-modal">
            <span>Permissions requested</span>
            {i.permissions.map((p) => <code key={p}>{p}</code>)}
          </div>

          {test && (
            <ul className="ig-checks" aria-label="Test results">
              {test.checks.map((c) => (
                <li key={c.label} className={c.skipped ? 'skip' : c.warn ? 'warn' : c.ok ? 'ok' : 'fail'}>
                  {c.skipped ? <Info size={14} /> : c.warn ? <TriangleAlert size={14} /> : c.ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
                  <strong>{c.label}</strong>{c.detail && <span>{c.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="ig-note"><ShieldCheck size={14} />Secrets are encrypted on the server (AES-256-GCM) and are never shown again or written to the audit log.</p>
          {errors.form && <p className="uf-error">{errors.form}</p>}
        </div>
        <footer className="u-modal-foot">
          <button type="button" className="u-btn u-btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="u-btn u-btn-outline" disabled={Boolean(busy)} onClick={runTest}><FlaskConical size={14} />{busy === 'test' ? 'Testing…' : 'Test Connection'}</button>
          <button type="submit" className="u-btn u-btn-primary" disabled={Boolean(busy)}><PlugZap size={14} />{busy === 'save' ? 'Saving…' : i.status === 'connected' ? 'Save Changes' : 'Save & Connect'}</button>
        </footer>
      </form>
    </div>
  )
}

export default function Integrations({ onToast }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState({}) // id → 'sync' | 'test' | 'off'
  const [configuring, setConfiguring] = useState(null)

  useEffect(() => {
    request('/integrations').then(setData).catch((err) => setError(err.message))
  }, [])

  const replace = (view) => setData((d) => ({ ...d, integrations: d.integrations.map((x) => (x.id === view.id ? view : x)) }))
  const act = async (i, kind, path, success) => {
    setBusy((b) => ({ ...b, [i.id]: kind }))
    try {
      const r = await request(`/integrations/${i.id}/${path}`, { method: 'POST' })
      if (kind === 'test') {
        replace({ ...i, lastTest: r })
        onToast(r.ok ? { kind: 'success', text: `${i.name}: configuration is valid (live call skipped in demo).` } : { kind: 'error', text: `${i.name}: ${r.checks.find((c) => !c.ok)?.detail ?? 'test failed'}` })
      } else {
        replace(r)
        onToast({ kind: 'success', text: success(r) })
      }
    } catch (err) {
      onToast({ kind: 'error', text: err.message })
    } finally {
      setBusy((b) => ({ ...b, [i.id]: null }))
    }
  }
  const closeDialog = useCallback(() => setConfiguring(null), [])

  // SQL Server is shown as "Microsoft Database Access — coming soon" instead of a configurable card
  const list = (data?.integrations ?? []).filter((i) => i.id !== 'sql')
  const count = (st) => list.filter((i) => i.status === st).length
  const attention = list.filter((i) => i.status === 'error' || (i.status === 'connected' && i.secretDaysLeft !== null && i.secretDaysLeft <= 30)).length
  const lastSync = list.map((i) => i.lastSuccessfulSync?.at).filter(Boolean).sort().at(-1)

  return (
    <div className="ig">
      <LiveConnections />
      <DatabaseAccessCard />

      {/* Server-side (app-only) connections for background sync — admin settings, kept out of the way */}
      <details className="ig-advanced">
        <summary>
          <Settings2 size={15} />
          <span><strong>Advanced: server connections</strong><small>App registrations with client secrets for background sync{data ? ` · ${count('connected')} connected` : ''}</small></span>
          <ChevronDown size={15} className="ig-adv-chev" />
        </summary>
        {error && <div className="s-banner error">Couldn't load integrations ({error}).</div>}
        {!data && !error && <div className="s-loading">Loading integrations…</div>}
        {data && (
          <>
            {data.demo && (
              <p className="ig-demo"><Info size={15} /><span><strong>Demo environment:</strong> credentials are validated and stored encrypted, but no requests are sent to Microsoft. Tests skip the live call and syncs are simulated from this app's data.</span></p>
            )}
            <div className="ig-summary">
              <div className="ig-stat good"><CircleCheck size={18} /><strong>{count('connected')}</strong><span>Connected</span></div>
              <div className="ig-stat muted"><MinusCircle size={18} /><strong>{count('disconnected')}</strong><span>Disconnected</span></div>
              <div className="ig-stat bad"><TriangleAlert size={18} /><strong>{attention}</strong><span>Need Attention</span></div>
              <div className="ig-stat"><RefreshCw size={18} /><strong>{lastSync ? timeAgo(lastSync) : '—'}</strong><span>Last Successful Sync</span></div>
            </div>
            <div className="ig-grid">
              {list.map((i) => (
                <IntegrationCard key={i.id} i={i} busy={busy[i.id]}
                  onConfigure={setConfiguring}
                  onTest={(x) => act(x, 'test', 'test')}
                  onSync={(x) => act(x, 'sync', 'sync', (r) => `${x.name}: ${r.lastSync.message} (simulated).`)}
                  onDisconnect={(x) => act(x, 'off', 'disconnect', () => `${x.name} disconnected. Stored credentials were deleted.`)} />
              ))}
            </div>
          </>
        )}
      </details>
      {configuring && (
        <ConfigureDialog i={configuring} onClose={closeDialog}
          onSaved={(view) => { replace(view); setConfiguring(null); onToast({ kind: 'success', text: `${view.name} connected.` }) }} />
      )}
    </div>
  )
}
