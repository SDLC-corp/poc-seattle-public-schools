import { Router } from 'express';
import { integrationById } from '../data/integrationDefs.js';
import {
  listIntegrations, publicView, getState, saveConnection, disconnect, recordTest, runSync,
} from '../data/integrationsStore.js';
import { logAudit, CURRENT_USER } from '../data/auditStore.js';
import { notify } from '../data/notificationsStore.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const DAY = 86400000;

/**
 * Validate submitted values against the integration's field definitions.
 * Secrets left blank keep the stored value (if any).
 */
function validate(def, values, stored) {
  const errors = {};
  const config = {};
  const secrets = {};
  for (const f of def.fields) {
    const raw = values?.[f.key];
    if (f.type === 'toggle') { config[f.key] = raw === undefined ? (stored.config[f.key] ?? f.default ?? false) : Boolean(raw); continue; }
    const v = typeof raw === 'string' ? raw.trim() : raw;
    if (f.type === 'secret') {
      if (v) secrets[f.key] = String(v).slice(0, 500);
      else if (f.required && !stored.secrets[f.key]) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (v === undefined || v === null || v === '') {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    const s = String(v).slice(0, 300);
    if (f.type === 'guid' && !GUID.test(s)) errors[f.key] = 'Enter a GUID like 00000000-0000-0000-0000-000000000000';
    else if (f.type === 'email' && !EMAIL.test(s)) errors[f.key] = 'Enter a valid mailbox address';
    else if (f.type === 'url') {
      try {
        const u = new URL(s);
        if (u.protocol !== 'https:') errors[f.key] = 'Must be an https:// URL';
        else if (f.domain && !u.hostname.endsWith(f.domain)) errors[f.key] = `Must be a ${f.domain.slice(1)} address`;
      } catch { errors[f.key] = 'Enter a valid URL'; }
    } else if (f.type === 'number') {
      const n = Number(s);
      if (!Number.isInteger(n) || n < 1 || n > 65535) errors[f.key] = 'Enter a port between 1 and 65535';
      else { config[f.key] = n; continue; }
    } else if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))) errors[f.key] = 'Enter a valid date';
    else if (f.type === 'date' && Date.parse(`${s}T23:59:59`) < Date.now()) errors[f.key] = 'This secret has already expired — create a new one in Entra ID';
    else if (f.type === 'select' && !f.options.includes(s)) errors[f.key] = 'Choose an option';
    else if (f.key === 'server' && !HOST.test(s)) errors[f.key] = 'Enter a host name like server.database.windows.net';
    config[f.key] = s;
  }
  return { errors, config, secrets };
}

const router = Router();

router.get('/', (req, res) => res.json({
  demo: true, // no requests are sent to Microsoft from this environment
  integrations: listIntegrations(),
}));

router.get('/:id', (req, res) => {
  if (!integrationById[req.params.id]) return res.status(404).json({ error: 'Unknown integration' });
  res.json(publicView(req.params.id));
});

// Test the configuration: format checks and secret expiry. The live call is skipped in this environment.
router.post('/:id/test', async (req, res, next) => {
  try {
    const def = integrationById[req.params.id];
    if (!def) return res.status(404).json({ error: 'Unknown integration' });
    const stored = getState(def.id);
    const values = { ...stored.config, ...(req.body?.values ?? {}) };
    const { errors, config } = validate(def, values, stored);
    const checks = [{ label: 'Required fields', ok: !Object.keys(errors).some((k) => /required/.test(errors[k])) }];
    checks.push({ label: 'Value formats', ok: !Object.values(errors).some((e) => !/required/.test(e)), detail: Object.values(errors).filter((e) => !/required/.test(e))[0] });
    if (config.secretExpiresOn) {
      const days = Math.ceil((Date.parse(`${config.secretExpiresOn}T00:00:00`) - Date.now()) / DAY);
      checks.push({ label: 'Client secret expiry', ok: days > 0, warn: days > 0 && days <= 30, detail: days > 0 ? `Expires in ${days} day${days === 1 ? '' : 's'}` : 'Expired' });
    }
    checks.push({ label: 'Live connection to Microsoft', ok: true, skipped: true, detail: 'Skipped — demo environment, no request was sent' });
    const result = { at: new Date().toISOString(), ok: checks.every((c) => c.ok), checks };
    await recordTest(def.id, result);
    res.json({ ...result, fields: errors });
  } catch (err) {
    next(err);
  }
});

