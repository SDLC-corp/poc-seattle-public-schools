import { naturalCompare } from '../data/naturalSort.js';
import { Router } from 'express';
import { schools, buildings } from '../data/store.js';
import { getMaterials, getMaterial, allRooms, updateMaterial } from '../data/roomsStore.js';
import { getAssessment, saveAssessment } from '../data/riskAssessmentStore.js';
import { getRoles, saveRoles } from '../data/planRolesStore.js';
import { getSchedules, saveSchedules, getOverrides, saveOverride } from '../data/planSchedulesStore.js';
import { getEvents as getAirEvents } from '../data/airStore.js';
import { trainingFor } from '../data/omMeta.js';
import { getEmergency, saveEmergency } from '../data/planEmergencyStore.js';
import { getControls, saveControl } from '../data/planControlsStore.js';
import { getAllFloors } from '../data/floorsStore.js';
import { getPeople } from '../data/personnelStore.js';
import { getInspections } from '../data/complianceStore.js';
import { getRecords as getInspectionRecords } from '../data/inspectionRecordsStore.js';
import { getRecords as getSurveillance } from '../data/surveillanceStore.js';
import * as OM from '../data/omStore.js';
import { listUsers } from './users.js';
import { getWorkflow, saveWorkflow, removeWorkflow } from '../data/planWorkflowStore.js';
import { logAudit, currentUser } from '../data/auditStore.js';

const MODULE = 'Management Plans';
const HANDLES = new Set(['t', 'b', 'l', 'r']);
// Diagram shapes in the Workflow & Approvals editor
const KINDS = new Set(['start', 'process', 'decision', 'register', 'outcome', 'level', 'control', 'card', 'group']);
const TONES = new Set(['high', 'medium', 'low']);
const size = (v) => (Number.isFinite(v) && v >= 20 && v <= 1500 ? Math.round(v) : null);

// Asbestos Management Plan summary for one school, assembled from the app's live data
// (ACM inventory, inspections, surveillance, O&M, training). Nothing here is stored separately.
const router = Router();
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const RISK_RANK = { High: 3, Medium: 2, Low: 1 };

