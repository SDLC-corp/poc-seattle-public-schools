import { schools, buildings } from './store.js';
import { getInspections, schoolRows } from './complianceStore.js';
import { getAllFloors } from './floorsStore.js';
import { getMaterials, allRooms } from './roomsStore.js';
import { getEvents } from './airStore.js';
import { getPeople } from './personnelStore.js';
import { getLabData } from './labSamplesStore.js';

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
const SCHOOL_STATUS = {
  compliant: { label: 'Compliant', tone: 'good' },
  dueSoon: { label: 'Due Soon', tone: 'warning' },
  overdue: { label: 'Non-Compliant', tone: 'critical' },
};

const countBy = (rows, status) => rows.filter((r) => r.status === status).length;

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
    title: 'Inspection Summary',
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
    title: 'Detailed Inspection',
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
    title: '3-Year Reinspection',
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
    title: '6-Month Surveillance',
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
    title: 'Training & Certifications',
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
