import { existsSync, readFileSync } from 'node:fs';
import { schools, buildings } from './store.js';
import { getAllFloors } from './floorsStore.js';
import { getMaterials, allRooms } from './roomsStore.js';
import { getRecords as surveillanceRecords } from './surveillanceStore.js';
import { getRecords as inspectionRecords } from './inspectionRecordsStore.js';
import * as OM from './omStore.js';
import { CONDITION_RANK } from './inspectionMeta.js';
import { writeJson } from './atomicWrite.js';

/**
 * Trend Analysis (material deterioration). Everything here is computed from recorded condition assessments —
 * the ACM inventory's baseline assessment, inspection physical assessments and 6-month surveillance checks — on
 * the AHERA condition scale (Good → Damaged → Significantly Damaged). Nothing is predicted, and a change in
 * physical condition is not a measure of airborne asbestos (that's Air Monitoring).
 */

export const CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged'];
// Trend of an ACM: its latest assessment against the one before
export const TRENDS = {
  significant: 'Significantly Deteriorated',
  deteriorating: 'Deteriorating',
  stable: 'Stable',
  improved: 'Improved',
  baseline: 'Single Assessment',
};
const SURVEYED = ['ACM Present', 'Assumed ACM'];
const IMAGE = /^image\//;

// Every dated condition assessment per ACM, oldest first
function histories() {
  const byAcm = new Map();
  const add = (id, e) => {
    if (!id || !e.date || CONDITION_RANK[e.condition] === undefined) return;
    if (!byAcm.has(id)) byAcm.set(id, []);
    byAcm.get(id).push(e);
  };
  for (const m of getMaterials()) {
    if (m.assessmentDate) {
      add(m.id, { date: m.assessmentDate.slice(0, 10), condition: m.condition, source: 'ACM Inventory', type: 'Baseline Assessment', recordId: null, inspector: m.createdBy?.name ?? null, observations: m.notes || null, photos: [] });
    }
  }
  for (const r of inspectionRecords()) {
    if (!['submitted', 'approved'].includes(r.state) || !r.date) continue;
    for (const a of [r, ...(r.extra ?? [])]) {
      const photos = (r.attachments ?? []).filter((f) => IMAGE.test(f.mime ?? '') && (f.materialId ?? r.materialId) === a.materialId)
        .map((f) => ({ name: f.name, href: `/inspection-records/records/${r.id}/attachments/${f.id}` }));
      add(a.materialId, {
        date: r.date.slice(0, 10), condition: a.assessment?.currentCondition, source: 'Inspection', type: r.type, recordId: r.id,
        link: `/inspections/records/${r.id}`, inspector: r.inspectorName ?? null,
        observations: [a.assessment?.damageType && a.assessment.damageType !== 'None' ? `Damage: ${a.assessment.damageType}` : null,
          a.assessment?.damageExtent && a.assessment.damageExtent !== 'None' ? `Extent: ${a.assessment.damageExtent}` : null,
          typeof r.comments === 'string' ? r.comments : null].filter(Boolean).join(' · ') || null,
        photos,
      });
    }
  }
  for (const s of surveillanceRecords()) {
    if (s.state === 'draft') continue;
    add(s.materialId, {
      date: s.date.slice(0, 10), condition: s.condition, source: 'Surveillance', type: '6-Month Surveillance', recordId: s.id,
      link: `/surveillance/records/${s.id}`, inspector: s.inspectorName ?? null, observations: s.comments || null,
      photos: (s.attachments ?? []).filter((f) => IMAGE.test(f.mime ?? '')).map((f) => ({ name: f.name, href: `/surveillance/records/${s.id}/attachments/${f.id}` })),
    });
  }
  for (const list of byAcm.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return byAcm;
}

// The trend from the assessment before the latest one to the latest one
function trendOf(prev, cur) {
  if (!prev) return 'baseline';
  const d = CONDITION_RANK[cur.condition] - CONDITION_RANK[prev.condition];
  if (d > 0) return cur.condition === 'Significantly Damaged' ? 'significant' : 'deteriorating';
  return d < 0 ? 'improved' : 'stable';
}

// What's being done about an ACM: open O&M work, an open inspection action, else nothing yet
function followUps() {
  const open = new Map();
  for (const a of OM.all('activities')) {
    if (a.state !== 'completed' && !open.has(a.materialId)) open.set(a.materialId, { status: 'omInProgress', label: `O&M ${a.state === 'inProgress' ? 'in progress' : 'scheduled'} (${a.id})`, link: `/operations/activities/${a.id}` });
  }
  for (const r of inspectionRecords()) {
    const item = (r.actionItems ?? []).find((x) => x.status !== 'Completed' && !x.omActivityId);
    if (item && !open.has(r.materialId)) open.set(r.materialId, { status: 'actionOpen', label: `Action open on ${r.id}`, link: `/inspections/records/${r.id}` });
  }
  return open;
}

const lookups = () => {
  const floors = new Map(getAllFloors().map((f) => [f.id, f]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  const bName = new Map(buildings.map((b) => [b.id, b.name]));
  return {
    school: (id) => schools.find((s) => s.id === id)?.name ?? id,
    building: (id) => bName.get(id) ?? '',
    floor: (id) => floors.get(id)?.name ?? '',
    room: (id) => { const r = rooms.get(id); return r ? `${r.number} ${r.name}`.trim() : ''; },
  };
};

// ACM-123 style id within its school (as shown elsewhere)
const shortAcm = (id) => id.replace(/^ACM-[^-]+-/, 'ACM-').toUpperCase();

/**
 * The analysed ACMs for the filters: { school, building, floor, room, acm, materialType, classification, friability,
 * condition, inspectionType, from, to } — each with its assessments in the range, the current (latest) and previous
 * assessment and its trend.
 */
export function analyse(q = {}) {
  const hist = histories();
  const name = lookups();
  const fu = followUps();
  const mats = getMaterials().filter((m) => SURVEYED.includes(m.acmStatus)
    && (!q.school || m.schoolId === q.school) && (!q.building || m.buildingId === q.building)
    && (!q.floor || m.floorId === q.floor) && (!q.room || m.roomId === q.room) && (!q.acm || m.id === q.acm)
    && (!q.materialType || m.materialType === q.materialType) && (!q.classification || m.classification === q.classification)
    && (!q.friability || m.friability === q.friability));
  const rows = [];
  for (const m of mats) {
    const all = (hist.get(m.id) ?? []).filter((e) => (!q.to || e.date <= q.to));
    const upTo = q.inspectionType ? all.filter((e) => e.type === q.inspectionType) : all;
    if (!upTo.length) continue;
    const inRange = q.from ? upTo.filter((e) => e.date >= q.from) : upTo;
    if (q.from && !inRange.length) continue; // nothing assessed in the period
    const cur = upTo.at(-1);
    const prev = upTo.at(-2) ?? null;
    if (q.condition && cur.condition !== q.condition) continue;
    const trend = trendOf(prev, cur);
    rows.push({
      id: m.id, acmId: shortAcm(m.id), schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
      school: name.school(m.schoolId), building: name.building(m.buildingId), floor: name.floor(m.floorId), room: name.room(m.roomId),
      material: m.name, materialType: m.materialType, classification: m.classification, friability: m.friability,
      previous: prev?.condition ?? null, previousDate: prev?.date ?? null, current: cur.condition, lastDate: cur.date,
      lastType: cur.type, lastLink: cur.link ?? null, assessments: upTo.length, trend,
      followUp: fu.get(m.id) ?? { status: trend === 'deteriorating' || trend === 'significant' || cur.condition !== 'Good' ? 'needed' : 'none', label: trend === 'deteriorating' || trend === 'significant' || cur.condition !== 'Good' ? 'Follow-up needed' : '—', link: null },
    });
  }
  return { rows, hist };
}

// Every change between consecutive assessments in the period, by month (deteriorations and improvements)
function monthly(rows, hist, q) {
  const months = new Map();
  for (const r of rows) {
    const list = (hist.get(r.id) ?? []).filter((e) => (!q.to || e.date <= q.to) && (!q.inspectionType || e.type === q.inspectionType));
    for (let i = 1; i < list.length; i += 1) {
      const e = list[i];
      if (q.from && e.date < q.from) continue;
      const d = CONDITION_RANK[e.condition] - CONDITION_RANK[list[i - 1].condition];
      const key = e.date.slice(0, 7);
      if (!months.has(key)) months.set(key, { month: key, deteriorated: 0, improved: 0, assessed: 0 });
      const m = months.get(key);
      m.assessed += 1;
      if (d > 0) m.deteriorated += 1;
      else if (d < 0) m.improved += 1;
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-18);
}

// Group the analysed ACMs one level below the current drill-down (district → schools → buildings → floors → rooms)
function byLocation(rows, q) {
  const level = q.room ? 'acm' : q.floor ? 'room' : q.building ? 'floor' : q.school ? 'building' : 'school';
  const key = { school: 'schoolId', building: 'buildingId', floor: 'floorId', room: 'roomId', acm: 'id' }[level];
  const label = { school: 'school', building: 'building', floor: 'floor', room: 'room', acm: 'acmId' }[level];
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r[key])) groups.set(r[key], { id: r[key], name: r[label] || '—', total: 0, significant: 0, deteriorating: 0, stable: 0, improved: 0, baseline: 0 });
    const g = groups.get(r[key]);
    g.total += 1;
    g[r.trend] += 1;
  }
  return {
    level,
    items: [...groups.values()].sort((a, b) => (b.significant + b.deteriorating) - (a.significant + a.deteriorating) || b.significant - a.significant || a.name.localeCompare(b.name)).slice(0, 12),
  };
}

function byMaterial(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.materialType)) groups.set(r.materialType, { name: r.materialType || 'Other', total: 0, Good: 0, Damaged: 0, 'Significantly Damaged': 0 });
    const g = groups.get(r.materialType);
    g.total += 1;
    g[r.current] += 1;
  }
  return [...groups.values()].sort((a, b) => b.total - a.total).slice(0, 10);
}

