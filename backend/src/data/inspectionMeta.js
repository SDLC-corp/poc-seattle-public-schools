// Option lists for detailed ACM inspection records (validation, sample generator and /api/inspection-records/meta)
export const DISTRICT = 'Seattle Public Schools';

export const TYPES = ['Initial Inspection', '3-Year Reinspection', 'Follow-up Inspection', 'Damage Assessment', 'Pre-Renovation Inspection', 'Post-Abatement Inspection'];
export const REINSPECTION_YEARS = 3; // AHERA 40 CFR 763.85(b): reinspect at least every three years
export const CONDITIONS = ['Good', 'Damaged', 'Significantly Damaged']; // AHERA physical assessment, same scale as the ACM inventory
export const CONDITION_RANK = { Good: 0, Damaged: 1, 'Significantly Damaged': 2 };
export const DAMAGE_TYPES = ['None', 'Cracks', 'Delamination', 'Flaking / Crumbling', 'Water Damage', 'Abrasion', 'Puncture / Gouges', 'Missing Material', 'Other'];
export const DAMAGE_EXTENTS = ['None', 'Minor (localized, < 10%)', 'Moderate (10–25%)', 'Extensive (> 25%)'];
export const LEVELS = ['Low', 'Medium', 'High'];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const SEVERITIES = ['None', 'Minor', 'Moderate', 'Severe'];
export const RECOMMENDED_ACTIONS = [
  'No Action – Continue O&M', 'Further Assessment', 'Repair', 'Encapsulation', 'Enclosure', 'Removal', 'Restrict Access',
];
export const SAMPLE_RESULTS = ['Pending', 'No Asbestos Detected', 'Asbestos Detected', 'Not Analyzed'];
export const ACTION_STATUSES = ['Pending', 'In Progress', 'Completed'];
export const TEAMS = ['Facilities Manager', 'EHS – Asbestos Program', 'Facilities – Asbestos Team', 'O&M – Maintenance', 'O&M – Custodial', 'Abatement Contractor', 'Building Administrator'];
export const DOC_CATEGORIES = ['Before Inspection Photo', 'Material Condition Photo', 'Damaged Area Photo', 'Laboratory Report', 'Supporting Document'];

// Section 4 checklist: key → question and allowed answers
export const CHECKLIST = [
  { key: 'goodCondition', question: 'Is ACM in good condition?', answers: ['Yes', 'No', 'N/A'] },
  { key: 'damaged', question: 'Is material damaged?', answers: ['Yes', 'No'] },
  { key: 'labelled', question: 'Is material properly labelled?', answers: ['Yes', 'No', 'N/A'] },
  { key: 'inManagementPlan', question: 'Is material documented in management plan?', answers: ['Yes', 'No'] },
  { key: 'waterDamage', question: 'Is there visible water damage?', answers: ['Yes', 'No'] },
  { key: 'furtherAssessment', question: 'Is further assessment required?', answers: ['Yes', 'No'] },
  { key: 'immediateAction', question: 'Is immediate action required?', answers: ['Yes', 'No'] },
];

// scheduled (assigned, not started) → draft (in progress) → submitted (pending review) → approved | returned
// (back to the inspector to fix and resubmit)
export const STATES = ['scheduled', 'draft', 'submitted', 'approved', 'returned'];

// What the lists show. An approved inspection whose follow-up isn't finished still needs action.
export const STATUSES = {
  scheduled: 'Scheduled', inProgress: 'In Progress', pendingReview: 'Pending Review', actionRequired: 'Action Required', completed: 'Completed',
};
export function statusOf(r) {
  if (r.state === 'scheduled') return 'scheduled';
  if (r.state === 'draft' || r.state === 'returned') return 'inProgress';
  if (r.state === 'submitted') return 'pendingReview';
  const followUp = r.risk?.followUpRequired === 'Yes' || r.risk?.immediateAttention === 'Yes';
  return followUp && (r.actionItems ?? []).some((a) => a.status !== 'Completed') ? 'actionRequired' : 'completed';
}

export const conditionChange = (previous, current) => {
  if (!previous || !current || CONDITION_RANK[previous] === undefined) return 'First Assessment';
  const d = CONDITION_RANK[current] - CONDITION_RANK[previous];
  return d > 0 ? 'Deteriorated' : d < 0 ? 'Improved' : 'Unchanged';
};
