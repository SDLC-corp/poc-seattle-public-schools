// Option lists for detailed ACM inspection records (validation, sample generator and /api/inspection-records/meta)
export const DISTRICT = 'Seattle Public Schools';

export const TYPES = ['Initial Inspection', '3-Year Reinspection', 'Follow-up Inspection', 'Damage Assessment', 'Pre-Renovation Inspection'];
// No longer offered for new inspections; existing records of these types stay valid and are still listed
export const RETIRED_TYPES = [];
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
// Laboratories samples are sent to (sample names; NVLAP-accredited labs in a real deployment)
export const LABORATORIES = ['Accredited PLM Lab A (sample)', 'Accredited PLM Lab B (sample)', 'Accredited TEM Lab C (sample)', 'Accredited Air Lab D (sample)'];
/**
 * Kinds of sample and what the lab can test each for. Air samples are listed under Air Monitoring (fibre
 * concentration against a limit); bulk, dust and soil samples under Lab & Sampling Results.
 */
export const SAMPLE_TYPES = [
  {
    value: 'Air Sample', purpose: 'Amount of asbestos fibres in the air', examples: 'Air in the work area or room',
    testMethods: ['Airborne fibres – PCM (NIOSH 7400)', 'Airborne fibres – TEM (AHERA clearance)'],
  },
  {
    value: 'Bulk Material Sample', purpose: 'Whether the material contains asbestos', examples: 'Ceiling tile, pipe insulation, floor tile, wallboard',
    testMethods: ['Asbestos content – PLM (EPA 600/R-93/116)', 'Asbestos content – PLM point count', 'Asbestos content – TEM bulk'],
    measure: { label: 'Asbestos Content', unit: '%', max: 100, limit: 1, basis: 'EPA: a material with more than 1% asbestos is ACM' },
  },
  {
    value: 'Dust / Surface Sample', purpose: 'Asbestos contamination on surfaces', examples: 'Dust settled on surfaces',
    testMethods: ['Settled dust – TEM wipe (ASTM D6480)', 'Settled dust – TEM micro-vacuum (ASTM D5755)'],
    measure: { label: 'Dust Loading', unit: 's/cm²', limit: 1000, basis: 'District action level (sample setting)' },
  },
  {
    value: 'Soil Sample', purpose: 'Asbestos in soil', examples: 'Soil around the building or play areas',
    testMethods: ['Soil – PLM (EPA 600/R-93/116)', 'Soil – PLM (CARB 435)'],
    measure: { label: 'Asbestos Content', unit: '%', max: 100, limit: 0.25, basis: 'District action level for soil (sample setting)' },
  },
];
export const AIR_SAMPLE = 'Air Sample';
// Samples saved before sample types existed were bulk samples
export const sampleTypeOf = (s) => s?.sampleType || 'Bulk Material Sample';
export const TEST_METHODS = [...SAMPLE_TYPES.flatMap((t) => t.testMethods), 'Settled dust – TEM (ASTM D6480)'];
// Air sample results are judged against the Air Monitoring limit for the sample kind and method
export const AIR_RESULTS = ['Pending', 'Below Limit', 'Exceeds Limit', 'Not Analyzed'];
// Asbestos minerals a lab reports for bulk, dust and soil samples
export const ASBESTOS_TYPES = ['Chrysotile', 'Amosite', 'Crocidolite', 'Tremolite', 'Actinolite', 'Anthophyllite'];
// The lab measurement for a (non-air) sample type: { label, unit, max?, limit, basis }
export const measureOf = (s) => SAMPLE_TYPES.find((t) => t.value === sampleTypeOf(s))?.measure ?? null;
const withUnit = (v, unit) => `${v}${unit === '%' ? '' : ' '}${unit}`;
/**
 * One-line lab result for a sample, e.g. "Asbestos Detected · 3% Chrysotile · Fail (limit 1%)" or
 * "Below Limit · 0.004 f/cc · Pass".
 */
export function resultSummary(s) {
  if (!s) return '';
  const unit = s.measureUnit ?? '';
  const value = s.airValue ?? s.measuredValue;
  return [
    s.result || 'Pending',
    value != null && `${withUnit(value, unit)}${s.asbestosTypes?.length ? ` ${s.asbestosTypes.join(', ')}` : ''}`,
    s.passFail && `${s.passFail}${s.limitValue != null ? ` (limit ${withUnit(s.limitValue, unit)})` : ''}`,
  ].filter(Boolean).join(' · ');
}
// Air Monitoring's method (PCM or TEM) for an air sample's test
export const airMethodOf = (testMethod) => (/TEM/.test(testMethod ?? '') ? 'TEM' : 'PCM');
export const ACTION_STATUSES = ['Pending', 'In Progress', 'Completed'];
export const TEAMS = ['Facilities Manager', 'EHS – Asbestos Program', 'Facilities – Asbestos Team', 'O&M – Maintenance', 'O&M – Custodial', 'Abatement Contractor', 'Building Administrator'];
export const DOC_CATEGORIES = [
  'Before Inspection Photo', 'Material Condition Photo', 'Damaged Area Photo', 'Laboratory Report', 'Work Completion Report', 'After Work Photo', 'Supporting Document',
];

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
  scheduled: 'Scheduled', inProgress: 'In Progress', pendingReview: 'In Review', actionRequired: 'Action Required', completed: 'Completed',
};
/**
 * The ACMs one inspection covers: the first ACM's details live on the record itself (materialId, assessment,
 * checklist, sampling, risk…), any further ACMs in record.extra[] with the same per-ACM fields.
 */