router.get('/:schoolId', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  const today = todayIso();
  const sid = school.id;

  const blds = buildings.filter((b) => b.schoolId === sid);
  const materials = getMaterials({ schoolId: sid });
  const acm = materials.filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM');
  const highRisk = acm.filter((m) => m.riskRanking === 'High');

  // O&M plan for the school carries the plan's version and review dates
  const omPlan = OM.find('plans', `PLAN-${sid}`);
  const district = OM.find('plans', 'PLAN-DISTRICT');
  const reviewOverdue = omPlan ? omPlan.nextReview < today : true;

  const omOpen = OM.all('activities').filter((a) => a.schoolId === sid && a.state !== 'completed');
  const omOverdue = omOpen.filter((a) => a.dueDate < today);

  const scheduledInsp = getInspectionRecords().filter((r) => r.schoolId === sid && r.state === 'scheduled');
  const schedule = getInspections().filter((i) => i.schoolId === sid && i.status !== 'completed');
  const inspOverdue = schedule.filter((i) => i.status === 'overdue').length + scheduledInsp.filter((r) => r.scheduledDate < today).length;

  // Surveillance: every ACM should have been surveyed within its 6-month window
  const lastSurv = new Map();
  for (const r of getSurveillance()) {
    if (r.schoolId !== sid || r.state === 'draft') continue;
    if (!lastSurv.has(r.materialId) || r.date > lastSurv.get(r.materialId).date) lastSurv.set(r.materialId, r);
  }
  const survOverdue = acm.filter((m) => { const l = lastSurv.get(m.id); return !l || l.nextDue < today; }).length;

  const staff = getPeople().filter((p) => p.schoolId === sid);
  const staffCurrent = staff.filter((p) => p.trainingStatus !== 'expired');
  // Schools without assigned staff are covered by the district's maintenance & custodial crews
  const districtStaff = getPeople().filter((p) => p.category === 'employee-maintenance' || p.category === 'employee-custodial');
  const districtCurrent = districtStaff.filter((p) => p.trainingStatus !== 'expired');
  const fiberSop = OM.all('procedures').find((p) => p.category === 'Fiber Release');
  const assessed = acm.filter((m) => m.condition && m.condition !== 'Not Assessed' && m.riskRanking);

  const elements = [
    { n: 1, key: 'identify', title: 'Identify & Record', sub: 'Asbestos Register', link: '/acm',
      done: acm.length > 0 && !materials.some((m) => m.acmStatus === 'Not Yet Assessed'),
      detail: `${acm.length} ACM records in ${blds.length} buildings` },
    { n: 2, key: 'assess', title: 'Assess Risk', sub: 'Risk Assessment', link: '/inspections',
      done: assessed.length === acm.length,
      detail: `${assessed.length} of ${acm.length} ACM assessed` },
    { n: 3, key: 'control', title: 'Control the Risk', sub: 'Control Measures', link: '/operations',
      done: Boolean(omPlan) && omOverdue.length === 0,
      detail: omOverdue.length ? `${omOverdue.length} O&M work order${omOverdue.length > 1 ? 's' : ''} overdue` : 'O&M plan in place, no overdue work' },
    { n: 4, key: 'monitor', title: 'Monitor & Inspect', sub: 'Monitoring Plan', link: '/surveillance/schedule',
      done: survOverdue === 0 && inspOverdue === 0,
      detail: survOverdue || inspOverdue ? `${survOverdue} surveillance and ${inspOverdue} inspection${inspOverdue === 1 ? '' : 's'} overdue` : 'Surveillance and inspections up to date' },
    { n: 5, key: 'train', title: 'Communicate & Train', sub: 'Awareness', link: '/personnel',
      done: staff.length > 0 && staffCurrent.length === staff.length,
      detail: staff.length ? `${staffCurrent.length} of ${staff.length} school staff trained`
        : `No staff assigned to this school · district: ${districtCurrent.length} of ${districtStaff.length} trained` },
    { n: 6, key: 'respond', title: 'Respond to Incidents', sub: 'Emergency Procedures', link: '/operations/procedures',
      done: Boolean(fiberSop) && !omOpen.some((a) => a.type === 'Fiber Release Response' && a.dueDate < today),
      detail: fiberSop ? `${fiberSop.id} ${fiberSop.title}` : 'No fiber-release procedure' },
    { n: 7, key: 'review', title: 'Review & Improve', sub: 'Plan Review', link: '/operations/plans',
      done: Boolean(omPlan) && !reviewOverdue,
      detail: omPlan ? `Next review ${omPlan.nextReview}` : 'No plan on record' },
  ];
  const completeness = Math.round((elements.filter((e) => e.done).length / elements.length) * 100);

  const ehs = listUsers().filter((u) => u.roleId === 'ehs-manager');
  // Same roles as the plan's Roles & Responsibilities tab (inactive ones left out)
  const roles = planRoles(school).filter((r) => r.status !== 'Inactive').map((r) => ({
    role: r.title, icon: r.icon,
    who: r.status === 'Vacant' ? 'Vacant' : r.person ? `${r.person.name}${r.person.position ? `, ${r.person.position}` : ''}` : r.group ? 'Everyone on site' : 'Not assigned',
    responsibilities: r.responsibilities.join('; '),
  }));

  const buildingRows = blds.map((b) => {
    const ms = acm.filter((m) => m.buildingId === b.id);
    const top = ms.reduce((r, m) => Math.max(r, RISK_RANK[m.riskRanking] ?? 0), 0);
    return {
      id: b.id, name: b.name, acmRecords: ms.length, highRisk: ms.filter((m) => m.riskRanking === 'High').length,
      damaged: ms.filter((m) => m.condition === 'Damaged' || m.condition === 'Significantly Damaged').length,
      riskStatus: top === 3 ? 'High' : top === 2 ? 'Medium' : ms.length ? 'Low' : 'None',
    };
  });

  const bname = new Map(blds.map((b) => [b.id, b.name]));
  const actions = [
    ...omOpen.map((a) => ({
      id: a.id, action: a.type, detail: a.description, location: bname.get(a.buildingId) ?? '', due: a.dueDate,
      priority: a.priority === 'Urgent' ? 'High' : a.priority, link: `/operations/activities/${a.id}`, overdue: a.dueDate < today,
    })),
    ...scheduledInsp.map((r) => ({
      id: r.id, action: r.type, detail: 'Inspection', location: bname.get(r.buildingId) ?? '', due: r.scheduledDate,
      priority: r.type === 'Damage Assessment' ? 'High' : 'Medium', link: `/inspections/records/${r.id}`, overdue: r.scheduledDate < today,
    })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  const plan = {
    id: `AMP-${String(schools.indexOf(school) + 1).padStart(5, '0')}`,
    name: `${school.name} – Asbestos Management Plan`,
    version: omPlan?.version ?? '1.0',
    effectiveDate: omPlan?.effectiveDate ?? null,
    lastReviewed: omPlan?.effectiveDate ?? null,
    nextReview: omPlan?.nextReview ?? null,
    owner: omPlan?.owner ?? null,
    status: !omPlan ? 'Draft' : reviewOverdue ? 'Review Overdue' : 'Active',
    districtPlan: district ? `${district.name} v${district.version}` : null,
  };

  res.json({
    school: { id: school.id, name: school.name, type: school.type, address: school.address?.full ?? '' },
    plan,
    stats: {
      buildings: blds.length, acmRecords: acm.length, highRisk: highRisk.length, pendingActions: actions.length,
      upcomingInspections: scheduledInsp.length + schedule.filter((i) => i.status !== 'overdue').length, completeness,
    },
    elements, roles, buildings: buildingRows, actions: actions.slice(0, 8),
    // Milestones from the plan record (current version): drafted and reviewed by the coordinator,
    // approved by the Designated Person when it took effect
    review: [
      { label: 'Draft Created', date: plan.effectiveDate, by: plan.owner ? `${plan.owner}, Asbestos Coordinator` : 'Asbestos Coordinator', done: Boolean(plan.effectiveDate) },
      { label: 'Reviewed', date: plan.lastReviewed, by: plan.owner ? `${plan.owner}, Asbestos Coordinator` : null, done: Boolean(plan.lastReviewed) },
      { label: 'Approved', date: plan.effectiveDate, by: ehs[0]?.name ? `${ehs[0].name}, Designated Person` : null, done: Boolean(plan.effectiveDate) },
      { label: 'Next Review', date: plan.nextReview, by: null, done: false, overdue: reviewOverdue },
    ],
    generatedAt: new Date().toISOString(),
  });
});

// Control action for an ACM: an open O&M work order if there is one, otherwise the AHERA response
// action that fits its condition and risk
function controlAction(m, openWork) {
  if (openWork) return { text: `${openWork.type} – ${openWork.id}`, link: `/operations/activities/${openWork.id}` };
  if (m.condition === 'Significantly Damaged') return { text: 'Restrict access, plan removal by licensed contractor' };
  if (m.condition === 'Damaged') return { text: 'Repair or encapsulate, re-inspect after work' };
  if (m.riskRanking === 'High') return { text: 'Seal & encapsulate, monitor 6-monthly' };
  if (m.riskRanking === 'Medium') return { text: 'Manage in place, monitor 6-monthly' };
  if (m.condition === 'Not Assessed') return { text: 'Assess condition at next inspection' };
  return { text: 'Label & maintain, routine O&M' };
}

// Asbestos register: every confirmed or presumed ACM at the school with its current control action
router.get('/:schoolId/register', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  const bname = new Map(buildings.filter((b) => b.schoolId === school.id).map((b) => [b.id, b.name]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  const floors = new Map(getAllFloors().map((f) => [f.id, f]));
  const openWork = new Map();
  for (const a of OM.all('activities')) {
    if (a.schoolId === school.id && a.state !== 'completed' && (!openWork.has(a.materialId) || a.dueDate < openWork.get(a.materialId).dueDate)) openWork.set(a.materialId, a);
  }
  const prefix = `ACM-${school.id}-`;
  const records = getMaterials({ schoolId: school.id })
    .filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM')
    .map((m) => {
      const room = rooms.get(m.roomId);
      return {
        id: m.id, ref: m.id.startsWith(prefix) ? m.id.slice(prefix.length).toUpperCase() : m.id,
        schoolId: school.id, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
        building: bname.get(m.buildingId) ?? m.buildingId, floor: floors.get(m.floorId)?.name ?? '',
        room: room ? `${room.name}${room.number && !room.name.includes(room.number) ? ` (${room.number})` : ''}` : '', location: m.location,
        description: m.name, materialType: m.materialType, friability: m.friability,
        quantity: m.quantity, unit: m.unit, condition: m.condition || 'Not Assessed', risk: m.riskRanking || null,
        status: m.acmStatus, assessmentDate: m.assessmentDate, control: controlAction(m, openWork.get(m.id)),
      };
    })
    .sort((a, b) => a.building.localeCompare(b.building) || naturalCompare(a.ref, b.ref));
  const count = (risk) => records.filter((r) => r.risk === risk).length;
  res.json({
    stats: {
      total: records.length, high: count('High'), medium: count('Medium'), low: count('Low'),
      buildings: new Set(records.map((r) => r.buildingId)).size, locations: new Set(records.map((r) => r.roomId)).size,
    },
    records,
  });
});

// ---- Monitoring & inspection schedule
// Frequencies used by the plan: surveillance 6 months, AHERA inspection 3 years, re-inspection 1 year,
// plan review 12 months
const FREQUENCIES = [
  { activity: 'Periodic surveillance (condition check)', every: 'Every 6 months' },
  { activity: 'AHERA inspection', every: 'Every 3 years' },
  { activity: 'Re-inspection (high & medium risk)', every: 'Every 1 year' },
  { activity: 'Management plan review', every: 'Every 12 months' },
  { activity: 'Air monitoring', every: 'As required (e.g. during works)' },
  { activity: 'Post-work clearance check', every: 'After each work' },
];
const DUE_SOON = 30;
// Standard activities with a frequency in months (can be changed per plan)
const STANDARD_MONTHS = { surveillance: 6, inspection: 36, reinspection: 12, 'plan-review': 12 };
const STANDARD_IDS = new Set(['surveillance', 'inspection', 'reinspection', 'plan-review', 'air', 'clearance']);
const monthsLabel = (n) => (n % 12 === 0 ? `Every ${n / 12} year${n === 12 ? '' : 's'}` : `Every ${n} month${n === 1 ? '' : 's'}`);
const addMonths = (iso, n) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
const daysUntil = (iso, today) => Math.round((Date.parse(iso) - Date.parse(today)) / 86400000);
const maxIso = (list) => list.filter(Boolean).sort().at(-1) ?? null;
const minIso = (list) => list.filter(Boolean).sort()[0] ?? null;

// overdue · dueSoon · completed (this cycle done, next not due yet) · upcoming (planned, not done yet)
function scheduleStatus({ planned, lastDone, overdueCount = 0 }, today) {
  if (overdueCount > 0 || (planned && planned < today)) return 'overdue';
  if (planned && daysUntil(planned, today) <= DUE_SOON) return 'dueSoon';
  if (lastDone) return 'completed';
  return planned ? 'upcoming' : 'notScheduled';
}

function monitoringSchedule(school) {
  const today = todayIso();
  const sid = school.id;
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  const bname = new Map(buildings.filter((b) => b.schoolId === sid).map((b) => [b.id, b.name]));
  const acm = getMaterials({ schoolId: sid }).filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM');
  const where = (m) => `${bname.get(m.buildingId) ?? ''} / ${rooms.get(m.roomId)?.name ?? ''}`;
  const events = [];
  // Edits made to the standard activities in the plan (frequency, wording, planned date)
  const ov = getOverrides(sid);
  const every = (id) => ov[id]?.months ?? STANDARD_MONTHS[id];

  // 1. Periodic surveillance – every ACM at least every 6 months
  const lastSurv = new Map();
  for (const r of getSurveillance()) {
    if (r.schoolId !== sid || r.state === 'draft') continue;
    if (!lastSurv.has(r.materialId) || r.date > lastSurv.get(r.materialId).date) lastSurv.set(r.materialId, r);
  }
  const survDue = acm.map((m) => ({ m, due: (every('surveillance') === 6 ? lastSurv.get(m.id)?.nextDue : null) ?? addMonths(lastSurv.get(m.id)?.date, every('surveillance')) ?? today }));
  for (const { m, due } of survDue) events.push({ date: due, kind: 'surveillance', title: `Surveillance – ${m.name}`, detail: where(m), link: '/surveillance/schedule' });
  const survOverdue = survDue.filter((x) => x.due < today).length;

  // 2. AHERA inspection – every 3 years (from each ACM's last inspection)
  const inspRecords = getInspectionRecords().filter((r) => r.schoolId === sid);
  const lastInsp = new Map();
  for (const r of inspRecords) {
    if (!['approved', 'submitted'].includes(r.state) || !r.date) continue;
    if (!lastInsp.has(r.materialId) || r.date > lastInsp.get(r.materialId)) lastInsp.set(r.materialId, r.date);
  }
  const inspectedOn = (m) => maxIso([m.assessmentDate, lastInsp.get(m.id)]);
  const inspDue = acm.map((m) => ({ m, due: addMonths(inspectedOn(m), every('inspection')) ?? today }));
  const inspOverdue = inspDue.filter((x) => x.due < today).length;
  for (const r of inspRecords.filter((x) => x.state === 'scheduled')) {
    const m = acm.find((x) => x.id === r.materialId);
    events.push({ date: r.scheduledDate, kind: 'inspection', title: `${r.type}${m ? ` – ${m.name}` : ''}`, detail: m ? where(m) : '', link: `/inspections/records/${r.id}` });
  }

  // 3. Re-inspection of high & medium risk ACMs – every year (from the latest inspection or risk assessment)
  const priority = acm.filter((m) => m.riskRanking === 'High' || m.riskRanking === 'Medium');
  const reinspDue = priority.map((m) => ({ m, due: addMonths(maxIso([inspectedOn(m), getAssessment(m.id)?.date]), every('reinspection')) ?? today }));
  const reinspOverdue = reinspDue.filter((x) => x.due < today).length;
  for (const { m, due } of reinspDue) events.push({ date: due, kind: 'reinspection', title: `Re-inspection – ${m.name}`, detail: `${where(m)} · ${m.riskRanking} risk`, link: '/management-plans/risk' });

  // 4. Plan review – every 12 months
  const omPlan = OM.find('plans', `PLAN-${sid}`);
  const planNext = ov['plan-review']?.months ? addMonths(omPlan?.effectiveDate, every('plan-review')) : omPlan?.nextReview ?? null;
  if (planNext) events.push({ date: planNext, kind: 'plan', title: 'Management plan review', detail: 'Whole site', link: '/operations/plans' });

  // 5. Air monitoring – as required
  const air = getAirEvents().filter((e) => e.schoolId === sid);
  for (const e of air) events.push({ date: e.sampledAt.slice(0, 10), kind: 'air', title: `${e.type} air sample`, detail: `${e.buildingName ?? ''} – ${e.location ?? ''}`, link: '/air-monitoring', done: true });

  // 6. Clearance after each piece of work that disturbs ACM
  const works = OM.all('activities').filter((a) => a.schoolId === sid && a.state !== 'completed' && trainingFor(a.type) === 'om-16');
  for (const a of works) events.push({ date: a.dueDate, kind: 'clearance', title: `Clearance check after ${a.id}`, detail: a.type, link: `/operations/activities/${a.id}` });

  const row = (x) => ({ ...x, status: x.status ?? scheduleStatus(x, today) });
  const standard = [
    row({ id: 'surveillance', title: 'Periodic Surveillance', description: 'Visual condition check of every ACM', scope: `All ACM locations (${acm.length} ACMs)`,
      lastDone: maxIso([...lastSurv.values()].map((r) => r.date)), planned: minIso(survDue.map((x) => x.due)),
      overdueCount: survOverdue, detail: survOverdue ? `${survOverdue} of ${acm.length} ACMs overdue` : null, link: '/surveillance/schedule', module: 'Surveillance' }),
    row({ id: 'inspection', title: 'AHERA Inspection', description: 'Full inspection by an accredited inspector', scope: 'All buildings',
      lastDone: maxIso(acm.map(inspectedOn)), planned: minIso(inspDue.map((x) => x.due)),
      overdueCount: inspOverdue, detail: inspOverdue ? `${inspOverdue} of ${acm.length} ACMs overdue` : null, link: '/inspections', module: 'Inspections' }),
    row({ id: 'reinspection', title: 'Re-inspection', description: 'Condition and risk reassessment', scope: `High & Medium risk ACMs (${priority.length})`,
      lastDone: maxIso(priority.map((m) => maxIso([inspectedOn(m), getAssessment(m.id)?.date]))), planned: minIso(reinspDue.map((x) => x.due)),
      overdueCount: reinspOverdue, detail: reinspOverdue ? `${reinspOverdue} of ${priority.length} ACMs overdue` : null, link: '/management-plans/risk', module: 'Risk Assessment' }),
    row({ id: 'plan-review', title: 'Management Plan Review', description: 'Review and update the plan', scope: 'Whole site',
      lastDone: omPlan?.effectiveDate ?? null, planned: planNext, link: '/operations/plans', module: 'O&M Plans' }),
    row({ id: 'air', title: 'Air Monitoring (if required)', description: 'Air testing during specific works', scope: 'Work areas / as required',
      frequency: 'As required', lastDone: maxIso(air.map((e) => e.sampledAt.slice(0, 10))), planned: null, status: 'asRequired',
      detail: air.length ? `${air.length} sample${air.length === 1 ? '' : 's'}, ${air.filter((e) => e.status === 'pending').length} awaiting results` : null, link: '/air-monitoring', module: 'Air Monitoring' }),
    row({ id: 'clearance', title: 'Post-Work Clearance Check', description: 'Verification after ACM work', scope: 'Work areas',
      frequency: 'After each work', lastDone: null, planned: minIso(works.map((a) => a.dueDate)), status: works.length ? undefined : 'notScheduled',
      detail: works.length ? `After ${works.length} open disturbance work order${works.length === 1 ? '' : 's'}` : null, link: '/operations/work-orders', module: 'Operations & Maintenance' }),
  ];

  // Apply the plan's edits; a planned date set here replaces the one worked out from records
  const KIND = { surveillance: 'surveillance', inspection: 'inspection', reinspection: 'reinspection', 'plan-review': 'plan', air: 'air', clearance: 'clearance' };
  const edited = standard.map((r) => {
    const months = STANDARD_MONTHS[r.id] ? every(r.id) : null;
    const base = { ...r, months, frequency: months ? monthsLabel(months) : r.frequency, defaults: { title: r.title, description: r.description, scope: r.scope, months: STANDARD_MONTHS[r.id] ?? null, planned: r.planned } };
    const o = ov[r.id];
    if (!o) return base;
    if (o.planned) events.push({ date: o.planned, kind: KIND[r.id], title: `Planned: ${o.title || r.title}`, detail: o.scope || r.scope, link: '/management-plans/monitoring' });
    const planned = o.planned ?? r.planned;
    return {
      ...base, title: o.title || r.title, description: o.description ?? r.description, scope: o.scope || r.scope, planned, edited: true,
      status: o.planned ? scheduleStatus({ planned, lastDone: r.lastDone }, today) : r.status,
    };
  });

  const custom = getSchedules(sid).map((c) => {
    if (c.planned) events.push({ date: c.planned, kind: 'custom', title: c.title, detail: c.scope, link: '/management-plans/monitoring' });
    return row({ ...c, custom: true, frequency: c.months ? `Every ${c.months} month${c.months === 1 ? '' : 's'}` : c.repeat === 'once' ? 'One-off' : 'As required',
      status: !c.planned && !c.months ? (c.lastDone ? 'completed' : 'asRequired') : undefined });
  });

  const items = [...edited, ...custom].map((x) => ({ ...x, overdueCount: x.overdueCount ?? 0 }));
  const count = (...s) => items.filter((x) => s.includes(x.status)).length;
  return {
    items,
    events: events.filter((e) => e.date).map((e) => ({ ...e, overdue: !e.done && e.date < today })).sort((a, b) => a.date.localeCompare(b.date)),
    stats: { total: items.length, completed: count('completed'), upcoming: count('upcoming', 'dueSoon'), overdue: count('overdue'), nextPlanReview: edited.find((r) => r.id === 'plan-review')?.planned ?? null },
    frequencies: FREQUENCIES,
    today,
  };
}

router.get('/:schoolId/monitoring', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json(monitoringSchedule(school));
});

function cleanSchedule(body, id) {
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const iso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  const fields = {};
  const title = s(body?.title, 80);
  if (!title) fields.title = 'Enter the activity';
  const months = Number(body?.months) || 0;
  if (months && ![1, 3, 6, 12, 24, 36].includes(months)) fields.months = 'Choose a frequency from the list';
  const repeat = months ? 'every' : body?.repeat === 'once' ? 'once' : 'asRequired';
  const planned = iso(body?.planned);
  if (body?.planned && !planned) fields.planned = 'Enter a valid date';
  if (repeat !== 'asRequired' && !planned) fields.planned = 'Choose the planned date';
  const lastDone = iso(body?.lastDone);
  if (Object.keys(fields).length) return { fields };
  return { item: { id, title, description: s(body.description, 160), scope: s(body.scope, 80), months, repeat, planned, lastDone } };
}

router.post('/:schoolId/monitoring', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const list = getSchedules(school.id);
    if (list.length >= 40) return res.status(400).json({ error: 'A plan can have up to 40 extra activities' });
    const { item, fields } = cleanSchedule(req.body, `sch-${Date.now().toString(36)}`);
    if (fields) return res.status(400).json({ error: 'Check the highlighted fields', fields });
    await saveSchedules(school.id, [...list, item]);
    logAudit(req, { action: 'create', module: MODULE, recordId: school.id, link: '/management-plans/monitoring', summary: `Added "${item.title}" to the ${school.name} monitoring schedule` });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// Update an added activity; { done: true } records it as done today and rolls the next date forward
router.put('/:schoolId/monitoring/:itemId', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const itemId = req.params.itemId;

    // Standard activity: store the plan's edits (or { reset: true } to go back to the standard)
    if (STANDARD_IDS.has(itemId)) {
      const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const before = monitoringSchedule(school).items.find((x) => x.id === itemId);
      if (req.body?.reset) {
        await saveOverride(school.id, itemId, null);
        logAudit(req, { action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/monitoring', summary: `Reset "${before.defaults.title}" to the standard schedule for ${school.name}` });
        return res.json(monitoringSchedule(school).items.find((x) => x.id === itemId));
      }
      const fields = {};
      const months = req.body?.months == null || req.body.months === '' ? null : Number(req.body.months);
      if (months !== null && (!STANDARD_MONTHS[itemId] || ![1, 3, 6, 12, 24, 36].includes(months))) fields.months = 'Choose a frequency from the list';
      const planned = req.body?.planned || null;
      if (planned && (!/^\d{4}-\d{2}-\d{2}$/.test(planned) || Number.isNaN(Date.parse(planned)))) fields.planned = 'Enter a valid date';
      if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields', fields });
      const d = before.defaults;
      const o = {
        ...(s(req.body.title, 80) && s(req.body.title, 80) !== d.title ? { title: s(req.body.title, 80) } : {}),
        ...(s(req.body.description, 160) !== d.description ? { description: s(req.body.description, 160) } : {}),
        ...(s(req.body.scope, 80) && s(req.body.scope, 80) !== d.scope ? { scope: s(req.body.scope, 80) } : {}),
        ...(months && months !== d.months ? { months } : {}),
        ...(planned ? { planned } : {}),
      };
      await saveOverride(school.id, itemId, Object.keys(o).length ? o : null);
      const after = monitoringSchedule(school).items.find((x) => x.id === itemId);
      const changes = [
        before.title !== after.title && { field: 'Activity', from: before.title, to: after.title },
        before.frequency !== after.frequency && { field: 'Frequency', from: before.frequency, to: after.frequency },
        before.planned !== after.planned && { field: 'Planned Date', from: before.planned, to: after.planned },
        before.scope !== after.scope && { field: 'Area / Scope', from: before.scope, to: after.scope },
      ].filter(Boolean);
      logAudit(req, { action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/monitoring', summary: `Updated "${after.title}" in the ${school.name} monitoring schedule`, changes });
      return res.json(after);
    }

    const list = getSchedules(school.id);
    const i = list.findIndex((x) => x.id === itemId);
    if (i < 0) return res.status(404).json({ error: 'Activity not found' });
    let item;
    if (req.body?.done) {
      const today = todayIso();
      item = { ...list[i], lastDone: today, planned: list[i].months ? addMonths(today, list[i].months) : null };
    } else {
      const r = cleanSchedule(req.body, list[i].id);
      if (r.fields) return res.status(400).json({ error: 'Check the highlighted fields', fields: r.fields });
      item = r.item;
    }
    list[i] = item;
    await saveSchedules(school.id, list);
    logAudit(req, {
      action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/monitoring',
      summary: req.body?.done ? `Recorded "${item.title}" as done (${item.lastDone}) for ${school.name}` : `Updated "${item.title}" in the ${school.name} monitoring schedule`,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete('/:schoolId/monitoring/:itemId', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const list = getSchedules(school.id);
    const item = list.find((x) => x.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Activity not found' });
    await saveSchedules(school.id, list.filter((x) => x.id !== item.id));
    logAudit(req, { action: 'delete', module: MODULE, recordId: school.id, link: '/management-plans/monitoring', summary: `Removed "${item.title}" from the ${school.name} monitoring schedule` });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- Control measures
// Typical AHERA response actions; `text` is how the measure reads in the plan
const CONTROL_TYPES = [
  { id: 'encapsulation', label: 'Encapsulation / Sealing', text: 'Seal and encapsulate the ACM' },
  { id: 'access', label: 'Access Restriction & Signage', text: 'Restrict access and display signage' },
  { id: 'monitoring', label: 'Condition Monitoring / Re-inspection', text: 'Condition monitoring and periodic re-inspection' },
  { id: 'removal', label: 'Removal by Licensed Contractor', text: 'Plan removal by a licensed contractor' },
  { id: 'maintain', label: 'Maintain & Keep Undisturbed', text: 'Keep intact and undisturbed' },
  { id: 'air', label: 'Air Monitoring (if required)', text: 'Air monitoring during any works' },
  { id: 'enclosure', label: 'Enclosure', text: 'Enclose the ACM to prevent disturbance' },
  { id: 'repair', label: 'Repair', text: 'Repair damaged areas' },
  { id: 'label', label: 'Labelling', text: 'Mark and label the ACM' },
];
const CONTROL_IDS = new Set(CONTROL_TYPES.map((t) => t.id));
const CONTROL_STATUSES = new Set(['notStarted', 'inProgress', 'implemented']);
// How long after assessment a control should be in place
const CONTROL_MONTHS = { High: 1, Medium: 3, Low: 12 };
// O&M work that puts a control in place (routine cleaning / maintenance doesn't count)
const CONTROL_WORK = new Set(['Encapsulation', 'Minor Repair', 'Labeling / Signage', 'Enclosure Check', 'Controlled Disturbance', 'Fiber Release Response']);

function standardControl(m, work) {
  const measures = m.condition === 'Significantly Damaged' ? ['access', 'removal', 'air']
    : m.condition === 'Damaged' ? ['repair', 'encapsulation', 'access']
      : m.riskRanking === 'High' ? ['encapsulation', 'access']
        : m.riskRanking === 'Medium' ? ['maintain', 'monitoring']
          : ['label', 'maintain'];
  const control = work.filter((a) => CONTROL_WORK.has(a.type));
  const open = control.filter((a) => a.state !== 'completed').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const done = control.filter((a) => a.state === 'completed').sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const base = maxIso([m.assessmentDate, getAssessment(m.id)?.date]);
  // Material in good condition is managed in place (keep undisturbed, label, monitor): in place already
  const inPlace = m.condition === 'Good';
  return {
    measures, roleId: m.riskRanking === 'High' ? 'arp' : 'facilities', notes: '',
    target: open?.dueDate ?? addMonths(base, CONTROL_MONTHS[m.riskRanking] ?? 12),
    status: open ? 'inProgress' : done || inPlace ? 'implemented' : 'notStarted',
    work: open ? { id: open.id, type: open.type, assignee: open.assignedToName } : done ? { id: done.id, type: done.type, assignee: done.assignedToName, completedAt: done.completedAt.slice(0, 10) } : null,
  };
}

function controlRecords(school) {
  const today = todayIso();
  const saved = getControls(school.id);
  const roles = new Map(planRoles(school).map((r) => [r.id, r]));
  const bname = new Map(buildings.filter((b) => b.schoolId === school.id).map((b) => [b.id, b.name]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  const workBy = new Map();
  for (const a of OM.all('activities')) {
    if (a.schoolId !== school.id) continue;
    if (!workBy.has(a.materialId)) workBy.set(a.materialId, []);
    workBy.get(a.materialId).push(a);
  }
  const prefix = `ACM-${school.id}-`;
  const rank = { High: 0, Medium: 1, Low: 2 };
  return getMaterials({ schoolId: school.id })
    .filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM')
    .map((m) => {
      const std = standardControl(m, workBy.get(m.id) ?? []);
      const c = saved[m.id] ? { ...std, ...saved[m.id], work: std.work } : std;
      const role = roles.get(c.roleId);
      const status = c.status !== 'implemented' && c.target && c.target < today ? 'overdue' : c.status;
      return {
        id: m.id, ref: m.id.startsWith(prefix) ? m.id.slice(prefix.length).toUpperCase() : m.id,
        schoolId: school.id, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
        name: m.name, building: bname.get(m.buildingId) ?? '', room: rooms.get(m.roomId)?.name ?? '', risk: m.riskRanking, condition: m.condition,
        measures: c.measures, actions: [...c.measures.map((id) => CONTROL_TYPES.find((t) => t.id === id)?.text).filter(Boolean), ...(c.notes ? [c.notes] : [])],
        roleId: c.roleId, responsible: role?.title ?? '—', responsiblePerson: role?.person?.name ?? null,
        target: c.target, setStatus: c.status, status, notes: c.notes ?? '', work: c.work, customised: Boolean(saved[m.id]),
      };
    })
    .sort((a, b) => (rank[a.risk] ?? 3) - (rank[b.risk] ?? 3) || a.building.localeCompare(b.building) || naturalCompare(a.ref, b.ref));
}

router.get('/:schoolId/controls', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  const records = controlRecords(school);
  const count = (s) => records.filter((r) => r.status === s).length;
  res.json({
    records,
    stats: { total: records.length, implemented: count('implemented'), inProgress: count('inProgress'), notStarted: count('notStarted'), overdue: count('overdue') },
    types: CONTROL_TYPES,
    roles: planRoles(school).filter((r) => !r.group).map((r) => ({ id: r.id, title: r.title, name: r.person?.name ?? null })),
  });
});

// Set an ACM's control measures; { reset: true } goes back to the worked-out measures
router.put('/:schoolId/controls/:materialId', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    const m = getMaterial(req.params.materialId);
    if (!school || !m || m.schoolId !== school.id) return res.status(404).json({ error: 'ACM record not found for this school' });
    if (req.body?.reset) {
      await saveControl(school.id, m.id, null);
      logAudit(req, { action: 'update', module: MODULE, recordId: m.id, link: '/management-plans/controls', summary: `Reset the control measures for ${m.id} (${m.name})` });
      return res.json(controlRecords(school).find((r) => r.id === m.id));
    }
    const fields = {};
    const measures = [...new Set((Array.isArray(req.body?.measures) ? req.body.measures : []).filter((x) => CONTROL_IDS.has(x)))];
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 300) : '';
    if (!measures.length && !notes) fields.measures = 'Choose at least one control measure';
    const roleId = req.body?.roleId;
    if (!planRoles(school).some((r) => r.id === roleId)) fields.roleId = 'Choose who is responsible';
    const target = req.body?.target;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target ?? '') || Number.isNaN(Date.parse(target))) fields.target = 'Choose the target date';
    const status = req.body?.status;
    if (!CONTROL_STATUSES.has(status)) fields.status = 'Choose a status';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields', fields });
    const before = controlRecords(school).find((r) => r.id === m.id);
    await saveControl(school.id, m.id, { measures, notes, roleId, target, status });
    const after = controlRecords(school).find((r) => r.id === m.id);
    const label = { notStarted: 'Not Started', inProgress: 'In Progress', implemented: 'Implemented', overdue: 'Overdue' };
    logAudit(req, {
      action: 'update', module: MODULE, recordId: m.id, link: '/management-plans/controls',
      summary: `Updated the control measures for ${m.id} (${m.name})`,
      changes: [
        before.actions.join('; ') !== after.actions.join('; ') && { field: 'Control Measures', from: before.actions.join('; '), to: after.actions.join('; ') },
        before.responsible !== after.responsible && { field: 'Responsible', from: before.responsible, to: after.responsible },
        before.target !== after.target && { field: 'Target Date', from: before.target, to: after.target },
        before.status !== after.status && { field: 'Status', from: label[before.status], to: label[after.status] },
      ].filter(Boolean),
    });
    res.json(after);
  } catch (err) {
    next(err);
  }
});

// ---- Emergency procedures
const STEP_ICONS = new Set(['stop', 'people', 'secure', 'notify', 'assess', 'record', 'clearance', 'alert', 'phone', 'shield']);
const DEFAULT_STEPS = [
  { icon: 'stop', title: 'Stop Work Immediately', text: 'Cease the activity that may be disturbing asbestos.' },
  { icon: 'people', title: 'Keep People Safe', text: 'Evacuate the affected area and prevent access.' },
  { icon: 'secure', title: 'Secure and Isolate', text: 'Close doors, shut down HVAC serving the area, display warning signage, and restrict the area.' },
  { icon: 'notify', title: 'Notify Key Contacts', text: 'Inform the Asbestos Responsible Person (ARP) and the Duty Holder.' },
  { icon: 'assess', title: 'Arrange Professional Assessment', text: 'Contact an accredited asbestos contractor or consultant for inspection and advice.' },
  { icon: 'record', title: 'Record and Report', text: 'Log the incident, actions taken, and outcomes in the system.' },
  { icon: 'clearance', title: 'Clearance and Re-occupy', text: 'Resume use only after written clearance (visual inspection and air test) from a competent person.' },
];
// Roles listed as emergency contacts unless the plan picks others
const DEFAULT_CONTACT_ROLES = ['arp', 'duty-holder', 'facilities', 'contractor'];
const EMERGENCY_SERVICES = { key: 'emergency', role: 'Emergency (if required)', name: 'Fire / Police / Medical', phone: '911', source: 'emergency' };
// SOPs that support an emergency response
const EMERGENCY_SOP_CATEGORIES = ['Fiber Release', 'Labeling', 'General', 'Waste Handling', 'Cleaning'];

function emergencyPlan(school) {
  const saved = getEmergency(school.id);
  const roles = planRoles(school);
  const roleIds = saved.roleIds ?? DEFAULT_CONTACT_ROLES.filter((id) => roles.some((r) => r.id === id));
  const contacts = [
    ...roleIds.map((id) => roles.find((r) => r.id === id)).filter(Boolean).map((r) => ({
      key: `role:${r.id}`, role: r.title, name: r.person?.name ?? (r.status === 'Vacant' ? 'Vacant' : 'Not assigned'),
      organization: r.person?.organization ?? '', phone: r.person?.phone ?? '', email: r.person?.email ?? '', source: 'role',
    })),
    ...(saved.extra ?? []).map((c, i) => ({ key: `extra:${i}`, ...c, source: 'extra' })),
    EMERGENCY_SERVICES,
  ];
  const resources = OM.all('procedures')
    .filter((p) => EMERGENCY_SOP_CATEGORIES.includes(p.category))
    .sort((a, b) => EMERGENCY_SOP_CATEGORIES.indexOf(a.category) - EMERGENCY_SOP_CATEGORIES.indexOf(b.category))
    .map((p) => ({ id: p.id, title: p.title, category: p.category, version: p.version, hasFile: Boolean(p.file?.storedName), fileName: p.file?.name ?? null }));
  return {
    steps: saved.steps ?? DEFAULT_STEPS, stepsCustomised: Boolean(saved.steps),
    contacts, roleIds, extra: saved.extra ?? [],
    roleOptions: roles.filter((r) => !r.group).map((r) => ({ id: r.id, title: r.title, name: r.person?.name ?? null, status: r.status })),
    resources,
  };
}

router.get('/:schoolId/emergency', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json(emergencyPlan(school));
});

// { steps: [...] } or { steps: null } to go back to the standard steps
router.put('/:schoolId/emergency/steps', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    let steps = null;
    if (req.body?.steps !== null) {
      if (!Array.isArray(req.body?.steps)) return res.status(400).json({ error: 'Steps are required' });
      steps = req.body.steps.map((x) => ({ icon: STEP_ICONS.has(x?.icon) ? x.icon : 'alert', title: s(x?.title, 80), text: s(x?.text, 240) }));
      if (!steps.length || steps.length > 15) return res.status(400).json({ error: 'Keep between 1 and 15 steps' });
      const bad = steps.findIndex((x) => !x.title);
      if (bad >= 0) return res.status(400).json({ error: `Step ${bad + 1} needs a title`, fields: { [`step${bad}`]: 'Enter a title' } });
    }
    await saveEmergency(school.id, { steps });
    logAudit(req, {
      action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/emergency',
      summary: steps ? `Updated the emergency response steps for ${school.name} (${steps.length} steps)` : `Reset the emergency response steps for ${school.name} to the standard`,
    });
    res.json(emergencyPlan(school));
  } catch (err) {
    next(err);
  }
});

// { roleIds: [...], extra: [{ role, name, organization, phone, email }] }
router.put('/:schoolId/emergency/contacts', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const known = new Set(planRoles(school).map((r) => r.id));
    const roleIds = Array.isArray(req.body?.roleIds) ? [...new Set(req.body.roleIds.filter((id) => known.has(id)))] : [];
    const extra = (Array.isArray(req.body?.extra) ? req.body.extra : []).slice(0, 10)
      .map((c) => ({ role: s(c?.role, 80), name: s(c?.name, 80), organization: s(c?.organization, 80), phone: s(c?.phone, 40), email: s(c?.email, 120) }))
      .filter((c) => c.role || c.name || c.phone);
    const fields = {};
    extra.forEach((c, i) => {
      if (!c.role) fields[`extra${i}.role`] = 'Enter the role';
      if (!c.phone && !c.email) fields[`extra${i}.phone`] = 'Enter a phone number or email';
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) fields[`extra${i}.email`] = 'Enter a valid email address';
    });
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields', fields });
    await saveEmergency(school.id, { roleIds, extra });
    logAudit(req, {
      action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/emergency',
      summary: `Updated the emergency contacts for ${school.name} (${roleIds.length} roles, ${extra.length} other contact${extra.length === 1 ? '' : 's'})`,
    });
    res.json(emergencyPlan(school));
  } catch (err) {
    next(err);
  }
});

// ---- Roles & responsibilities
const ROLE_ICONS = new Set(['duty', 'coordinator', 'facilities', 'contractors', 'inspector', 'staff', 'briefcase', 'phone']);
const ROLE_STATUSES = new Set(['Active', 'Vacant', 'Inactive']);

// People a role can be assigned to: app users and personnel (employees, contractors)
function candidates() {
  return [
    ...listUsers().filter((u) => u.status === 'active').map((u) => ({
      key: `user:${u.id}`, name: u.name, position: u.jobTitle ?? '', organization: u.department ?? '', phone: u.phone ?? '', email: u.email ?? '', source: 'User',
    })),
    ...getPeople().filter((p) => p.status === 'active').map((p) => ({
      key: `person:${p.id}`, name: p.name, position: p.categoryLabel ?? p.category ?? '', organization: p.organization ?? '', phone: p.phone ?? '', email: p.email ?? '',
      source: p.kind === 'Contractor' ? 'Contractor' : 'Personnel', schoolId: p.schoolId,
    })),
  ];
}

// Standard roles, filled from the school's live records
function defaultRoles(school) {
  const users = listUsers();
  const people = getPeople().filter((p) => p.status === 'active');
  const omPlan = OM.find('plans', `PLAN-${school.id}`);
  const ehs = users.find((u) => u.roleId === 'ehs-manager');
  const arp = users.find((u) => u.name === omPlan?.owner) ?? users.filter((u) => u.roleId === 'ehs-manager')[1] ?? ehs;
  const inspector = users.find((u) => u.roleId === 'inspector');
  const maintenance = people.filter((p) => p.category === 'employee-maintenance');
  const facilities = maintenance.find((p) => p.schoolId === school.id) ?? maintenance.find((p) => p.trainingStatus !== 'expired') ?? maintenance[0];
  const contractor = people.find((p) => p.kind === 'Contractor' && p.trainingStatus !== 'expired') ?? people.find((p) => p.kind === 'Contractor');
  const role = (id, title, subtitle, icon, personKey, responsibilities, extra = {}) => ({ id, title, subtitle, icon, personKey, responsibilities, status: 'Active', ...extra });
  return [
    role('duty-holder', 'Duty Holder', 'Overall accountability', 'duty', ehs && `user:${ehs.id}`,
      ['Ensure compliance with asbestos regulations', 'Approve and maintain the Management Plan']),
    role('arp', 'Asbestos Responsible Person (ARP)', '', 'coordinator', arp && `user:${arp.id}`,
      ['Day-to-day management of asbestos', 'Keep the register, arrange inspections and updates']),
    role('facilities', 'Site / Facilities Manager', '', 'facilities', facilities && `person:${facilities.id}`,
      ['Ensure safe working practices on site', 'Control works that may disturb asbestos']),
    role('contractor', 'Contractor / Works Supervisor', '', 'contractors', contractor && `person:${contractor.id}`,
      ['Follow asbestos control procedures', 'Report any suspected asbestos immediately']),
    role('surveyor', 'Surveyor / Asbestos Consultant', '', 'inspector', inspector && `user:${inspector.id}`,
      ['Carry out asbestos surveys, sampling and analysis', 'Provide condition assessments and risk advice']),
    role('all-staff', 'All Staff & Occupants', '', 'staff', null,
      ['Follow the asbestos awareness guidance', 'Report any damage or concerns to the ARP'], { group: true }),
  ];
}

// Stored (or standard) roles with the assigned person's current details
function planRoles(school) {
  const people = new Map(candidates().map((c) => [c.key, c]));
  return (getRoles(school.id) ?? defaultRoles(school)).map((r) => {
    const linked = r.personKey ? people.get(r.personKey) : null;
    const person = linked ?? (r.person?.name ? { ...r.person, source: 'External' } : null);
    return { ...r, person, missing: Boolean(r.personKey && !linked) };
  });
}

router.get('/:schoolId/roles', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  res.json({ roles: planRoles(school), customised: Boolean(getRoles(school.id)), people: candidates() });
});

