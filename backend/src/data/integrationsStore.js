import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { INTEGRATIONS, integrationById } from './integrationDefs.js';
import { buildings } from './store.js';
import { getAllFloors } from './floorsStore.js';
import { getDocuments } from './documentsStore.js';
import { getInspections } from './complianceStore.js';
import { getRoles } from './rolesStore.js';
import { writeJson, readPath } from './atomicWrite.js';
import { IS_VERCEL } from './paths.js';

const FILE = new URL('../../data/integrations.json', import.meta.url);
// Vercel's app folder is read-only: without INTEGRATIONS_KEY the key file goes to /tmp (a new key per instance)
const KEY_FILE = IS_VERCEL ? '/tmp/.integrations.key' : new URL('../../data/.integrations.key', import.meta.url);
const HISTORY = 8;
const DAY = 86400000;

// AES-256-GCM key: INTEGRATIONS_KEY (64 hex chars) from the environment, else a local key file created once
function loadKey() {
  const env = process.env.INTEGRATIONS_KEY;
  if (env && /^[0-9a-f]{64}$/i.test(env)) return Buffer.from(env, 'hex');
  if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
}
const KEY = loadKey();

export function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'), last4: String(plain).slice(-4) };
}
// Used by the (future) live connectors; kept here so secrets are only ever decrypted server-side
export function decrypt(box) {
  const d = createDecipheriv('aes-256-gcm', KEY, Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
}

const isoDaysFromNow = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const SAMPLE_USER = { id: 'u001', name: 'John Doe' };

// First run: a realistic mix of states so the screen shows connected, disconnected and error cards
function seed() {
  const fakeSecret = () => encrypt(randomBytes(24).toString('base64url'));
  const run = (hoursAgo, status, items, message) => ({ at: ago(hoursAgo * 3600000), status, items, durationMs: 800 + Math.round(Math.random() * 4000), message, by: 'Scheduled sync' });
  return {
    entra: {
      status: 'connected', sample: true,
      config: { tenantId: randomUUID(), clientId: randomUUID(), secretExpiresOn: isoDaysFromNow(142), redirectUri: 'https://asbestos.example/auth/callback', allowedDomain: 'district.example', syncGroups: true },
      secrets: { clientSecret: fakeSecret() },
      connectedAt: ago(48 * DAY), connectedBy: SAMPLE_USER,
      history: [run(2, 'success', 129, 'Synced 129 users and 7 groups'), run(8, 'success', 129, 'Synced 129 users and 7 groups')],
    },
    sharepoint: {
      status: 'connected', sample: true,
      config: { tenantId: randomUUID(), clientId: randomUUID(), secretExpiresOn: isoDaysFromNow(18), siteUrl: 'https://contoso.sharepoint.com/sites/Facilities', libraryName: 'Asbestos Records', folderPath: '/AHERA' },
      secrets: { clientSecret: fakeSecret() },
      connectedAt: ago(30 * DAY), connectedBy: SAMPLE_USER,
      history: [run(0.6, 'success', 96, 'Synced 96 documents (0 conflicts)'), run(1.6, 'success', 96, 'Synced 96 documents (0 conflicts)')],
    },
    outlook: { status: 'disconnected', sample: true, config: {}, secrets: {}, connectedAt: null, connectedBy: null, history: [] },
    sql: {
      status: 'error', sample: true,
      config: { server: 'facilities-db.database.windows.net', port: 1433, database: 'Facilities', authentication: 'SQL Server Authentication', username: 'asbestos_reader', encrypt: true },
      secrets: { password: fakeSecret() },
      connectedAt: ago(90 * DAY), connectedBy: SAMPLE_USER,
      history: [run(20, 'failed', 0, "Login failed for user 'asbestos_reader' (password expired)"), run(44, 'success', 866, 'Read 866 building and floor records')],
    },
  };
}

let state = existsSync(readPath(FILE)) ? JSON.parse(readFileSync(readPath(FILE), 'utf8')).integrations : null;
if (!state) {
  state = seed();
  if (!IS_VERCEL) writeFileSync(FILE, JSON.stringify({ note: 'Integration settings. Secrets are AES-256-GCM encrypted.', integrations: state }, null, 2));
}
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { note: 'Integration settings. Secrets are AES-256-GCM encrypted.', integrations: state }));
  return writing;
};