// --- Alerts: rules people can switch on and tune; triggered against the analysed ACMs ---
const ALERT_FILE = new URL('../../data/trendAlerts.json', import.meta.url);
const DEFAULT_RULES = [
  { id: 'to-significant', name: 'ACM became Significantly Damaged', kind: 'toSignificant', enabled: true },
  { id: 'recent', name: 'Deterioration recorded in the last N days', kind: 'recentDeterioration', days: 90, enabled: true },
  { id: 'school-count', name: 'School with N or more deteriorating ACMs', kind: 'schoolCount', threshold: 3, enabled: true },
];
let rules = existsSync(ALERT_FILE) ? JSON.parse(readFileSync(ALERT_FILE, 'utf8')).rules : DEFAULT_RULES;
export const getRules = () => rules;
export async function saveRules(next) {
  rules = next;
  await writeJson(ALERT_FILE, { rules });
  return rules;
}

function alerts(rows) {
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  const worse = rows.filter((r) => r.trend === 'deteriorating' || r.trend === 'significant');
  for (const rule of rules.filter((x) => x.enabled)) {
    if (rule.kind === 'toSignificant') {
      // A summary line, then the most recent few ACMs
      const sig = rows.filter((x) => x.trend === 'significant').sort((a, b) => b.lastDate.localeCompare(a.lastDate));
      if (sig.length > 5) out.push({ rule: rule.id, severity: 'critical', text: `${sig.length} ACMs became Significantly Damaged at their latest assessment` });
      for (const r of sig.slice(0, 5)) out.push({ rule: rule.id, severity: 'critical', acm: r.id, text: `${r.acmId} (${r.material}) at ${r.school} became Significantly Damaged on ${r.lastDate}` });
    } else if (rule.kind === 'recentDeterioration') {
      const since = new Date(Date.parse(`${today}T00:00:00`) - (rule.days ?? 90) * 86400000).toISOString().slice(0, 10);
      const recent = worse.filter((r) => r.lastDate >= since);
      if (recent.length) out.push({ rule: rule.id, severity: 'warning', text: `${recent.length} ACM${recent.length === 1 ? '' : 's'} deteriorated in the last ${rule.days} days` });
    } else if (rule.kind === 'schoolCount') {
      const per = new Map();
      for (const r of worse) per.set(r.school, (per.get(r.school) ?? 0) + 1);
      for (const [s, n] of per) if (n >= (rule.threshold ?? 3)) out.push({ rule: rule.id, severity: 'warning', school: s, text: `${s} has ${n} deteriorating ACMs` });
    }
  }
  return out.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1)).slice(0, 50);
}

