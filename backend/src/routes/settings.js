import { Router } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { settingsDefaults } from '../data/settingsDefaults.js';
import { logAudit, diff } from '../data/auditStore.js';
import { notify } from '../data/notificationsStore.js';
import { writeJson } from '../data/atomicWrite.js';

const SETTINGS_FILE = new URL('../../data/settings.json', import.meta.url);
const MAX_LOGO_CHARS = 2.8 * 1024 * 1024; // ~2 MB image once base64-encoded
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clone = (v) => JSON.parse(JSON.stringify(v));

// Keep only known keys whose value has the same type as the default; fall back to the default otherwise
function sanitize(input) {
  const result = clone(settingsDefaults);
  for (const [section, fields] of Object.entries(settingsDefaults)) {
    for (const [key, def] of Object.entries(fields)) {
      const value = input?.[section]?.[key];
      if (value !== undefined && typeof value === typeof def) result[section][key] = value;
    }
  }
  return result;
}

function validate(s) {
  const errors = [];
  if (!s.organization.districtName.trim()) errors.push('District name is required');
  for (const [label, value] of [
    ['Organization email', s.organization.email],
    ['Support email', s.support.supportEmail],
  ]) {
    if (value && !EMAIL.test(value)) errors.push(`${label} is not a valid email address`);
  }
  for (const key of ['primaryColor', 'secondaryColor']) {
    if (!HEX_COLOR.test(s.theme[key])) errors.push(`${key} must be a hex colour like #006AA3`);
  }
  if (s.theme.logoDataUrl && (!s.theme.logoDataUrl.startsWith('data:image/') || s.theme.logoDataUrl.length > MAX_LOGO_CHARS)) {
    errors.push('Logo must be a PNG or JPG image of 2 MB or less');
  }
  if (s.support.helpUrl) {
    try {
      const { protocol } = new URL(s.support.helpUrl);
      if (!['http:', 'https:'].includes(protocol)) throw new Error();
    } catch {
      errors.push('Help documentation URL must be a valid http(s) link');
    }
  }
  if (s.security.minPasswordLength < 6 || s.security.minPasswordLength > 64) errors.push('Minimum password length must be 6–64');
  return errors;
}

let current = existsSync(SETTINGS_FILE)
  ? sanitize(JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')))
  : clone(settingsDefaults);

const save = async (settings) => {
  current = settings;
  await writeJson(SETTINGS_FILE, settings);
};

const router = Router();

router.get('/', (req, res) => res.json(current));

router.get('/defaults', (req, res) => res.json(settingsDefaults));

router.put('/', async (req, res, next) => {
  try {
    const incoming = sanitize(req.body);
    const errors = validate(incoming);
    if (errors.length) return res.status(400).json({ error: 'Invalid settings', details: errors });
    const changes = diff(current, incoming);
    await save(incoming);
    if (changes.length) {
      logAudit(req, {
        action: 'update', module: 'Settings', recordId: 'settings',
        summary: `Updated ${changes.length} setting${changes.length > 1 ? 's' : ''}`, changes, link: '/settings',
      });
      // Compliance defaults affect every school, so flag those changes for attention
      const compliance = changes.some((c) => c.field.startsWith('compliance.'));
      notify({
        type: 'system', priority: compliance ? 'medium' : 'low', link: '/settings', linkLabel: 'View Settings',
        title: compliance ? 'Compliance Settings Changed' : 'System Settings Updated',
        message: `${changes.length} setting${changes.length > 1 ? 's were' : ' was'} changed.`,
        description: `Changed: ${changes.slice(0, 6).map((c) => c.field).join(', ')}${changes.length > 6 ? '…' : ''}. See Audit Logs for the before and after values.`,
      });
    }
    res.json(current);
  } catch (err) {
    next(err);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const changes = diff(current, settingsDefaults);
    await save(clone(settingsDefaults));
    logAudit(req, {
      action: 'update', module: 'Settings', recordId: 'settings',
      summary: 'Reset all settings to defaults', changes, link: '/settings',
    });
    res.json(current);
  } catch (err) {
    next(err);
  }
});

export default router;
