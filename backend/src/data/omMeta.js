// Operations & Maintenance option lists (validation, sample generator and /api/om/meta)

// training: the course a person needs for this kind of work (AHERA 40 CFR 763.92(a)):
// 'om-16' = 16-hour O&M training for work that may disturb ACM, 'awareness' = 2-hour awareness
export const ACTIVITY_TYPES = [
  { value: 'Routine Maintenance', training: 'om-16' },
  { value: 'Preventive Maintenance', training: 'om-16' },
  { value: 'Minor Repair', training: 'om-16' },
  { value: 'Controlled Disturbance', training: 'om-16' },
  { value: 'Encapsulation', training: 'om-16' },
  { value: 'Fiber Release Response', training: 'om-16' },
  { value: 'Cleaning (O&M)', training: 'awareness' },
  { value: 'Enclosure Check', training: 'awareness' },
  { value: 'Labeling / Signage', training: 'awareness' },
];
export const TYPE_VALUES = ACTIVITY_TYPES.map((t) => t.value);
export const trainingFor = (type) => ACTIVITY_TYPES.find((t) => t.value === type)?.training ?? 'om-16';

export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
// Stored states; "overdue" is derived (not completed and past its due date)
export const STATES = ['pending', 'inProgress', 'completed'];
export const STATUS_LABELS = { pending: 'Pending', inProgress: 'In Progress', completed: 'Completed', overdue: 'Overdue' };

// Safety & control measures recorded when the work is done
export const CONTROLS = [
  { key: 'barriers', label: 'Work area access restricted, signs posted' },
  { key: 'safeProcedures', label: 'Asbestos-safe work procedures followed' },
  { key: 'ppe', label: 'Required PPE / respirator worn' },
  { key: 'wetMethods', label: 'Dust control – wet methods used' },
  { key: 'hepaVacuum', label: 'Dust control – HEPA vacuum / filtration' },
  { key: 'wasteBagged', label: 'Waste bagged, labeled and disposed' },
  { key: 'areaCleared', label: 'Area cleaned and re-opened' },
];

// Activity details
export const WORK_CATEGORIES = [
  'Floor Maintenance', 'Ceiling Work', 'Pipe / Boiler Insulation', 'Wall / Plaster', 'Roofing', 'HVAC / Mechanical',
  'Electrical', 'Plumbing', 'Doors / Windows', 'General Facility',
];
export const REASONS = [
  'Routine maintenance', 'Preventive maintenance', 'Repair of damage', 'Inspection finding', 'Fiber release episode',
  'Renovation / project work', 'Complaint / request',
];
export const YES_NO = ['Yes', 'No'];
// How the work ended (Completion & Documentation)
export const OUTCOMES = ['Completed', 'Partially Completed', 'Not Completed'];

export const SOP_CATEGORIES = ['Work Practice', 'Cleaning', 'Fiber Release', 'Waste Handling', 'PPE & Respiratory', 'Labeling', 'General'];

export const ASSIGNEE_CATEGORIES = ['employee-maintenance', 'employee-custodial', 'contractor-supervisor', 'contractor-worker'];
