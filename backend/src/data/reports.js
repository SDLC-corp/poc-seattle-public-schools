import { schools, buildings } from './store.js';
import { getInspections, schoolRows } from './complianceStore.js';
import { getAllFloors } from './floorsStore.js';
import { getMaterials, allRooms } from './roomsStore.js';
import { getEvents } from './airStore.js';
import { getPeople } from './personnelStore.js';
import { getLabData } from './labSamplesStore.js';
import * as OM from './omStore.js';
import { getRecords as getInspectionRecords } from './inspectionRecordsStore.js';
import { acmsOf, statusOf as inspectionStatusOf, CONDITION_RANK } from './inspectionMeta.js';
import { getRecords as getSurveillanceRecords } from './surveillanceStore.js';
import { getNotifications } from './notificationsStore.js';
import { getDocuments } from './documentsStore.js';

/**
 * Report definitions for the Reports & Analytics screen. Every report produces flat rows with the
 * common filter fields (schoolId/school, buildingId/building, floor, inspector, status, date) plus its
 * own column values, so filtering, paging, facets and CSV export are generic (routes/reports.js).
 */

const DAY = 86400000;
const todayMs = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayMs = (iso) => Date.parse(`${iso}T00:00:00`);
const addYears = (iso, n) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4, 10)}`;

// Looked up live so schools added in the app are found
const schoolName = { get: (id) => schools.find((s) => s.id === id)?.name };
const buildingName = new Map(buildings.map((b) => [b.id, b.name]));
const floorById = () => new Map(getAllFloors().map((f) => [f.id, f]));

// Status values per report: value → { label, tone } (tone picks the badge colour on screen)
const INSPECTION_STATUS = {
  completed: { label: 'Completed', tone: 'good' },
  scheduled: { label: 'Scheduled', tone: 'primary' },
  dueSoon: { label: 'Due Soon', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'critical' },
};
const CONDITION_STATUS = {
  Good: { label: 'Good', tone: 'good' },
  Damaged: { label: 'Damaged', tone: 'warning' },
  'Significantly Damaged': { label: 'Significantly Damaged', tone: 'critical' },
  'Not Assessed': { label: 'Not Assessed', tone: 'neutral' },
};
const ACM_STATUS = {
  'ACM Present': { label: 'ACM Present', tone: 'critical' },
  'Assumed ACM': { label: 'Assumed ACM', tone: 'warning' },
  'No ACM': { label: 'No ACM', tone: 'good' },
};
const SAMPLE_STATUS = {
  detected: { label: 'Asbestos Detected', tone: 'critical' },
  none: { label: 'No Asbestos Detected', tone: 'good' },
  assumed: { label: 'Assumed ACM', tone: 'warning' },
  inconclusive: { label: 'Not Analyzed', tone: 'neutral' },
};
const AIR_STATUS = {
  compliant: { label: 'Below Limit', tone: 'good' },
  exceedance: { label: 'Exceedance', tone: 'critical' },
  pending: { label: 'Pending', tone: 'neutral' },
};
const TRAINING_STATUS = {
  valid: { label: 'Current', tone: 'good' },
  dueSoon: { label: 'Expiring Soon', tone: 'warning' },
  expired: { label: 'Expired', tone: 'critical' },
  missing: { label: 'Missing', tone: 'critical' },
};
const OM_STATUS = {
  completed: { label: 'Completed', tone: 'good' },
  inProgress: { label: 'In Progress', tone: 'warning' },
  pending: { label: 'Pending', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'critical' },
};
const SCHOOL_STATUS = {
  compliant: { label: 'Compliant', tone: 'good' },
  dueSoon: { label: 'Due Soon', tone: 'warning' },
  overdue: { label: 'Non-Compliant', tone: 'critical' },
};

const RECORD_STATUS = {
  completed: { label: 'Completed', tone: 'good' },
  pendingReview: { label: 'In Review', tone: 'primary' },
  inProgress: { label: 'In Progress', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'critical' },
};
const REINSPECTION_STATUS = {
  current: { label: 'Current', tone: 'good' },
  dueSoon: { label: 'Due ≤ 6 Months', tone: 'warning' },
  overdue: { label: 'Overdue', tone: 'critical' },
  notAssessed: { label: 'Never Assessed', tone: 'neutral' },
};
const PLAN_STATUS = {
  active: { label: 'Active', tone: 'good' },
  reviewDue: { label: 'Review Due ≤ 60 Days', tone: 'warning' },
  reviewOverdue: { label: 'Review Overdue', tone: 'critical' },
  draft: { label: 'No Plan on Record', tone: 'neutral' },
};
const RESPONSE_STATUS = {
  completed: { label: 'Completed', tone: 'good' },
  inProgress: { label: 'In Progress', tone: 'warning' },
  planned: { label: 'Planned', tone: 'primary' },
  notStarted: { label: 'Not Started', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'critical' },
};
const ANNUAL_NOTICE_STATUS = {
  sent: { label: 'On File', tone: 'good' },
  missing: { label: 'Not on File', tone: 'critical' },
};
const PRIORITY_STATUS = {
  high: { label: 'High', tone: 'critical' },
  medium: { label: 'Medium', tone: 'warning' },
  low: { label: 'Low', tone: 'neutral' },
};

const countBy = (rows, status) => rows.filter((r) => r.status === status).length;
const isoToday = () => new Date(todayMs() + 12 * 3600000).toISOString().slice(0, 10);
const addDaysIso = (iso, n) => new Date(dayMs(iso) + n * DAY + 12 * 3600000).toISOString().slice(0, 10);
const yesNo = (v) => (v ? 'Yes' : 'No');

// School / building / floor / room names for a record that carries their ids
function placer() {
  const floors = floorById();
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  return (x) => {
    const room = rooms.get(x.roomId);
    return {
      schoolId: x.schoolId,
      school: schoolName.get(x.schoolId) ?? x.schoolId ?? '',
      buildingId: x.buildingId,
      building: buildingName.get(x.buildingId) ?? '',
      floor: floors.get(x.floorId)?.name ?? '',
      room: room ? [room.number, room.name].filter(Boolean).join(' – ') : '',
    };
  };
}
const materialNames = () => new Map(getMaterials().map((m) => [m.id, m.name || m.materialType]));

// --- Inspection-schedule reports (inspections.json) ---

function inspectionRows(type) {
  const floors = floorById();
  return getInspections()
    .filter((i) => !type || i.type === type)
    .map((i) => {
      const date = i.completedAt ? i.completedAt.slice(0, 10) : i.scheduledDate;
      return {
        id: i.id,
        date,
        schoolId: i.schoolId,
        school: i.schoolName,
        buildingId: i.buildingId,
        building: i.buildingName,
        floor: i.floor ?? floors.get(i.floorId)?.name ?? '',
        inspector: i.inspectorName ?? '',
        status: i.status,
        type: i.type,
        rooms: i.rooms ?? '',
        scheduledDate: i.scheduledDate,
        // Completed surveillance repeats in 6 months, a completed reinspection in 3 years
        nextDue: i.completedAt
          ? (i.type === '3-Year Reinspection' ? addYears(date, 3) : new Date(dayMs(date) + 182 * DAY).toISOString().slice(0, 10))
          : i.scheduledDate,
        priority: i.priority ?? '',
        notes: i.notes ?? '',
      };
    });
}

function inspectionStats(rows) {
  const today = todayMs();
  const open = rows.filter((r) => r.status !== 'completed');
  return [
    { key: 'total', label: 'Total Inspections', value: rows.length, tone: 'primary', icon: 'clipboard' },
    { key: 'completed', label: 'Completed', value: countBy(rows, 'completed'), tone: 'good', icon: 'check', status: 'completed' },
    { key: 'scheduled', label: 'Scheduled', value: countBy(rows, 'scheduled') + countBy(rows, 'dueSoon'), tone: 'warning', icon: 'clock', status: 'scheduled,dueSoon' },
    { key: 'overdue', label: 'Overdue', value: countBy(rows, 'overdue'), tone: 'critical', icon: 'alert', status: 'overdue' },
    {
      key: 'next90', label: 'Next Due (≤ 90 Days)', tone: 'violet', icon: 'calendar',
      value: open.filter((r) => { const t = dayMs(r.scheduledDate); return t >= today && t <= today + 90 * DAY; }).length,
    },
  ];
}

const INSPECTION_COLUMNS = [
  { key: 'date', label: 'Inspection Date', type: 'date' },
  { key: 'school', label: 'Facility', type: 'wrap' },
  { key: 'building', label: 'Building', type: 'wrap' },
  { key: 'floor', label: 'Floor' },
  { key: 'type', label: 'Type' },
  { key: 'inspector', label: 'Inspector' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'nextDue', label: 'Next Due', type: 'date' },
  // csvOnly: in the CSV download but not on screen
  { key: 'id', label: 'Inspection ID', csvOnly: true },
  { key: 'rooms', label: 'Rooms', csvOnly: true },
  { key: 'priority', label: 'Priority', csvOnly: true },
  { key: 'notes', label: 'Notes', csvOnly: true },
];
const SCHEDULE_FILTERS = ['school', 'building', 'floor', 'inspector', 'status', 'date'];

// --- ACM material reports (acmMaterials.json, per room) ---

function materialRows(statusField) {
  const floors = floorById();
  const rooms = new Map(allRooms().map((r) => [r.id, r]));
  return getMaterials().map((m) => {
    const room = rooms.get(m.roomId);
    return {
      id: m.id,
      date: m.assessmentDate,
      schoolId: m.schoolId,
      school: schoolName.get(m.schoolId) ?? m.schoolId,
      buildingId: m.buildingId,
      building: buildingName.get(m.buildingId) ?? m.buildingId,
      floor: floors.get(m.floorId)?.name ?? '',
      inspector: '',
      status: statusField === 'condition' ? (m.condition || 'Not Assessed') : m.acmStatus,
      room: room ? [room.number, room.name].filter(Boolean).join(' – ') : '',
      location: m.location ?? '',
      material: m.materialType || m.name,
      quantity: m.quantity != null ? `${m.quantity.toLocaleString('en-US')} ${m.unit ?? ''}`.trim() : '',
      friability: m.friability ?? '',
      classification: m.classification ?? '',
      condition: m.condition ?? '',
      acmStatus: m.acmStatus ?? '',
      risk: m.riskRanking ?? '',
      nextDue: m.assessmentDate ? addYears(m.assessmentDate, 3) : '', // AHERA 3-year reinspection
    };
  });
}

// --- Report catalogue ---

export const REPORTS = {
  'inspection-summary': {
    title: 'Inspection Schedule',
    description: 'All AHERA inspections and periodic surveillance, with completion status and next due date.',
    module: 'Inspections',
    filters: SCHEDULE_FILTERS,
    statusLabel: 'Status',
    statuses: INSPECTION_STATUS,
    columns: INSPECTION_COLUMNS,
    rows: () => inspectionRows(),
    stats: inspectionStats,
  },
  'detailed-inspection': {
    title: 'Material Assessments',
    description: 'Room-by-room material assessments: condition, friability, quantity, risk and the 3-year reinspection date.',
    module: 'Inspections',
    filters: ['school', 'building', 'floor', 'status', 'date'],
    statusLabel: 'Assessment',
    statuses: CONDITION_STATUS,
    columns: [
      { key: 'date', label: 'Assessment Date', type: 'date' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'building', label: 'Building', type: 'wrap' },
      { key: 'room', label: 'Room / Location', type: 'wrap' },
      { key: 'material', label: 'Material', type: 'wrap' },
      { key: 'status', label: 'Assessment', type: 'status' },
      { key: 'nextDue', label: 'Next Due', type: 'date' },
      { key: 'id', label: 'Material ID', csvOnly: true },
      { key: 'floor', label: 'Floor', csvOnly: true },
      { key: 'location', label: 'Location in Room', csvOnly: true },
      { key: 'friability', label: 'Friability', csvOnly: true },
      { key: 'quantity', label: 'Quantity', csvOnly: true },
      { key: 'risk', label: 'Risk Ranking', csvOnly: true },
      { key: 'acmStatus', label: 'ACM Status', csvOnly: true },
    ],
    rows: () => materialRows('condition'),
    stats: (rows) => [
      { key: 'total', label: 'Materials Assessed', value: rows.length, tone: 'primary', icon: 'clipboard' },
      { key: 'good', label: 'Good', value: countBy(rows, 'Good'), tone: 'good', icon: 'check', status: 'Good' },
      { key: 'damaged', label: 'Damaged', value: countBy(rows, 'Damaged'), tone: 'warning', icon: 'alert', status: 'Damaged' },
      { key: 'sig', label: 'Significantly Damaged', value: countBy(rows, 'Significantly Damaged'), tone: 'critical', icon: 'alert', status: 'Significantly Damaged' },
      { key: 'na', label: 'Not Assessed', value: countBy(rows, 'Not Assessed'), tone: 'violet', icon: 'help', status: 'Not Assessed' },
    ],
  },
  reinspection: {
    title: '3-Year Reinspection Schedule',
    description: 'AHERA 3-year reinspections by an accredited inspector (40 CFR 763.85).',
    module: 'Inspections',
    filters: SCHEDULE_FILTERS,
    statusLabel: 'Status',
    statuses: INSPECTION_STATUS,
    columns: INSPECTION_COLUMNS.filter((c) => c.key !== 'type'),
    rows: () => inspectionRows('3-Year Reinspection'),
    stats: inspectionStats,
  },
  'bulk-samples': {
    title: 'Bulk Sample Results',
    description: 'Laboratory results for bulk material samples (All Bulk Samples spreadsheet).',
    module: 'Lab Results',
    filters: ['school', 'status'],
    filterLabels: { school: 'Site' },
    statusLabel: 'Result',
    statuses: SAMPLE_STATUS,
    columns: [
      { key: 'sampleNo', label: 'Sample No.', type: 'mono' },
      { key: 'school', label: 'Site' },
      { key: 'room', label: 'Room', type: 'wrap' },
      { key: 'description', label: 'Description', type: 'long' },
      { key: 'resultLabel', label: 'Result' },
      { key: 'status', label: 'Classification', type: 'status' },
      { key: 'result', label: 'Result (as reported)', csvOnly: true },
    ],
    rows: () => getLabData().samples.map((s) => ({
      id: s.id,
      schoolId: s.site,
      school: s.site,
      status: s.resultClass,
      sampleNo: s.sampleNo,
      room: s.room ?? '',
      description: s.description,
      resultLabel: s.resultLabel,
      result: s.result,
    })),
    stats: (rows) => [
      { key: 'total', label: 'Total Samples', value: rows.length, tone: 'primary', icon: 'flask' },
      { key: 'detected', label: 'Asbestos Detected', value: countBy(rows, 'detected'), tone: 'critical', icon: 'alert', status: 'detected' },
      { key: 'none', label: 'No Asbestos Detected', value: countBy(rows, 'none'), tone: 'good', icon: 'check', status: 'none' },
      { key: 'assumed', label: 'Assumed ACM', value: countBy(rows, 'assumed'), tone: 'warning', icon: 'help', status: 'assumed' },
      { key: 'na', label: 'Not Analyzed', value: countBy(rows, 'inconclusive'), tone: 'violet', icon: 'help', status: 'inconclusive' },
    ],
  },
  'air-monitoring': {
    title: 'Air Monitoring',
    description: 'Air samples against their regulatory limit (PCM / TEM).',
    module: 'Air Monitoring',
    filters: ['school', 'building', 'inspector', 'status', 'date'],
    statusLabel: 'Result',
    statuses: AIR_STATUS,
    columns: [
      { key: 'date', label: 'Sample Date', type: 'date' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'building', label: 'Building', type: 'wrap' },
      { key: 'location', label: 'Location', type: 'wrap' },
      { key: 'type', label: 'Type' },
      { key: 'id', label: 'Event ID', csvOnly: true },
      { key: 'inspector', label: 'Inspector', csvOnly: true },
      { key: 'project', label: 'Project', csvOnly: true },
      { key: 'method', label: 'Method' },
      { key: 'reading', label: 'Result' },
      { key: 'limit', label: 'Limit' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    rows: () => getEvents().map((e) => ({
      id: e.id,
      date: e.sampledAt.slice(0, 10),
      schoolId: e.schoolId,
      school: e.schoolName,
      buildingId: e.buildingId,
      building: e.buildingName,
      inspector: e.inspectorName ?? '',
      status: e.status,
      location: e.location ?? '',
      type: e.type,
      method: e.method,
      reading: e.result == null ? '' : `${e.result} ${e.limit.unit}`,
      limit: `${e.limit.value} ${e.limit.unit}`,
      project: e.project ?? '',
    })),
    stats: (rows) => [
      { key: 'total', label: 'Air Samples', value: rows.length, tone: 'primary', icon: 'wind' },
      { key: 'ok', label: 'Below Limit', value: countBy(rows, 'compliant'), tone: 'good', icon: 'check', status: 'compliant' },
      { key: 'over', label: 'Exceedances', value: countBy(rows, 'exceedance'), tone: 'critical', icon: 'alert', status: 'exceedance' },
      { key: 'pending', label: 'Pending Results', value: countBy(rows, 'pending'), tone: 'warning', icon: 'clock', status: 'pending' },
    ],
  },
  'acm-inventory': {
    title: 'ACM Inventory',
    description: 'Every recorded material by room with its ACM status, classification, quantity and condition.',
    module: 'ACM Inventory',
    filters: ['school', 'building', 'floor', 'status', 'date'],
    statusLabel: 'ACM Status',
    statuses: ACM_STATUS,
    columns: [
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'building', label: 'Building', type: 'wrap' },
      { key: 'floor', label: 'Floor' },
      { key: 'room', label: 'Room', type: 'wrap' },
      { key: 'material', label: 'Material' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'friability', label: 'Friability' },
      { key: 'classification', label: 'Classification' },
      { key: 'condition', label: 'Condition' },
      { key: 'status', label: 'ACM Status', type: 'status' },
    ],
    rows: () => materialRows('acmStatus'),
    stats: (rows) => [
      { key: 'total', label: 'Materials Recorded', value: rows.length, tone: 'primary', icon: 'layers' },
      { key: 'present', label: 'ACM Present', value: countBy(rows, 'ACM Present'), tone: 'critical', icon: 'alert', status: 'ACM Present' },
      { key: 'assumed', label: 'Assumed ACM', value: countBy(rows, 'Assumed ACM'), tone: 'warning', icon: 'help', status: 'Assumed ACM' },
      { key: 'none', label: 'No ACM', value: countBy(rows, 'No ACM'), tone: 'good', icon: 'check', status: 'No ACM' },
      { key: 'friable', label: 'Friable ACM', value: rows.filter((r) => r.status !== 'No ACM' && r.friability === 'Friable').length, tone: 'violet', icon: 'alert' },
    ],
  },
  surveillance: {
    title: '6-Month Surveillance Schedule',
    description: 'Periodic surveillance of known and assumed ACM every six months (40 CFR 763.92).',
    module: 'Surveillance',
    filters: SCHEDULE_FILTERS,
    statusLabel: 'Status',
    statuses: INSPECTION_STATUS,
    columns: INSPECTION_COLUMNS.filter((c) => c.key !== 'type'),
    rows: () => inspectionRows('6-Month Surveillance'),
    stats: (rows) => inspectionStats(rows).map((s) => (s.key === 'total' ? { ...s, label: 'Total Surveillance' } : s)),
  },
  training: {
    title: 'Training Compliance',
    description: 'Required asbestos training for each person, with completion and expiry dates.',
    module: 'Personnel',
    filters: ['school', 'status', 'date'],
    statusLabel: 'Status',
    statuses: TRAINING_STATUS,
    columns: [
      { key: 'person', label: 'Name', type: 'wrap' },
      { key: 'category', label: 'Category' },
      { key: 'organization', label: 'Organization', type: 'wrap' },
      { key: 'program', label: 'Required Training', type: 'wrap' },
      { key: 'date', label: 'Completed', type: 'date' },
      { key: 'expires', label: 'Expires', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    rows: () => getPeople().flatMap((p) => p.required.map((x) => ({
      id: `${p.id}-${x.programId}`,
      date: x.record?.completedOn ?? '',
      schoolId: p.schoolId ?? '',
      school: p.schoolName ?? '',
      status: x.status,
      person: p.name,
      category: p.categoryLabel,
      organization: p.organization ?? '',
      program: x.programName,
      expires: x.record?.expiresOn ?? '',
    }))),
    stats: (rows) => [
      { key: 'total', label: 'Required Trainings', value: rows.length, tone: 'primary', icon: 'graduation' },
      { key: 'valid', label: 'Current', value: countBy(rows, 'valid'), tone: 'good', icon: 'check', status: 'valid' },
      { key: 'soon', label: 'Expiring ≤ 60 Days', value: countBy(rows, 'dueSoon'), tone: 'warning', icon: 'clock', status: 'dueSoon' },
      { key: 'expired', label: 'Expired', value: countBy(rows, 'expired'), tone: 'critical', icon: 'alert', status: 'expired' },
      { key: 'missing', label: 'Missing', value: countBy(rows, 'missing'), tone: 'violet', icon: 'help', status: 'missing' },
    ],
  },
  'om-activities': {
    title: 'O&M Activities',
    description: 'Operations & maintenance work on ACM: what was done, where, by whom and whether it is complete.',
    module: 'Operations & Maintenance',
    filters: ['school', 'building', 'floor', 'status', 'date'],
    statusLabel: 'Status',
    statuses: OM_STATUS,
    columns: [
      { key: 'date', label: 'Due Date', type: 'date' },
      { key: 'id', label: 'Activity ID' },
      { key: 'inspectionId', label: 'Inspection ID' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'building', label: 'Building', type: 'wrap', csvOnly: true },
      { key: 'room', label: 'Room', type: 'wrap' },
      { key: 'type', label: 'Activity Type', type: 'wrap' },
      { key: 'material', label: 'ACM Material', type: 'wrap' },
      { key: 'assignee', label: 'Assigned To' },
      { key: 'contractor', label: 'Contractor', csvOnly: true },
      { key: 'priority', label: 'Priority', csvOnly: true },
      { key: 'completed', label: 'Completed', type: 'date', csvOnly: true },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    rows: () => {
      const floors = floorById();
      const rooms = new Map(allRooms().map((r) => [r.id, r]));
      const mats = new Map(getMaterials().map((m) => [m.id, m]));
      const today = todayMs();
      return OM.all('activities').map((a) => {
        const room = rooms.get(a.roomId);
        return {
          id: a.id,
          date: a.dueDate ?? '',
          schoolId: a.schoolId,
          school: schoolName.get(a.schoolId) ?? a.schoolId,
          buildingId: a.buildingId,
          building: buildingName.get(a.buildingId) ?? '',
          floor: floors.get(a.floorId)?.name ?? '',
          status: a.state !== 'completed' && a.dueDate && dayMs(a.dueDate) < today ? 'overdue' : a.state,
          inspectionId: a.inspectionId ?? '',
          room: room ? `${room.number} ${room.name}`.trim() : '',
          type: a.type,
          material: mats.get(a.materialId)?.name ?? '',
          assignee: a.assignedToName ?? '',
          contractor: a.contractorName ?? '',
          priority: a.priority ?? '',
          completed: a.completedAt?.slice(0, 10) ?? '',
        };
      });
    },
    stats: (rows) => [
      { key: 'total', label: 'O&M Activities', value: rows.length, tone: 'primary', icon: 'clipboard' },
      { key: 'done', label: 'Completed', value: countBy(rows, 'completed'), tone: 'good', icon: 'check', status: 'completed' },
      { key: 'progress', label: 'In Progress', value: countBy(rows, 'inProgress'), tone: 'warning', icon: 'clock', status: 'inProgress' },
      { key: 'pending', label: 'Pending', value: countBy(rows, 'pending'), tone: 'violet', icon: 'calendar', status: 'pending' },
      { key: 'overdue', label: 'Overdue', value: countBy(rows, 'overdue'), tone: 'critical', icon: 'alert', status: 'overdue' },
    ],
  },
  compliance: {
    title: 'School Compliance',
    description: 'AHERA compliance status for every school from its inspection schedule.',
    module: 'Compliance',
    filters: ['school', 'status'],
    statusLabel: 'Status',
    statuses: SCHOOL_STATUS,
    columns: [
      { key: 'school', label: 'School', type: 'wrap' },
      { key: 'schoolType', label: 'Type' },
      { key: 'buildings', label: 'Buildings', type: 'number' },
      { key: 'lastInspection', label: 'Last Inspection', type: 'date' },
      { key: 'nextDue', label: 'Next Due', type: 'date' },
      { key: 'openCount', label: 'Open Inspections', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
    rows: () => schoolRows().map((s) => ({
      id: s.id,
      schoolId: s.id,
      school: s.name,
      status: s.status,
      schoolType: s.type ?? '',
      buildings: s.buildings,
      lastInspection: s.lastInspection?.slice(0, 10) ?? '',
      nextDue: s.nextDue ?? '',
      openCount: s.openCount,
    })),
    stats: (rows) => [
      { key: 'total', label: 'Schools', value: rows.length, tone: 'primary', icon: 'school' },
      { key: 'ok', label: 'Compliant', value: countBy(rows, 'compliant'), tone: 'good', icon: 'check', status: 'compliant' },
      { key: 'soon', label: 'Due Soon', value: countBy(rows, 'dueSoon'), tone: 'warning', icon: 'clock', status: 'dueSoon' },
      { key: 'bad', label: 'Non-Compliant', value: countBy(rows, 'overdue'), tone: 'critical', icon: 'alert', status: 'overdue' },
    ],
  },

  // --- Inspection records (the detailed inspection forms, inspectionRecords.json) ---
  'inspection-records': {
    title: 'Inspection Records',
    description: 'Every detailed ACM inspection: who inspected, the ACMs covered, worst condition found and its review status.',
    module: 'Inspections',
    filters: SCHEDULE_FILTERS,
    statusLabel: 'Status',
    statuses: RECORD_STATUS,
    columns: [
      { key: 'date', label: 'Inspection Date', type: 'date' },
      { key: 'id', label: 'Inspection ID', type: 'link' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'building', label: 'Building', type: 'wrap' },
      { key: 'type', label: 'Type', type: 'wrap' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'acms', label: 'ACMs', type: 'number' },
      { key: 'condition', label: 'Worst Condition' },
      { key: 'reviewer', label: 'Reviewed By' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'floor', label: 'Floor', csvOnly: true },
      { key: 'room', label: 'Room', csvOnly: true },
      { key: 'approved', label: 'Approved On', type: 'date', csvOnly: true },
      { key: 'samples', label: 'Samples Taken', csvOnly: true },
    ],
    rows: () => {
      const place = placer();
      const today = isoToday();
      return getInspectionRecords().filter((r) => r.state !== 'draft').map((r) => {
        const acms = acmsOf(r);
        const worst = acms.map((a) => a.assessment?.currentCondition).filter((c) => c in CONDITION_RANK)
          .sort((x, y) => CONDITION_RANK[y] - CONDITION_RANK[x])[0] ?? '';
        const st = inspectionStatusOf(r);
        return {
          id: r.id,
          link: `/inspections/records/${r.id}`,
          date: r.date ?? r.scheduledDate ?? '',
          ...place(r),
          inspector: r.inspectorName ?? '',
          status: st === 'scheduled' && r.scheduledDate && r.scheduledDate < today ? 'overdue' : st,
          type: r.type,
          acms: acms.length,
          condition: worst,
          reviewer: r.verification?.reviewerName ?? '',
          approved: r.verification?.approvalDate ?? '',
          samples: acms.filter((a) => a.sampling?.required === 'Yes').length,
        };
      });
    },
    stats: (rows) => [
      { key: 'total', label: 'Inspections', value: rows.length, tone: 'primary', icon: 'clipboard' },
      { key: 'done', label: 'Completed', value: countBy(rows, 'completed'), tone: 'good', icon: 'check', status: 'completed' },
      { key: 'review', label: 'In Review', value: countBy(rows, 'pendingReview'), tone: 'violet', icon: 'clock', status: 'pendingReview' },
      { key: 'open', label: 'Scheduled / In Progress', value: countBy(rows, 'scheduled') + countBy(rows, 'inProgress'), tone: 'warning', icon: 'calendar', status: 'scheduled,inProgress' },
      { key: 'overdue', label: 'Overdue', value: countBy(rows, 'overdue'), tone: 'critical', icon: 'alert', status: 'overdue' },
    ],
  },

  // --- Reinspection due per ACM: AHERA reinspects known/assumed ACM at least every 3 years (40 CFR 763.85(b)) ---
  'reinspection-due': {
    title: 'ACM Reinspection Due',
    description: 'Each known or assumed ACM with its last assessment and when its 3-year reinspection falls due.',
    module: 'Inspections',
    filters: ['school', 'building', 'floor', 'status', 'date'],
    statusLabel: 'Reinspection',
    statuses: REINSPECTION_STATUS,
    columns: [
      { key: 'date', label: 'Reinspection Due', type: 'date' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'building', label: 'Building', type: 'wrap' },
      { key: 'room', label: 'Room', type: 'wrap' },
      { key: 'material', label: 'Material', type: 'wrap' },
      { key: 'lastAssessed', label: 'Last Assessed', type: 'date' },
      { key: 'condition', label: 'Condition' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'id', label: 'Material ID', csvOnly: true },
      { key: 'floor', label: 'Floor', csvOnly: true },
      { key: 'acmStatus', label: 'ACM Status', csvOnly: true },
    ],
    rows: () => {
      const today = isoToday();
      const soon = addDaysIso(today, 182);
      return materialRows('acmStatus').filter((m) => m.acmStatus === 'ACM Present' || m.acmStatus === 'Assumed ACM').map((m) => ({
        ...m,
        lastAssessed: m.date ?? '',
        date: m.nextDue,
        status: !m.nextDue ? 'notAssessed' : m.nextDue < today ? 'overdue' : m.nextDue <= soon ? 'dueSoon' : 'current',
      }));
    },
    stats: (rows) => [
      { key: 'total', label: 'Known / Assumed ACM', value: rows.length, tone: 'primary', icon: 'layers' },
      { key: 'current', label: 'Current', value: countBy(rows, 'current'), tone: 'good', icon: 'check', status: 'current' },
      { key: 'soon', label: 'Due ≤ 6 Months', value: countBy(rows, 'dueSoon'), tone: 'warning', icon: 'clock', status: 'dueSoon' },
      { key: 'overdue', label: 'Overdue', value: countBy(rows, 'overdue'), tone: 'critical', icon: 'alert', status: 'overdue' },
      { key: 'never', label: 'Never Assessed', value: countBy(rows, 'notAssessed'), tone: 'violet', icon: 'help', status: 'notAssessed' },
    ],
  },

  // --- Periodic surveillance records (surveillance.json): what each 6-month check found ---
  'surveillance-records': {
    title: 'Surveillance Findings',
    description: 'Recorded periodic surveillance visits: the condition of each ACM, whether it changed and any corrective action.',
    module: 'Surveillance',
    filters: SCHEDULE_FILTERS,
    statusLabel: 'Condition',
    statuses: CONDITION_STATUS,
    columns: [
      { key: 'date', label: 'Surveillance Date', type: 'date' },
      { key: 'id', label: 'Record ID', type: 'link' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'room', label: 'Room', type: 'wrap' },
      { key: 'material', label: 'ACM Material', type: 'wrap' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'changed', label: 'Changed' },
      { key: 'corrective', label: 'Corrective Action' },
      { key: 'status', label: 'Condition', type: 'status' },
      { key: 'nextDue', label: 'Next Due', type: 'date' },
      { key: 'building', label: 'Building', csvOnly: true },
      { key: 'floor', label: 'Floor', csvOnly: true },
      { key: 'openActions', label: 'Open Action Items', csvOnly: true },
      { key: 'comments', label: 'Comments', csvOnly: true },
    ],
    rows: () => {
      const place = placer();
      const mats = materialNames();
      return getSurveillanceRecords().filter((r) => r.status !== 'draft').map((r) => ({
        id: r.id,
        link: `/surveillance/records/${r.id}`,
        date: r.date ?? '',
        ...place(r),
        inspector: r.inspectorName ?? '',
        status: r.condition || 'Not Assessed',
        material: mats.get(r.materialId) ?? r.materialId,
        changed: yesNo(r.changed),
        corrective: r.status === 'actionRequired' ? 'Open' : r.correctiveAction ? 'Closed' : 'None',
        openActions: (r.actionItems ?? []).filter((a) => a.status !== 'Closed').length,
        nextDue: r.nextDue ?? '',
        comments: r.comments ?? '',
      }));
    },
    stats: (rows) => [
      { key: 'total', label: 'Surveillance Visits', value: rows.length, tone: 'primary', icon: 'clipboard' },
      { key: 'good', label: 'Good', value: countBy(rows, 'Good'), tone: 'good', icon: 'check', status: 'Good' },
      { key: 'damaged', label: 'Damaged', value: countBy(rows, 'Damaged'), tone: 'warning', icon: 'alert', status: 'Damaged' },
      { key: 'sig', label: 'Significantly Damaged', value: countBy(rows, 'Significantly Damaged'), tone: 'critical', icon: 'alert', status: 'Significantly Damaged' },
      { key: 'open', label: 'Corrective Action Open', value: rows.filter((r) => r.corrective === 'Open').length, tone: 'violet', icon: 'clock' },
    ],
  },

  // --- Asbestos management plans: one per school, from its O&M plan record and live ACM / work data ---
  'management-plans': {
    title: 'Management Plans',
    description: 'The AHERA management plan for each school: version, owner, review dates and the ACM and open work it covers.',
    module: 'Management Plans',
    filters: ['school', 'status', 'date'],
    statusLabel: 'Plan Status',
    statuses: PLAN_STATUS,
    columns: [
      { key: 'school', label: 'School', type: 'wrap' },
      { key: 'planId', label: 'Plan ID' },
      { key: 'version', label: 'Version' },
      { key: 'owner', label: 'Owner' },
      { key: 'effective', label: 'Effective', type: 'date' },
      { key: 'date', label: 'Next Review', type: 'date' },
      { key: 'acm', label: 'ACM Records', type: 'number' },
      { key: 'highRisk', label: 'High Risk', type: 'number' },
      { key: 'openWork', label: 'Open O&M', type: 'number' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'buildings', label: 'Buildings', csvOnly: true },
      { key: 'overdueWork', label: 'Overdue O&M', csvOnly: true },
      { key: 'notes', label: 'Notes', csvOnly: true },
    ],
    rows: () => {
      const today = isoToday();
      const soon = addDaysIso(today, 60);
      const acmBySchool = new Map();
      for (const m of getMaterials()) {
        if (m.acmStatus !== 'ACM Present' && m.acmStatus !== 'Assumed ACM') continue;
        const x = acmBySchool.get(m.schoolId) ?? { acm: 0, high: 0 };
        x.acm += 1;
        if (m.riskRanking === 'High') x.high += 1;
        acmBySchool.set(m.schoolId, x);
      }
      const open = OM.all('activities').filter((a) => a.state !== 'completed');
      return schools.map((s) => {
        const plan = OM.find('plans', `PLAN-${s.id}`);
        const work = open.filter((a) => a.schoolId === s.id);
        return {
          id: s.id,
          schoolId: s.id,
          school: s.name,
          date: plan?.nextReview ?? '',
          status: !plan ? 'draft' : plan.nextReview < today ? 'reviewOverdue' : plan.nextReview <= soon ? 'reviewDue' : 'active',
          planId: plan?.id ?? '',
          version: plan?.version ?? '',
          owner: plan?.owner ?? '',
          effective: plan?.effectiveDate ?? '',
          acm: acmBySchool.get(s.id)?.acm ?? 0,
          highRisk: acmBySchool.get(s.id)?.high ?? 0,
          openWork: work.length,
          overdueWork: work.filter((a) => a.dueDate && a.dueDate < today).length,
          buildings: buildings.filter((b) => b.schoolId === s.id).length,
          notes: plan?.notes ?? '',
        };
      });
    },
    stats: (rows) => [
      { key: 'total', label: 'Schools', value: rows.length, tone: 'primary', icon: 'school' },
      { key: 'active', label: 'Active', value: countBy(rows, 'active'), tone: 'good', icon: 'check', status: 'active' },
      { key: 'due', label: 'Review Due ≤ 60 Days', value: countBy(rows, 'reviewDue'), tone: 'warning', icon: 'clock', status: 'reviewDue' },
      { key: 'overdue', label: 'Review Overdue', value: countBy(rows, 'reviewOverdue'), tone: 'critical', icon: 'alert', status: 'reviewOverdue' },
      { key: 'none', label: 'No Plan on Record', value: countBy(rows, 'draft'), tone: 'violet', icon: 'help', status: 'draft' },
    ],
  },

  // --- AHERA response actions (40 CFR 763.90) recommended by inspections, tracked through their O&M work ---
  'response-actions': {
    title: 'Response Actions',
    description: 'Repair, encapsulation, enclosure, removal and other response actions recommended by inspections, with the O&M work carrying them out.',
    module: 'Inspections',
    filters: SCHEDULE_FILTERS,
    statusLabel: 'Progress',
    statuses: RESPONSE_STATUS,
    columns: [
      { key: 'date', label: 'Inspection Date', type: 'date' },
      { key: 'id', label: 'Inspection ID', type: 'link' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'material', label: 'ACM Material', type: 'wrap' },
      { key: 'condition', label: 'Condition' },
      { key: 'action', label: 'Response Action', type: 'wrap' },
      { key: 'target', label: 'Target Date', type: 'date' },
      { key: 'work', label: 'O&M Work', type: 'wrap' },
      { key: 'status', label: 'Progress', type: 'status' },
      { key: 'room', label: 'Room', csvOnly: true },
      { key: 'priority', label: 'Priority', csvOnly: true },
      { key: 'inspectionId', label: 'Inspection', csvOnly: true },
      { key: 'building', label: 'Building', csvOnly: true },
      { key: 'inspector', label: 'Inspector', csvOnly: true },
      { key: 'immediate', label: 'Immediate Attention', csvOnly: true },
    ],
    rows: () => {
      const place = placer();
      const mats = materialNames();
      const today = isoToday();
      const activities = OM.all('activities');
      return getInspectionRecords().filter((r) => ['submitted', 'returned', 'approved'].includes(r.state)).flatMap((r) => acmsOf(r)
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.risk?.recommendedAction && !a.risk.recommendedAction.startsWith('No Action'))
        .map(({ a, i }) => {
          const work = activities.filter((w) => w.inspectionId === r.id && w.materialId === a.materialId);
          // The inspection's own action items for this ACM (older records track the work there, not in O&M)
          const items = (r.actionItems ?? []).filter((x) => !x.omActivityId && (x.materialId ? x.materialId === a.materialId : i === 0));
          const states = [...work.map((w) => w.state), ...items.map((x) => ({ Completed: 'completed', 'In Progress': 'inProgress' }[x.status] ?? 'pending'))];
          const done = states.length > 0 && states.every((s) => s === 'completed');
          const target = a.risk.targetDate || '';
          let status = !states.length ? 'notStarted' : done ? 'completed' : states.some((s) => s !== 'pending') ? 'inProgress' : 'planned';
          if (!done && target && target < today) status = 'overdue';
          return {
            id: i ? `${r.id}-${i + 1}` : r.id,
            link: `/inspections/records/${r.id}`,
            inspectionId: r.id,
            date: r.date ?? r.scheduledDate ?? '',
            ...place(a.schoolId ? a : r),
            inspector: r.inspectorName ?? '',
            status,
            material: mats.get(a.materialId) ?? a.materialId,
            condition: a.assessment?.currentCondition ?? '',
            action: a.risk.recommendedAction,
            priority: a.risk.priority ?? '',
            target,
            work: [...work.map((w) => `${w.id} ${w.type}`), ...items.map((x) => `${x.action} (${x.status ?? 'Pending'})`)].join('; '),
            immediate: a.risk.immediateAttention ?? '',
          };
        }));
    },
    stats: (rows) => [
      { key: 'total', label: 'Response Actions', value: rows.length, tone: 'primary', icon: 'clipboard' },
      { key: 'done', label: 'Completed', value: countBy(rows, 'completed'), tone: 'good', icon: 'check', status: 'completed' },
      { key: 'open', label: 'Planned / In Progress', value: countBy(rows, 'planned') + countBy(rows, 'inProgress'), tone: 'warning', icon: 'clock', status: 'planned,inProgress' },
      { key: 'none', label: 'Not Started', value: countBy(rows, 'notStarted'), tone: 'violet', icon: 'help', status: 'notStarted' },
      { key: 'overdue', label: 'Overdue', value: countBy(rows, 'overdue'), tone: 'critical', icon: 'alert', status: 'overdue' },
    ],
  },

  // --- AHERA annual notification (40 CFR 763.84(c)): each school's letter to parents, teachers and staff ---
  'annual-notifications': {
    title: 'AHERA Annual Notifications',
    description: 'Whether each school has its annual asbestos notification to parents, teachers and employees on file for this year.',
    module: 'Documents',
    filters: ['school', 'status'],
    statusLabel: 'Notification',
    statuses: ANNUAL_NOTICE_STATUS,
    columns: [
      { key: 'school', label: 'School', type: 'wrap' },
      { key: 'schoolType', label: 'Type' },
      { key: 'year', label: 'School Year' },
      { key: 'document', label: 'Notification Document', type: 'wrap' },
      { key: 'date', label: 'Filed On', type: 'date' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'documentId', label: 'Document ID', csvOnly: true },
    ],
    rows: () => {
      const year = new Date().getFullYear();
      const notices = getDocuments().filter((d) => /annual.*notification/i.test(`${d.relatedTo ?? ''} ${d.name}`)
        && d.uploadedAt?.slice(0, 4) >= String(year - 1));
      return schools.map((s) => {
        const doc = notices.filter((d) => d.schoolId === s.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
        return {
          id: s.id,
          schoolId: s.id,
          school: s.name,
          status: doc ? 'sent' : 'missing',
          schoolType: s.type ?? '',
          year: `${year}–${String(year + 1).slice(2)}`,
          document: doc?.name ?? '',
          documentId: doc?.id ?? '',
          date: doc?.uploadedAt?.slice(0, 10) ?? '',
        };
      });
    },
    stats: (rows) => [
      { key: 'total', label: 'Schools', value: rows.length, tone: 'primary', icon: 'school' },
      { key: 'sent', label: 'Notification On File', value: countBy(rows, 'sent'), tone: 'good', icon: 'check', status: 'sent' },
      { key: 'missing', label: 'Not on File', value: countBy(rows, 'missing'), tone: 'critical', icon: 'alert', status: 'missing' },
    ],
  },

  // --- Alerts the system raised (notifications.json): inspections, compliance, ACM and system events ---
  notifications: {
    title: 'System Notifications',
    description: 'Alerts raised by the system about inspections, compliance deadlines, ACM changes and other events.',
    module: 'Notifications',
    filters: ['school', 'status', 'date'],
    statusLabel: 'Priority',
    statuses: PRIORITY_STATUS,
    columns: [
      { key: 'date', label: 'Raised On', type: 'date' },
      { key: 'title', label: 'Notification', type: 'wrap' },
      { key: 'category', label: 'Category' },
      { key: 'school', label: 'Facility', type: 'wrap' },
      { key: 'dueDate', label: 'Due', type: 'date' },
      { key: 'read', label: 'Read' },
      { key: 'status', label: 'Priority', type: 'status' },
      { key: 'id', label: 'Notification ID', csvOnly: true },
      { key: 'message', label: 'Message', csvOnly: true },
      { key: 'building', label: 'Building', csvOnly: true },
    ],
    rows: () => getNotifications().map((n) => ({
      id: n.id,
      date: n.createdAt?.slice(0, 10) ?? '',
      schoolId: n.schoolId ?? '',
      school: n.schoolName ?? '',
      building: n.buildingName ?? '',
      status: n.priority,
      title: n.title,
      category: { inspection: 'Inspection', compliance: 'Compliance', acm: 'ACM', system: 'System' }[n.type] ?? 'Other',
      dueDate: n.dueDate ?? '',
      read: yesNo(n.read),
      message: n.message ?? '',
    })),
    stats: (rows) => [
      { key: 'total', label: 'Notifications', value: rows.length, tone: 'primary', icon: 'bell' },
      { key: 'high', label: 'High Priority', value: countBy(rows, 'high'), tone: 'critical', icon: 'alert', status: 'high' },
      { key: 'medium', label: 'Medium', value: countBy(rows, 'medium'), tone: 'warning', icon: 'clock', status: 'medium' },
      { key: 'low', label: 'Low', value: countBy(rows, 'low'), tone: 'violet', icon: 'help', status: 'low' },
      { key: 'unread', label: 'Unread', value: rows.filter((r) => r.read === 'No').length, tone: 'good', icon: 'check' },
    ],
  },
};

// Applies the shared filters; `status` is left to the caller so stats can show the full breakdown
export function filterRows(rows, { school, building, floor, inspector, from, to, q }, report) {
  const term = q?.trim().toLowerCase();
  const keys = report.columns.map((c) => c.key);
  return rows.filter((r) => (!school || r.schoolId === school)
    && (!building || r.buildingId === building)
    && (!floor || r.floor === floor)
    && (!inspector || r.inspector === inspector)
    && (!from || (r.date && r.date >= from))
    && (!to || (r.date && r.date <= to))
    && (!term || keys.some((k) => String(r[k] ?? '').toLowerCase().includes(term))
      || report.statuses[r.status]?.label.toLowerCase().includes(term)));
}