export function dashboard(q) {
  const { rows, hist } = analyse(q);
  const count = (t) => rows.filter((r) => r.trend === t).length;
  const attention = new Set(rows.filter((r) => r.trend === 'deteriorating' || r.trend === 'significant' || r.current === 'Significantly Damaged').map((r) => r.schoolId));
  return {
    kpis: {
      total: rows.length, stable: count('stable'), deteriorating: count('deteriorating'), significant: count('significant'),
      improved: count('improved'), baseline: count('baseline'), schoolsAttention: attention.size,
    },
    byLocation: byLocation(rows, q),
    byMaterial: byMaterial(rows),
    monthly: monthly(rows, hist, q),
    alerts: alerts(rows),
    rows,
  };
}

/**
 * Condition overview for { school, materialType, months }: every surveyed ACM by its current condition, how many were
 * in each condition at the end of each month of the period, the split by material type and by school (with the
 * direction of change since the period started) and the ACMs whose latest assessment in the period was worse.
 */
export function overview(q = {}) {
  const hist = histories();
  const name = lookups();
  const months = Math.min(36, Math.max(3, Number(q.months) || 12));
  const now = new Date();
  const monthKeys = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const monthEnd = (key) => { const [y, m] = key.split('-').map(Number); return `${key}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
  const today = now.toISOString().slice(0, 10);
  const periodStart = `${monthKeys[0]}-01`;
  const conditionAt = (list, day) => { let c = null; for (const e of list) { if (e.date > day) break; c = e.condition; } return c; };
  const blank = () => ({ total: 0, Good: 0, Damaged: 0, 'Significantly Damaged': 0 });

  // The school comparison always lists every school (the chosen one is highlighted on the page)
  const mats = getMaterials().filter((m) => SURVEYED.includes(m.acmStatus) && (!q.materialType || m.materialType === q.materialType));
  const totals = blank();
  const series = monthKeys.map((month) => ({ month, ...blank() }));
  const materials = new Map();
  const perSchool = new Map();
  const worse = [];
  for (const m of mats) {
    const list = hist.get(m.id) ?? [];
    const current = list.at(-1)?.condition ?? (CONDITION_RANK[m.condition] !== undefined ? m.condition : null);
    if (!current) continue;
    if (!perSchool.has(m.schoolId)) perSchool.set(m.schoolId, { id: m.schoolId, name: name.school(m.schoolId), ...blank(), startAssessed: 0, startDamaged: 0 });
    const s = perSchool.get(m.schoolId);
    s.total += 1;
    s[current] += 1;
    const atStart = conditionAt(list, periodStart);
    if (atStart) { s.startAssessed += 1; if (atStart !== 'Good') s.startDamaged += 1; }
    if (q.school && m.schoolId !== q.school) continue;
    totals.total += 1;
    totals[current] += 1;
    monthKeys.forEach((key, i) => {
      const c = key === monthKeys.at(-1) ? conditionAt(list, today) : conditionAt(list, monthEnd(key));
      if (c) { series[i].total += 1; series[i][c] += 1; }
    });
    const type = m.materialType || 'Other';
    if (!materials.has(type)) materials.set(type, { name: type, ...blank() });
    const g = materials.get(type);
    g.total += 1;
    g[current] += 1;
    // Worse at its latest assessment in the period than at the one before
    const last = list.at(-1);
    const prev = list.at(-2);
    if (last && prev && last.date >= periodStart && CONDITION_RANK[last.condition] > CONDITION_RANK[prev.condition]) {
      worse.push({
        id: m.id, acmId: shortAcm(m.id), schoolId: m.schoolId, school: name.school(m.schoolId),
        location: [name.building(m.buildingId), name.room(m.roomId)].filter(Boolean).join(' – '),
        material: m.materialType || m.name, previous: prev.condition, current: last.condition, lastDate: last.date, lastType: last.type, link: last.link ?? null,
      });
    }
  }
  const schoolsOut = [...perSchool.values()].map(({ startAssessed, startDamaged, ...s }) => {
    const nowShare = s.total ? (s.Damaged + s['Significantly Damaged']) / s.total : 0;
    const startShare = startAssessed ? startDamaged / startAssessed : nowShare;
    const delta = nowShare - startShare;
    return { ...s, damagedShareChange: Math.round(delta * 1000) / 10, direction: delta > 0.02 ? 'up' : delta < -0.02 ? 'down' : 'flat' };
  }).sort((a, b) => b['Significantly Damaged'] / b.total - a['Significantly Damaged'] / a.total || b.total - a.total);
  return {
    months, kpis: totals, series,
    byMaterial: [...materials.values()].sort((a, b) => b.total - a.total).slice(0, 8),
    bySchool: schoolsOut,
    deteriorating: worse.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || CONDITION_RANK[b.current] - CONDITION_RANK[a.current]).slice(0, 100),
  };
}

// One ACM's condition history (oldest first) with what was observed and any photos
export function acmTimeline(id) {
  const m = getMaterials().find((x) => x.id === id);
  if (!m) return null;
  const name = lookups();
  const list = histories().get(id) ?? [];
  return {
    id: m.id, acmId: shortAcm(m.id), material: m.name, materialType: m.materialType, classification: m.classification, friability: m.friability,
    school: name.school(m.schoolId), building: name.building(m.buildingId), floor: name.floor(m.floorId), room: name.room(m.roomId),
    schoolId: m.schoolId, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
    trend: trendOf(list.at(-2) ?? null, list.at(-1) ?? { condition: m.condition }),
    entries: list.map((e, i) => ({ ...e, change: i === 0 ? null : Math.sign(CONDITION_RANK[e.condition] - CONDITION_RANK[list[i - 1].condition]) })),
  };
}
