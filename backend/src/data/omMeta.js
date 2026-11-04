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

// Work-practice controls recorded when the work is done
export const CONTROLS = [
  { key: 'wetMethods', label: 'Wet methods used' },
  { key: 'hepaVacuum', label: 'HEPA vacuum / filtration' },
  { key: 'barriers', label: 'Area isolated, signs posted' },
  { key: 'ppe', label: 'PPE / respirator worn' },
  { key: 'wasteBagged', label: 'Waste bagged and labeled' },
  { key: 'areaCleared', label: 'Area cleaned and re-opened' },
];

export const SOP_CATEGORIES = ['Work Practice', 'Cleaning', 'Fiber Release', 'Waste Handling', 'PPE & Respiratory', 'Labeling', 'General'];

export const ASSIGNEE_CATEGORIES = ['employee-maintenance', 'employee-custodial', 'contractor-supervisor', 'contractor-worker'];