// Validates a role from the form; returns { role } or { fields }
function cleanRole(body, id) {
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const fields = {};
  const title = s(body?.title, 80);
  if (!title) fields.title = 'Enter the role or position';
  const status = ROLE_STATUSES.has(body?.status) ? body.status : 'Active';
  const responsibilities = (Array.isArray(body?.responsibilities) ? body.responsibilities : []).map((x) => s(x, 200)).filter(Boolean).slice(0, 8);
  if (!responsibilities.length) fields.responsibilities = 'Add at least one responsibility';
  let personKey = null;
  let person = null;
  if (body?.personKey) {
    if (!candidates().some((c) => c.key === body.personKey)) fields.personKey = 'Choose someone from the list';
    else personKey = body.personKey;
  } else if (s(body?.person?.name, 80)) {
    const email = s(body.person.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address';
    person = { name: s(body.person.name, 80), position: s(body.person.position, 80), organization: s(body.person.organization, 80), phone: s(body.person.phone, 40), email };
  }
  if (Object.keys(fields).length) return { fields };
  return {
    role: {
      id, title, subtitle: s(body.subtitle, 80), icon: ROLE_ICONS.has(body.icon) ? body.icon : 'briefcase',
      personKey, ...(person ? { person } : {}), responsibilities, status, ...(body.group ? { group: true } : {}),
    },
  };
}

const roleList = (school) => (getRoles(school.id) ?? defaultRoles(school)).map((r) => ({ ...r }));
const roleWho = (r) => r.person?.name ?? candidates().find((c) => c.key === r.personKey)?.name ?? 'Not assigned';

router.post('/:schoolId/roles', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const list = roleList(school);
    if (list.length >= 30) return res.status(400).json({ error: 'A plan can have up to 30 roles' });
    const { role, fields } = cleanRole(req.body, `role-${Date.now().toString(36)}`);
    if (fields) return res.status(400).json({ error: 'Check the highlighted fields', fields });
    await saveRoles(school.id, [...list, role]);
    logAudit(req, { action: 'create', module: MODULE, recordId: school.id, link: '/management-plans/roles', summary: `Added role "${role.title}" (${roleWho(role)}) to the ${school.name} management plan` });
    res.status(201).json(planRoles(school).find((r) => r.id === role.id));
  } catch (err) {
    next(err);
  }
});