export const acmsOf = (r) => [r, ...(r.extra ?? [])];
/**
 * The samples taken from one ACM (none unless sampling is required). The first is the ACM's `sampling` itself;
 * any further ones are in `sampling.more`, each with the same fields. k is the sample's position (0 = first) and
 * is how lab results and sample ids refer to it.
 */
export const samplesOf = (a) => (a?.sampling?.required === 'Yes'
  ? [{ k: 0, s: a.sampling }, ...(a.sampling.more ?? []).map((s, j) => ({ k: j + 1, s }))] : []);
// Every sample of an inspection, with its ACM (a) and the ACM's position (i)
export const allSamplesOf = (r) => acmsOf(r).flatMap((a, i) => samplesOf(a).map((x) => ({ ...x, a, i })));
// The ACM with its sample k replaced by fn(sample)
export function withSample(a, k, fn) {
  if (k === 0) return { ...a, sampling: fn(a.sampling) };
  const more = [...(a.sampling.more ?? [])];
  more[k - 1] = fn(more[k - 1]);
  return { ...a, sampling: { ...a.sampling, more } };
}
export const PER_ACM_FIELDS = ['materialId', 'schoolId', 'buildingId', 'floorId', 'roomId', 'locationDescription', 'homogeneousAreaId', 'assessment', 'checklist', 'checklistNotes', 'sampling', 'risk'];
const anyAcm = (r, test) => acmsOf(r).some(test);

export function statusOf(r) {
  if (r.state === 'scheduled') return 'scheduled';
  if (r.state === 'draft' || r.state === 'returned') return 'inProgress';
  if (r.state === 'submitted') return 'pendingReview';
  // Verified and approved by the reviewer
  return 'completed';
}

// Life cycle of an inspection, worked out from the record (stageOf)
export const STAGES = [
  { id: 'initiated', label: 'Initiated', hint: 'Inspection record created and assigned.' },
  { id: 'inProgress', label: 'Inspection In Progress', hint: 'Physical inspection and observations being recorded.' },
  { id: 'submitted', label: 'Inspection Submitted', hint: 'Inspection findings and documentation submitted for review.' },
  { id: 'lab', label: 'Laboratory Analysis', hint: 'Samples submitted and laboratory results awaited or reviewed.' },
  { id: 'action', label: 'Corrective Action / Remediation', hint: 'Maintenance, Operations & Maintenance (O&M), or Abatement activities carried out.' },
  { id: 'followUp', label: 'Follow-up Verification', hint: 'Completed work and corrective measures verified.' },
  { id: 'closed', label: 'Closed', hint: 'Final review and approval completed; inspection workflow closed.' },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));

/**
 * Once the inspector submits, the stage follows the findings straight away: a sample awaiting its lab result
 * → Laboratory Analysis; open action items → Corrective Action; otherwise it waits for the final review
 * (Inspection Submitted) and, once approved, goes to Follow-up Verification if required, else Closed.
 * followUp: result of later approved inspections of the same ACM (inspectionLifecycle.followUpOf) —
 * 'passed' closes it, 'failed' returns it to Corrective Action, 'reworked' / 'none' wait for verification.
 */
export function stageOf(r, followUp = 'none') {
  if (r.state === 'scheduled') return 'initiated';
  if (r.state === 'draft' || r.state === 'returned') return 'inProgress';
  if (anyAcm(r, (x) => x.sampling?.required === 'Yes' && x.sampling?.result === 'Pending')) return 'lab';
  if ((r.actionItems ?? []).some((a) => a.status !== 'Completed')) return 'action';
  if (r.state !== 'approved') return 'submitted';
  if (!anyAcm(r, (x) => x.risk?.followUpRequired === 'Yes') || followUp === 'passed') return 'closed';
  return followUp === 'failed' ? 'action' : 'followUp';
}

export const conditionChange =(previous, current) => {
  if (!previous || !current || CONDITION_RANK[previous] === undefined) return 'First Assessment';
  const d = CONDITION_RANK[current] - CONDITION_RANK[previous];
  return d > 0 ? 'Deteriorated' : d < 0 ? 'Improved' : 'Unchanged';
};
