import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// On Vercel the app folder is read-only; only /tmp is writable (and it's emptied when the instance is recycled)
export const IS_VERCEL = Boolean(process.env.VERCEL);
const UPLOAD_ROOT = IS_VERCEL ? path.join('/tmp', 'uploads') : fileURLToPath(new URL('../../uploads/', import.meta.url));

// Folder for uploaded files under uploads/ (created if missing), with a trailing separator
export function uploadDir(sub = '') {
  const dir = path.join(UPLOAD_ROOT, sub, path.sep);
  mkdirSync(dir, { recursive: true });
  return dir;
}
