import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ATTACHMENT_FILES } from '../data/acmMeta.js';

// Identify an upload by its first bytes; the declared type/extension isn't trusted
const SIGNATURES = [
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

export function sniff(body, allowed = Object.keys(ATTACHMENT_FILES)) {
  if (!Buffer.isBuffer(body) || body.length < 12) return null;
  const hit = SIGNATURES.find((s) => s.test(body));
  return hit && allowed.includes(hit.ext) ? { ext: hit.ext, mime: ATTACHMENT_FILES[hit.ext] } : null;
}

export const cleanName = (name, fallback) => String(name ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 150) || fallback;

// Writes the file to `dir` and returns its metadata record
export async function storeUpload(dir, body, type, { name, ...extra }) {
  const id = randomUUID();
  const storedName = `${id}.${type.ext}`;
  await writeFile(path.join(dir, storedName), body);
  return { id, name: cleanName(name, storedName), mime: type.mime, size: body.length, storedName, uploadedAt: new Date().toISOString(), ...extra };
}

export function sendStored(res, file, fullPath, download) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(file.mime);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.sendFile(fullPath);
}
