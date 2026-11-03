import { existsSync, readFileSync } from 'node:fs';
import { writeJson } from './atomicWrite.js';

const FILE = new URL('../../data/notifications.json', import.meta.url);

export const TYPES = ['inspection', 'compliance', 'acm', 'system', 'other'];
export const PRIORITIES = ['high', 'medium', 'low'];

let items = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).notifications : [];
let writing = Promise.resolve();
const persist = () => {
  writing = writing.then(() => writeJson(FILE, { notifications: items })).catch(() => {});
  return writing;
};

export const getNotifications = () => items;
export const getNotification = (id) => items.find((n) => n.id === id);

let seq = items.filter((n) => n.id.startsWith('NTF-')).reduce((m, n) => Math.max(m, Number(n.id.slice(4)) || 0), 0);

/**
 * Raise a notification from an app event.
 * { type, priority, title, message, description?, schoolName?, buildingName?, link?, linkLabel? }
 */
export function notify(n) {
  const item = {
    id: `NTF-${String(++seq).padStart(6, '0')}`,
    type: TYPES.includes(n.type) ? n.type : 'other',
    priority: PRIORITIES.includes(n.priority) ? n.priority : 'low',
    title: n.title,
    message: n.message,
    description: n.description ?? n.message,
    schoolId: n.schoolId ?? null,
    schoolName: n.schoolName ?? null,
    buildingName: n.buildingName ?? null,
    rooms: n.rooms ?? null,
    dueDate: n.dueDate ?? null,
    link: n.link ?? null,
    linkLabel: n.linkLabel ?? null,
    createdAt: new Date().toISOString(),
    read: false,
    sample: false,
  };
  items = [item, ...items];
  persist();
  return item;
}

export async function setRead(ids, read) {
  const set = new Set(ids);
  let changed = 0;
  items = items.map((n) => {
    if (!set.has(n.id) || n.read === read) return n;
    changed += 1;
    return { ...n, read };
  });
  if (changed) await persist();
  return changed;
}

export async function removeNotifications(ids) {
  const set = new Set(ids);
  const before = items.length;
  items = items.filter((n) => !set.has(n.id));
  if (items.length !== before) await persist();
  return before - items.length;
}
