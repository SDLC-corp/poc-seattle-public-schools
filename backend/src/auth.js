import { createPublicKey, createVerify } from 'node:crypto';
import { runAs } from './data/auditStore.js';

/**
 * Who is making a request. The frontend sends the signed-in user's Microsoft Entra access token for this API
 * (Authorization: Bearer …). It is verified here — RS256 signature against Microsoft's published keys, expiry,
 * audience (ENTRA_API_AUDIENCE), issuer, the required scope (ENTRA_REQUIRED_SCOPE) and, if set, the tenant
 * (ENTRA_DIRECTORY_TENANT_ID) — and the person in it is credited with everything the request does (audit log,
 * stage history, uploads…). Requests without a token run as the demo user (demo mode); a token that fails
 * verification is refused with 401.
 */
const AUDIENCE = process.env.ENTRA_API_AUDIENCE?.trim() ?? '';
const HOST = (process.env.ENTRA_AUTHORITY_HOST?.trim() || 'https://login.microsoftonline.com').replace(/\/+$/, '');
const SCOPE = process.env.ENTRA_REQUIRED_SCOPE?.trim() ?? '';
const TENANT = process.env.ENTRA_DIRECTORY_TENANT_ID?.trim() ?? '';
const KEYS_TTL = 6 * 3600 * 1000;
const SKEW = 60; // seconds of clock skew allowed

let keys = new Map();
let keysAt = 0;
async function signingKey(kid) {
  if (!keys.has(kid) || Date.now() - keysAt > KEYS_TTL) {
    const res = await fetch(`${HOST}/common/discovery/v2.0/keys`);
    if (!res.ok) throw new Error(`Couldn't load Microsoft signing keys (HTTP ${res.status})`);
    const { keys: list = [] } = await res.json();
    keys = new Map(list.filter((k) => k.kty === 'RSA').map((k) => [k.kid, createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: 'jwk' })]));
    keysAt = Date.now();
  }
  return keys.get(kid);
}

const part = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export async function verifyAccessToken(token) {
  const [h, p, sig] = String(token).split('.');
  if (!h || !p || !sig) throw new Error('Malformed token');
  const header = part(h);
  const claims = part(p);
  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm');
  const key = await signingKey(header.kid);
  if (!key) throw new Error('Unknown signing key');
  if (!createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(sig, 'base64url'))) throw new Error('Bad signature');
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now - SKEW) throw new Error('Token expired');
  if (claims.nbf && claims.nbf > now + SKEW) throw new Error('Token not yet valid');
  if (![AUDIENCE, `api://${AUDIENCE}`].includes(claims.aud)) throw new Error('Token is for another application');
  if (![`${HOST}/${claims.tid}/v2.0`, `https://sts.windows.net/${claims.tid}/`].includes(claims.iss)) throw new Error('Unexpected issuer');
  if (TENANT && claims.tid !== TENANT) throw new Error('Token is from another organization');
  if (SCOPE && !String(claims.scp ?? '').split(' ').includes(SCOPE)) throw new Error('Token is missing the API scope');
  return claims;
}

// The app's own user record (by email) supplies the role shown in the audit log
async function userFromClaims(c) {
  const email = String(c.preferred_username || c.upn || c.email || '').toLowerCase();
  const { listUsers } = await import('./routes/users.js');
  const { getRole } = await import('./data/rolesStore.js');
  const known = email ? listUsers().find((u) => String(u.email ?? '').toLowerCase() === email) : null;
  return {
    id: known?.id ?? c.oid, name: c.name || known?.name || email || 'Signed-in user', email,
    role: (known && getRole(known.roleId)?.name) || 'Signed-in user', entraId: c.oid,
  };
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  if (!AUDIENCE || !header.startsWith('Bearer ')) return next();
  let user;
  try {
    user = await userFromClaims(await verifyAccessToken(header.slice(7).trim()));
  } catch (err) {
    return res.status(401).json({ error: 'Your sign-in could not be verified. Please sign in again.', detail: err.message });
  }
  req.user = user;
  return runAs(user, next);
}