const get = (id) => state[id] ?? { status: 'disconnected', config: {}, secrets: {}, history: [] };

// What the browser sees: definition + status + non-secret config + masked secrets. Never the secrets themselves.
export function publicView(id) {
  const def = integrationById[id];
  const s = get(id);
  const expires = s.config.secretExpiresOn ?? null;
  const daysLeft = expires ? Math.ceil((Date.parse(`${expires}T00:00:00`) - Date.now()) / DAY) : null;
  const last = s.history[0] ?? null;
  const lastOk = s.history.find((h) => h.status === 'success') ?? null;
  return {
    ...def,
    status: s.status,
    sample: Boolean(s.sample),
    config: s.config,
    secrets: Object.fromEntries(Object.entries(s.secrets).map(([k, v]) => [k, { set: true, hint: `••••${v.last4}` }])),
    secretExpiresOn: expires,
    secretDaysLeft: daysLeft,
    connectedAt: s.connectedAt ?? null,
    connectedBy: s.connectedBy ?? null,
    lastSync: last,
    lastSuccessfulSync: lastOk,
    nextSync: s.status === 'connected' && last ? new Date(Date.parse(last.at) + def.syncHours * 3600000).toISOString() : null,
    history: s.history,
    lastTest: s.lastTest ?? null,
  };
}

export const listIntegrations = () => INTEGRATIONS.map((d) => publicView(d.id));
export const getState = (id) => get(id);

export async function saveConnection(id, { config, secrets }, user) {
  const s = get(id);
  state[id] = {
    ...s,
    status: 'connected',
    sample: false,
    config,
    secrets: { ...s.secrets, ...Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, encrypt(v)])) },
    connectedAt: s.status === 'connected' ? s.connectedAt : new Date().toISOString(),
    connectedBy: s.status === 'connected' ? s.connectedBy : user,
  };
  await persist();
  return publicView(id);
}

// Disconnect: secrets are deleted (the app can no longer reach the service); other settings are kept for reconnecting
export async function disconnect(id) {
  const s = get(id);
  state[id] = { ...s, status: 'disconnected', secrets: {}, connectedAt: null, connectedBy: null };
  await persist();
  return publicView(id);
}

export async function recordTest(id, result) {
  state[id] = { ...get(id), lastTest: result };
  await persist();
}

// Simulated sync (demo environment): item counts come from this app's own data
function syncPreview(id) {
  switch (id) {
    case 'entra': return { items: 129, message: `Synced 129 users and ${getRoles().length} groups` };
    case 'sharepoint': {
      const n = getDocuments().filter((d) => d.source === 'sharepoint').length;
      return { items: n, message: `Synced ${n} documents (0 conflicts)` };
    }
    case 'outlook': {
      const n = getInspections().filter((i) => !i.completedAt).length;
      return { items: n, message: `Updated ${n} inspection calendar events` };
    }
    case 'sql': {
      const n = buildings.length + getAllFloors().length;
      return { items: n, message: `Read ${n} building and floor records` };
    }
    default: return { items: 0, message: 'Nothing to sync' };
  }
}

export async function runSync(id, user) {
  const s = get(id);
  const { items, message } = syncPreview(id);
  const entry = { at: new Date().toISOString(), status: 'success', items, durationMs: 600 + Math.round(Math.random() * 2500), message, by: user.name, simulated: true };
  state[id] = { ...s, status: 'connected', history: [entry, ...s.history].slice(0, HISTORY) };
  await persist();
  return publicView(id);
}