router.put('/:schoolId/roles/:roleId', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const list = roleList(school);
    const i = list.findIndex((r) => r.id === req.params.roleId);
    if (i < 0) return res.status(404).json({ error: 'Role not found' });
    const { role, fields } = cleanRole({ ...req.body, group: list[i].group }, list[i].id);
    if (fields) return res.status(400).json({ error: 'Check the highlighted fields', fields });
    const before = list[i];
    list[i] = role;
    await saveRoles(school.id, list);
    const changes = [
      before.title !== role.title && { field: 'Role', from: before.title, to: role.title },
      roleWho(before) !== roleWho(role) && { field: 'Assigned Person', from: roleWho(before), to: roleWho(role) },
      before.status !== role.status && { field: 'Status', from: before.status, to: role.status },
      before.responsibilities.join('|') !== role.responsibilities.join('|') && { field: 'Responsibilities', to: role.responsibilities.join('; ') },
    ].filter(Boolean);
    logAudit(req, { action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/roles', summary: `Updated role "${role.title}" in the ${school.name} management plan`, changes });
    res.json(planRoles(school).find((r) => r.id === role.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/:schoolId/roles/:roleId', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const list = roleList(school);
    const role = list.find((r) => r.id === req.params.roleId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    await saveRoles(school.id, list.filter((r) => r.id !== role.id));
    logAudit(req, { action: 'delete', module: MODULE, recordId: school.id, link: '/management-plans/roles', summary: `Removed role "${role.title}" from the ${school.name} management plan` });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- Risk assessment: material risk (likelihood of fibre release) × priority risk (likelihood of exposure)
const SCALE = ['', 'Very Low', 'Low', 'Medium', 'High'];
const levelFor = (score) => (score >= 12 ? 'High' : score >= 6 ? 'Medium' : score >= 2 ? 'Low' : 'Very Low');
const BAND = { High: [12, 16], Medium: [6, 11], Low: [2, 5] };
// Room use → how likely occupants or maintenance are to disturb the material
const HIGH_USE = new Set(['Classroom', 'Gymnasium', 'Cafeteria', 'Library', 'Corridor', 'Stairs / Lobby', 'Science Lab', 'Computer Lab']);
const LOW_USE = new Set(['Storage', 'Other']);
const addYear = (iso) => (iso ? `${Number(iso.slice(0, 4)) + 1}${iso.slice(4, 10)}` : null);

// Baseline from the AHERA record: material risk from friability + condition, priority risk from room use,
// nudged (smallest change) so the level agrees with the material's recorded risk ranking
function baseline(m, room) {
  const cond = { Good: 0, Damaged: 1, 'Significantly Damaged': 2 }[m.condition] ?? 1;
  const m0 = Math.min(4, Math.max(1, (m.friability === 'Friable' ? 2 : 1) + cond));
  const p0 = HIGH_USE.has(room?.type) ? 3 : LOW_USE.has(room?.type) ? 1 : 2;
  const band = BAND[m.riskRanking];
  if (!band) return { materialRisk: m0, priorityRisk: p0 };
  let best = null;
  for (let mr = 1; mr <= 4; mr++) {
    for (let pr = 1; pr <= 4; pr++) {
      const s = mr * pr;
      if (s < band[0] || s > band[1]) continue;
      const cost = Math.abs(mr - m0) * 2 + Math.abs(pr - p0);
      if (!best || cost < best.cost) best = { cost, materialRisk: mr, priorityRisk: pr };
    }
  }
  return { materialRisk: best.materialRisk, priorityRisk: best.priorityRisk };
}

function riskRecords(school) {
  const bname = new Map(buildings.filter((b) => b.schoolId === school.id).map((b) => [b.id, b.name]));
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  const prefix = `ACM-${school.id}-`;
  return getMaterials({ schoolId: school.id })
    .filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM')
    .map((m) => {
      const room = rooms.get(m.roomId);
      const saved = getAssessment(m.id);
      const a = saved ?? { ...baseline(m, room), date: m.assessmentDate ?? null, assessedBy: null };
      const score = a.materialRisk * a.priorityRisk;
      return {
        id: m.id, ref: m.id.startsWith(prefix) ? m.id.slice(prefix.length).toUpperCase() : m.id,
        schoolId: school.id, buildingId: m.buildingId, floorId: m.floorId, roomId: m.roomId,
        building: bname.get(m.buildingId) ?? m.buildingId, room: room?.name ?? '', roomType: room?.type ?? '',
        description: m.name, materialType: m.materialType, friability: m.friability, condition: m.condition || 'Not Assessed',
        materialRisk: a.materialRisk, priorityRisk: a.priorityRisk, score, level: levelFor(score),
        date: a.date, assessedBy: a.assessedBy, baseline: !saved, notes: saved?.notes ?? '', nextReview: addYear(a.date),
        history: (saved?.history ?? []).map((h) => ({ ...h, score: h.materialRisk * h.priorityRisk, level: levelFor(h.materialRisk * h.priorityRisk) })),
      };
    })
    .sort((a, b) => b.score - a.score || a.building.localeCompare(b.building) || naturalCompare(a.ref, b.ref));
}

router.get('/:schoolId/risk-assessment', (req, res) => {
  const school = schools.find((s) => s.id === req.params.schoolId);
  if (!school) return res.status(404).json({ error: 'School not found' });
  const records = riskRecords(school);
  const count = (level) => records.filter((r) => r.level === level).length;
  const dates = records.map((r) => r.date).filter(Boolean).sort();
  res.json({
    scale: SCALE,
    stats: { total: records.length, high: count('High'), medium: count('Medium'), low: count('Low'), veryLow: count('Very Low'), saved: records.filter((r) => !r.baseline).length },
    lastAssessed: dates.at(-1) ?? null,
    records,
  });
});

// Record a new assessment for one ACM; its risk ranking follows the new level
router.put('/:schoolId/risk-assessment/:materialId', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    const m = getMaterial(req.params.materialId);
    if (!school || !m || m.schoolId !== school.id) return res.status(404).json({ error: 'ACM record not found for this school' });
    const materialRisk = Number(req.body?.materialRisk);
    const priorityRisk = Number(req.body?.priorityRisk);
    const fields = {};
    if (![1, 2, 3, 4].includes(materialRisk)) fields.materialRisk = 'Choose a material risk from 1 to 4';
    if (![1, 2, 3, 4].includes(priorityRisk)) fields.priorityRisk = 'Choose a priority risk from 1 to 4';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Check the highlighted fields', fields });
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';
    const before = getAssessment(m.id);
    const level = levelFor(materialRisk * priorityRisk);
    const ranking = level === 'Very Low' ? 'Low' : level;
    await saveAssessment(m.id, { materialRisk, priorityRisk, notes, date: todayIso(), assessedBy: currentUser().name, at: new Date().toISOString() });
    if (m.riskRanking !== ranking) await updateMaterial(m.id, { riskRanking: ranking });
    logAudit(req, {
      action: before ? 'update' : 'create', module: MODULE, recordId: m.id, link: '/management-plans/risk',
      summary: `Risk assessment for ${m.id}: ${SCALE[materialRisk]} material × ${SCALE[priorityRisk]} priority = ${materialRisk * priorityRisk} (${level})`,
      changes: [
        { field: 'Material Risk', from: before ? SCALE[before.materialRisk] : undefined, to: SCALE[materialRisk] },
        { field: 'Priority Risk', from: before ? SCALE[before.priorityRisk] : undefined, to: SCALE[priorityRisk] },
        ...(m.riskRanking !== ranking ? [{ field: 'Risk Ranking', from: m.riskRanking, to: ranking }] : []),
      ],
    });
    res.json(riskRecords(school).find((r) => r.id === m.id));
  } catch (err) {
    next(err);
  }
});

// Edited workflow diagram (null = the standard plan cycle)
router.get('/:schoolId/workflow', (req, res) => {
  if (!schools.some((s) => s.id === req.params.schoolId)) return res.status(404).json({ error: 'School not found' });
  res.json(getWorkflow(req.params.schoolId));
});

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

router.put('/:schoolId/workflow', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    const { nodes, edges } = req.body ?? {};
    if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 120 || edges.length > 300) {
      return res.status(400).json({ error: 'A workflow needs node and edge lists (up to 120 steps)' });
    }
    const cleanNodes = [];
    const ids = new Set();
    for (const n of nodes) {
      const id = str(n?.id, 60);
      const label = str(n?.label, 80);
      const x = num(n?.x);
      const y = num(n?.y);
      const w = size(n?.w);
      const h = size(n?.h);
      if (!id || ids.has(id) || !label || !KINDS.has(n?.kind) || x === null || y === null || w === null || h === null) {
        return res.status(400).json({ error: 'Each step needs a unique id, a known shape, a name, a position and a size' });
      }
      ids.add(id);
      const sub = str(n.sub, 240);
      const items = Array.isArray(n.items) ? n.items.map((i) => str(i, 140)).filter(Boolean).slice(0, 10) : [];
      const icon = /^[a-zA-Z]{1,30}$/.test(n.icon ?? '') ? n.icon : null;
      cleanNodes.push({
        id, kind: n.kind, label, x, y, w, h,
        ...(sub ? { sub } : {}), ...(items.length ? { items } : {}), ...(icon ? { icon } : {}), ...(TONES.has(n.tone) ? { tone: n.tone } : {}),
      });
    }
    const cleanEdges = [];
    for (const e of edges) {
      const source = str(e?.source, 60);
      const target = str(e?.target, 60);
      if (!ids.has(source) || !ids.has(target) || source === target) {
        return res.status(400).json({ error: 'Each connection must join two different steps' });
      }
      cleanEdges.push({
        id: str(e?.id, 140) || `${source}-${target}`, source, target,
        sourceHandle: HANDLES.has(e?.sourceHandle) ? e.sourceHandle : 'r',
        targetHandle: HANDLES.has(e?.targetHandle) ? e.targetHandle : 'l',
        ...(str(e?.label, 40) ? { label: str(e.label, 40) } : {}),
      });
    }
    const saved = await saveWorkflow(school.id, {
      nodes: cleanNodes, edges: cleanEdges, updatedAt: new Date().toISOString(), updatedBy: currentUser().name,
    });
    logAudit(req, {
      action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/workflow',
      summary: `Updated the management plan workflow for ${school.name} (${cleanNodes.length} steps, ${cleanEdges.length} connections)`,
    });
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

router.delete('/:schoolId/workflow', async (req, res, next) => {
  try {
    const school = schools.find((s) => s.id === req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    if (await removeWorkflow(school.id)) {
      logAudit(req, {
        action: 'update', module: MODULE, recordId: school.id, link: '/management-plans/workflow',
        summary: `Reset the management plan workflow for ${school.name} to the standard cycle`,
      });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
