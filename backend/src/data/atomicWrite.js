import { writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Write JSON atomically: write a temp file next to the target, then rename it over the target.
 * If the process is stopped mid-write (e.g. a dev-server restart), the old file stays intact
 * instead of being left truncated.
 */
export async function writeJson(target, data) {
  const file = target instanceof URL ? fileURLToPath(target) : target;
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
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
