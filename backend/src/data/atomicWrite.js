import { existsSync } from 'node:fs';
import { writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { IS_VERCEL } from './paths.js';

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));
const TMP_DATA_DIR = path.join('/tmp', 'sps-data');
// Errors that mean "this file system can't be written" (Vercel and other serverless hosts deploy the app read-only)
const READ_ONLY = ['EROFS', 'EACCES', 'EPERM'];

// Serverless (Vercel): the app folder is read-only, only /tmp can be written. Data files are then saved under
// /tmp/sps-data (same layout as backend/data). The stores keep their data in memory, so the app works normally
// while the instance runs; /tmp is emptied when the instance is recycled.
let redirect = IS_VERCEL;
let warned = false;

/**
 * Where to read a data file from: its saved copy under /tmp when saves are redirected there (Vercel) and one
 * exists, else the file in backend/data. Every store loads through this, so all kinds of data read back what
 * was last saved.
 */
export function readPath(target) {
  const file = target instanceof URL ? fileURLToPath(target) : target;
  if (!redirect) return file;
  const saved = targetFor(file);
  return existsSync(saved) ? saved : file;
}

function targetFor(file) {
  if (!redirect) return file;
  const rel = path.relative(DATA_DIR, file);
  return path.join(TMP_DATA_DIR, rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.basename(file));
}

async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, text);
  // Windows can briefly lock the target (indexers, antivirus): retry the rename a few times
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) {
        await unlink(tmp).catch(() => {});
        throw err;
      }
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

/**
 * Write JSON atomically: write a temp file next to the target, then rename it over the target.
 * If the process is stopped mid-write (e.g. a dev-server restart), the old file stays intact
 * instead of being left truncated. On a read-only file system the data goes to /tmp instead (see above).
 */
export async function writeJson(target, data) {
  const file = target instanceof URL ? fileURLToPath(target) : target;
  const text = JSON.stringify(data, null, 2);
  try {
    await writeAtomic(targetFor(file), text);
  } catch (err) {
    // Read-only deployment not detected up front: switch to /tmp for this and every later write
    if (redirect || !READ_ONLY.includes(err.code) || !file.startsWith(DATA_DIR)) throw err;
    redirect = true;
    if (!warned) { warned = true; console.warn(`Data folder is read-only (${err.code}); saving data under ${TMP_DATA_DIR} instead`); }
    await writeAtomic(targetFor(file), text);
  }
}
