import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import {
  Settings as SettingsIcon, Plug, Bell, ShieldCheck, FileText, Map as MapIcon, Database, Wrench,
  Building, Palette, Lock, ClipboardCheck, SlidersHorizontal, LifeBuoy, Save, RotateCcw,
  Upload, Trash2, ExternalLink, CircleCheck, CircleAlert, School,
} from 'lucide-react'
import SearchSelect from '../../components/ui/SearchSelect'
import Toggle from '../../components/ui/Toggle'
import { mainNav } from '../../components/layout/navItems'
import { applyBrandColors } from '../../theme'
import Integrations from './Integrations'
import './settings.css'
import './integrations.css'

const TABS = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { id: 'documents', label: 'Document Settings', icon: FileText },
  { id: 'map', label: 'Map & Floor Plan', icon: MapIcon },
  { id: 'data', label: 'Data Management', icon: Database },
  { id: 'system', label: 'System Settings', icon: Wrench },
]

const opts = (values, fmt = String) => values.map((v) => ({ value: v, label: fmt(v) }))

const OPTIONS = {
  timeZone: [
    { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time (US & Canada)' },
    { value: 'America/Anchorage', label: '(UTC-09:00) Alaska' },
    { value: 'Pacific/Honolulu', label: '(UTC-10:00) Hawaii' },
    { value: 'America/Denver', label: '(UTC-07:00) Mountain Time (US & Canada)' },
    { value: 'America/Chicago', label: '(UTC-06:00) Central Time (US & Canada)' },
    { value: 'America/New_York', label: '(UTC-05:00) Eastern Time (US & Canada)' },
    { value: 'UTC', label: '(UTC+00:00) Coordinated Universal Time' },
  ],
  landingPage: mainNav.map((n) => ({ value: n.id, label: n.label })),
  schoolView: [
    { value: '', label: 'All Schools' },
    ...opts(['Elementary', 'K-8', 'Middle', 'High', 'Other'], (t) => `${t} Schools`),
  ],
  itemsPerPage: opts([10, 25, 50, 100]),
  sessionTimeout: opts([15, 30, 60, 120, 240], (m) => `${m}`),
  dateFormat: opts(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']),
  numberFormat: [
    { value: 'en-US', label: '1,234.56' },
    { value: 'de-DE', label: '1.234,56' },
    { value: 'fr-FR', label: '1 234,56' },
  ],
  passwordLength: opts([8, 10, 12, 14, 16]),
  passwordExpiry: [...opts([30, 60, 90, 180]), { value: 0, label: 'Never' }],
  lockout: opts([3, 5, 10]),
  reminderDays: opts([7, 14, 30, 60, 90]),
  reinspectionYears: opts([1, 2, 3, 5]),
  surveillanceMonths: opts([3, 6, 12]),
  acmStatus: opts(['ACM Present', 'Assumed ACM', 'Non-ACM', 'Removed']),
  materialCondition: opts(['Good', 'Damaged', 'Significantly Damaged']),
  friability: opts(['Friable', 'Non-Friable']),
}

const HEX = /^#[0-9a-f]{6}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LOGO_BYTES = 2 * 1024 * 1024

function validate(s) {
  const errors = {}
  if (!s.organization.districtName.trim()) errors['organization.districtName'] = 'Required'
  if (s.organization.email && !EMAIL.test(s.organization.email)) errors['organization.email'] = 'Enter a valid email'
  if (s.support.supportEmail && !EMAIL.test(s.support.supportEmail)) errors['support.supportEmail'] = 'Enter a valid email'
  if (!HEX.test(s.theme.primaryColor)) errors['theme.primaryColor'] = 'Use a hex colour like #006AA3'
  if (!HEX.test(s.theme.secondaryColor)) errors['theme.secondaryColor'] = 'Use a hex colour like #F2A33A'
  if (s.support.helpUrl && !/^https?:\/\/\S+$/i.test(s.support.helpUrl)) errors['support.helpUrl'] = 'Enter an http(s) link'
  return errors
}

async function api(path, options) {
  const res = await fetch(`/api/settings${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.details?.join('. ') || body.error || `HTTP ${res.status}`)
  return body
}

function Card({ icon: Icon, title, className = '', children }) {
  return (
    <section className={`s-card ${className}`}>
      <h2 className="s-card-title"><Icon size={18} />{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, htmlFor, error, top = false, children }) {
  return (
    <div className={`s-row${top ? ' s-row-top' : ''}`}>
      <label className="s-label" htmlFor={htmlFor}>{label}</label>
      <div className="s-control">
        {children}
        {error && <span className="s-error">{error}</span>}
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="s-toggle-row">
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

function ColorField({ id, value, onChange, error }) {
  return (
    <div className={`s-color${error ? ' invalid' : ''}`}>
      <input
        type="color"
        aria-label="Pick colour"
        value={HEX.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <input id={id} className="s-input" value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function Settings() {
  // Active tab lives in the URL: /settings/:tab (General when omitted)
  const { tab = 'general' } = useParams()
  const navigate = useNavigate()
  const setTab = (id) => navigate(id === 'general' ? '/settings' : `/settings/${id}`)
  const [saved, setSaved] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [toast, setToast] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    api('')
      .then((s) => { setSaved(s); setDraft(s) })
      .catch((err) => setLoadError(err.message))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!confirmReset) return
    const t = setTimeout(() => setConfirmReset(false), 4000)
    return () => clearTimeout(t)
  }, [confirmReset])

  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/settings" replace />
  if (loadError) {
    return <div className="s-banner error">Couldn't load settings ({loadError}). Is the backend running on port 5000?</div>
  }
  if (!draft) return <div className="s-loading">Loading settings…</div>

  const set = (section, key) => (value) => setDraft((d) => ({ ...d, [section]: { ...d[section], [key]: value } }))
  const text = (section, key) => ({
    id: `${section}-${key}`,
    value: draft[section][key],
    onChange: (e) => set(section, key)(e.target.value),
  })
  const select = (section, key, options, extra = {}) => (
    <SearchSelect
      variant="field"
      id={`${section}-${key}`}
      label={key}
      value={draft[section][key]}
      options={options}
      onChange={set(section, key)}
      searchable={options.length > 6}
      {...extra}
    />
  )

  const errors = validate(draft)
  const errorFor = (path) => (showErrors ? errors[path] : undefined)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const onSave = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true)
      setToast({ kind: 'error', text: 'Fix the highlighted fields before saving.' })
      return
    }
    setBusy(true)
    try {
      const result = await api('', { method: 'PUT', body: JSON.stringify(draft) })
      setSaved(result)
      setDraft(result)
      setShowErrors(false)
      applyBrandColors(result.theme)
      setToast({ kind: 'success', text: 'Settings saved.' })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    setConfirmReset(false)
    setBusy(true)
    try {
      const result = await api('/reset', { method: 'POST' })
      setSaved(result)
      setDraft(result)
      setShowErrors(false)
      applyBrandColors(result.theme)
      setToast({ kind: 'success', text: 'Settings reset to defaults.' })
    } catch (err) {
      setToast({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const onLogoFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setToast({ kind: 'error', text: 'Logo must be a PNG or JPG image.' })
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setToast({ kind: 'error', text: 'Logo must be 2 MB or smaller.' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => set('theme', 'logoDataUrl')(reader.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className="settings">
      <div className="s-head">
        <h1>Settings</h1>
        <p>Configure system preferences, integrations, notifications and compliance settings</p>
      </div>

      <nav className="s-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`s-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>

      {tab === 'integrations' ? (
        <Integrations onToast={setToast} />
      ) : tab !== 'general' ? (
        <div className="s-card s-placeholder">
          <SettingsIcon size={28} />
          <strong>{TABS.find((t) => t.id === tab).label}</strong>
          <span>This section hasn't been built yet. General settings are available now.</span>
        </div>
      ) : (
        <>
          <div className="s-grid s-grid-top">
            <Card icon={Building} title="Organization Settings">
              <Row label="District Name" htmlFor="organization-districtName" error={errorFor('organization.districtName')}>
                <input className="s-input" {...text('organization', 'districtName')} />
              </Row>
              <Row label="Address" htmlFor="organization-address">
                <textarea className="s-input s-textarea" rows={2} {...text('organization', 'address')} />
              </Row>
              <Row label="Phone" htmlFor="organization-phone">
                <input className="s-input" type="tel" {...text('organization', 'phone')} />
              </Row>
              <Row label="Email" htmlFor="organization-email" error={errorFor('organization.email')}>
                <input className="s-input" type="email" {...text('organization', 'email')} />
              </Row>
              <Row label="Time Zone" htmlFor="organization-timeZone">
                {select('organization', 'timeZone', OPTIONS.timeZone, { searchable: true, searchPlaceholder: 'Search time zones…' })}
              </Row>
            </Card>

            <Card icon={SettingsIcon} title="Application Settings">
              <div className="s-fields-3">
                <div className="s-field">
                  <label htmlFor="application-defaultLandingPage">Default Landing Page</label>
                  {select('application', 'defaultLandingPage', OPTIONS.landingPage, { searchPlaceholder: 'Search pages…' })}
                </div>
                <div className="s-field">
                  <label htmlFor="application-defaultSchoolView">Default School View</label>
                  {select('application', 'defaultSchoolView', OPTIONS.schoolView)}
                </div>
                <div className="s-field">
                  <label htmlFor="application-itemsPerPage">Items per Page</label>
                  {select('application', 'itemsPerPage', OPTIONS.itemsPerPage)}
                </div>
              </div>
              <div className="s-inline-row">
                <span className="s-label">Enable System Banner</span>
                <Toggle checked={draft.application.systemBannerEnabled} onChange={set('application', 'systemBannerEnabled')} label="Enable system banner" />
                <input className="s-input" aria-label="System banner text" disabled={!draft.application.systemBannerEnabled} {...text('application', 'systemBannerText')} />
              </div>
              <div className="s-inline-row">
                <span className="s-label">Enable Help &amp; Support</span>
                <Toggle checked={draft.application.helpSupportEnabled} onChange={set('application', 'helpSupportEnabled')} label="Enable help and support" />
                <input className="s-input" aria-label="Help and support text" disabled={!draft.application.helpSupportEnabled} {...text('application', 'helpSupportText')} />
              </div>
              <div className="s-inline-row">
                <label className="s-label" htmlFor="application-sessionTimeoutMinutes">Session Timeout (minutes)</label>
                <span />
                <div className="s-narrow">{select('application', 'sessionTimeoutMinutes', OPTIONS.sessionTimeout)}</div>
              </div>
              <div className="s-inline-row s-format-row">
                <label className="s-label" htmlFor="application-dateFormat">Date Format</label>
                <span />
                <div className="s-format-pair">
                  {select('application', 'dateFormat', OPTIONS.dateFormat)}
                  <label className="s-label" htmlFor="application-numberFormat">Number Format</label>
                  {select('application', 'numberFormat', OPTIONS.numberFormat)}
                </div>
              </div>
            </Card>
          </div>

          <div className="s-grid s-grid-3">
            <Card icon={Palette} title="Theme & Appearance">
              <Row label="Theme Mode">
                <div className="s-radios" role="radiogroup" aria-label="Theme mode">
                  {['light', 'dark', 'system'].map((m) => (
                    <label key={m} className="s-radio">
                      <input type="radio" name="theme-mode" checked={draft.theme.mode === m} onChange={() => set('theme', 'mode')(m)} />
                      {m[0].toUpperCase() + m.slice(1)}
                    </label>
                  ))}
                </div>
                {draft.theme.mode !== 'light' && <span className="s-hint">Saved now; dark styling arrives in a later release.</span>}
              </Row>
              <Row label="Primary Color" htmlFor="theme-primaryColor" error={errorFor('theme.primaryColor')}>
                <ColorField id="theme-primaryColor" value={draft.theme.primaryColor} onChange={set('theme', 'primaryColor')} error={errorFor('theme.primaryColor')} />
              </Row>
              <Row label="Secondary Color" htmlFor="theme-secondaryColor" error={errorFor('theme.secondaryColor')}>
                <ColorField id="theme-secondaryColor" value={draft.theme.secondaryColor} onChange={set('theme', 'secondaryColor')} error={errorFor('theme.secondaryColor')} />
              </Row>
              <Row label="Logo" top>
                <div className="s-logo">
                  <div className="s-logo-preview">
                    {draft.theme.logoDataUrl
                      ? <img src={draft.theme.logoDataUrl} alt="Uploaded logo" />
                      : <span className="s-logo-empty"><School size={22} />No logo</span>}
                  </div>
                  <div className="s-logo-actions">
                    <button type="button" className="s-btn s-btn-outline" onClick={() => fileRef.current?.click()}>
                      <Upload size={14} />Upload Logo
                    </button>
                    {draft.theme.logoDataUrl && (
                      <button type="button" className="s-btn s-btn-ghost" onClick={() => set('theme', 'logoDataUrl')('')}>
                        <Trash2 size={14} />Remove
                      </button>
                    )}
                    <span className="s-hint">PNG, JPG (Max 2MB)</span>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden onChange={onLogoFile} />
                  </div>
                </div>
              </Row>
            </Card>

            <Card icon={Lock} title="Password & Security" className="s-compact">
              <ToggleRow label="Enable Multi-Factor Authentication (MFA)" checked={draft.security.mfaEnabled} onChange={set('security', 'mfaEnabled')} />
              <ToggleRow label="Allow Password Reset by Email" checked={draft.security.passwordResetByEmail} onChange={set('security', 'passwordResetByEmail')} />
              <Row label="Minimum Password Length" htmlFor="security-minPasswordLength">
                {select('security', 'minPasswordLength', OPTIONS.passwordLength)}
              </Row>
              <ToggleRow label="Require Special Character" checked={draft.security.requireSpecialCharacter} onChange={set('security', 'requireSpecialCharacter')} />
              <Row label="Password Expiry (Days)" htmlFor="security-passwordExpiryDays">
                {select('security', 'passwordExpiryDays', OPTIONS.passwordExpiry)}
              </Row>
              <Row label="Account Lockout (Failed Attempts)" htmlFor="security-lockoutAttempts">
                {select('security', 'lockoutAttempts', OPTIONS.lockout)}
              </Row>
            </Card>

            <Card icon={ClipboardCheck} title="Default Compliance Settings" className="s-compact">
              <Row label="Inspection Due Reminder (Days)" htmlFor="compliance-inspectionReminderDays">
                {select('compliance', 'inspectionReminderDays', OPTIONS.reminderDays)}
              </Row>
              <Row label="Reinspection Cycle (Years)" htmlFor="compliance-reinspectionCycleYears">
                {select('compliance', 'reinspectionCycleYears', OPTIONS.reinspectionYears)}
              </Row>
              <Row label="Surveillance Interval (Months)" htmlFor="compliance-surveillanceIntervalMonths">
                {select('compliance', 'surveillanceIntervalMonths', OPTIONS.surveillanceMonths)}
              </Row>
              <Row label="Default ACM Status" htmlFor="compliance-defaultAcmStatus">
                {select('compliance', 'defaultAcmStatus', OPTIONS.acmStatus)}
              </Row>
              <Row label="Default Material Condition" htmlFor="compliance-defaultMaterialCondition">
                {select('compliance', 'defaultMaterialCondition', OPTIONS.materialCondition)}
              </Row>
              <Row label="Default Friability" htmlFor="compliance-defaultFriability">
                {select('compliance', 'defaultFriability', OPTIONS.friability)}
              </Row>
              {(draft.compliance.reinspectionCycleYears > 3 || draft.compliance.surveillanceIntervalMonths > 6) && (
                <p className="s-warning">
                  <CircleAlert size={14} />AHERA requires reinspection at least every 3 years and periodic surveillance every 6 months.
                </p>
              )}
            </Card>
          </div>

          <div className="s-grid s-grid-3">
            <Card icon={SlidersHorizontal} title="System Preferences">
              <ToggleRow label="Enable Audit Logging" checked={draft.system.auditLogging} onChange={set('system', 'auditLogging')} />
              <ToggleRow label="Enable Data Export" checked={draft.system.dataExport} onChange={set('system', 'dataExport')} />
              <ToggleRow label="Enable Bulk Import" checked={draft.system.bulkImport} onChange={set('system', 'bulkImport')} />
              <ToggleRow label="Enable API Access" checked={draft.system.apiAccess} onChange={set('system', 'apiAccess')} />
            </Card>

            <Card icon={LifeBuoy} title="Support Information">
              <Row label="Support Email" htmlFor="support-supportEmail" error={errorFor('support.supportEmail')}>
                <input className="s-input" type="email" {...text('support', 'supportEmail')} />
              </Row>
              <Row label="Support Phone" htmlFor="support-supportPhone">
                <input className="s-input" type="tel" {...text('support', 'supportPhone')} />
              </Row>
              <Row label="Help Documentation URL" htmlFor="support-helpUrl" error={errorFor('support.helpUrl')}>
                <div className="s-url">
                  <input className="s-input" type="url" {...text('support', 'helpUrl')} />
                  {draft.support.helpUrl && !errors['support.helpUrl'] && (
                    <a href={draft.support.helpUrl} target="_blank" rel="noopener noreferrer" aria-label="Open help documentation">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </Row>
            </Card>

            <Card icon={Database} title="Actions" className="s-actions-card">
              <p className={`s-dirty${dirty ? ' on' : ''}`}>
                {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
              </p>
              <div className="s-actions">
                <button type="button" className="s-btn s-btn-primary" disabled={!dirty || busy} onClick={onSave}>
                  <Save size={15} />{busy ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className={`s-btn s-btn-outline${confirmReset ? ' danger' : ''}`} disabled={busy} onClick={onReset}>
                  <RotateCcw size={15} />{confirmReset ? 'Click again to reset' : 'Reset to Default'}
                </button>
              </div>
              {dirty && (
                <button type="button" className="s-link" onClick={() => { setDraft(saved); setShowErrors(false) }}>
                  Discard changes
                </button>
              )}
            </Card>
          </div>
        </>
      )}

      {toast && (
        <div className={`s-toast ${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