// Save credentials and connect. Secret fields left blank keep the stored secret.
router.post('/:id/connect', async (req, res, next) => {
  try {
    const def = integrationById[req.params.id];
    if (!def) return res.status(404).json({ error: 'Unknown integration' });
    const stored = getState(def.id);
    const { errors, config, secrets } = validate(def, req.body?.values ?? {}, stored);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Check the highlighted fields', fields: errors });
    const wasConnected = stored.status === 'connected';
    const view = await saveConnection(def.id, { config, secrets }, { id: CURRENT_USER.id, name: CURRENT_USER.name });
    const changed = def.fields.filter((f) => f.type !== 'secret' && JSON.stringify(stored.config[f.key]) !== JSON.stringify(config[f.key]));
    logAudit(req, {
      action: wasConnected ? 'update' : 'create', module: 'Settings', recordId: `integration:${def.id}`, link: '/settings/integrations',
      summary: wasConnected ? `Updated ${def.name} connection` : `Connected ${def.name}`,
      // Secrets are recorded only as "changed", never their values
      changes: [
        ...changed.map((f) => ({ field: f.label, from: stored.config[f.key] ?? '—', to: config[f.key] })),
        ...Object.keys(secrets).map((k) => ({ field: def.fields.find((f) => f.key === k).label, from: stored.secrets[k] ? '(hidden)' : '—', to: '(new value, hidden)' })),
      ],
    });
    if (!wasConnected) {
      notify({
        type: 'system', priority: 'low', title: `${def.name} Connected`, link: '/settings/integrations', linkLabel: 'View Integrations',
        message: `${def.name} was connected by ${CURRENT_USER.name}.`,
      });
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sync', async (req, res, next) => {
  try {
    const def = integrationById[req.params.id];
    if (!def) return res.status(404).json({ error: 'Unknown integration' });
    const s = getState(def.id);
    if (s.status === 'disconnected' || !Object.keys(s.secrets).length) return res.status(409).json({ error: `Connect ${def.name} before syncing` });
    const view = await runSync(def.id, { id: CURRENT_USER.id, name: CURRENT_USER.name });
    logAudit(req, {
      action: 'update', module: 'Settings', recordId: `integration:${def.id}`, link: '/settings/integrations',
      summary: `Ran ${def.name} sync – ${view.lastSync.message}`,
    });
    res.json(view);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/disconnect', async (req, res, next) => {
  try {
    const def = integrationById[req.params.id];
    if (!def) return res.status(404).json({ error: 'Unknown integration' });
    if (getState(def.id).status === 'disconnected') return res.json(publicView(def.id));
    const view = await disconnect(def.id);
    logAudit(req, {
      action: 'update', module: 'Settings', recordId: `integration:${def.id}`, link: '/settings/integrations',
      summary: `Disconnected ${def.name}`,
      changes: [{ field: 'Status', from: 'Connected', to: 'Disconnected' }, { field: 'Stored secrets', from: '(hidden)', to: '(deleted)' }],
    });
    notify({
      type: 'system', priority: 'medium', title: `${def.name} Disconnected`, link: '/settings/integrations', linkLabel: 'View Integrations',
      message: `${def.name} was disconnected by ${CURRENT_USER.name}. Its stored credentials were deleted.`,
    });
    res.json(view);
  } catch (err) {
    next(err);
  }
});

export default router;
