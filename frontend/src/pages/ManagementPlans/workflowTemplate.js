// Asbestos Management – End-to-End Workflow: the starting diagram for the plan's Workflow & Approvals editor.
// Positions follow the reference layout (identification → assessment → register → risk & control →
// monitoring → compliance & approvals). Saved edits replace it per school.

// x, y, w, h in diagram units
const n = (id, kind, label, x, y, w, h, extra = {}) => ({ id, kind, label, x: x - 230, y: y - 90, w, h, ...extra })

export const TEMPLATE_NODES = [
  n('group-risk', 'group', 'Risk & Control', 497, 493, 503, 322),
  n('start', 'start', 'START', 257, 131, 92, 38),
  n('identify', 'process', '1. Identify Potential Asbestos (ACM)', 380, 113, 214, 84, { icon: 'search', sub: 'New survey, works, incident, or existing records' }),
  n('likely', 'decision', 'Is asbestos likely to be present?', 625, 97, 150, 104),
  n('no-acm', 'outcome', 'Record finding (No ACM) & close', 853, 113, 174, 74, { icon: 'circleCheck' }),
  n('review', 'process', '2. Review Existing Information', 233, 258, 220, 100, { icon: 'fileSearch', sub: 'Prior surveys, registers, plans, drawings, inaccessible areas' }),
  n('sufficient', 'decision', 'Sufficient information to confirm ACM?', 480, 248, 138, 124),
  n('confirmed', 'register', 'Record as Confirmed / Presumed ACM', 658, 264, 154, 78, { icon: 'badgeCheck' }),
  n('register', 'register', '4. Update Asbestos Register', 847, 261, 194, 112, { icon: 'database', sub: 'Create / update ACM record: location, material type, extent, photos, evidence' }),
  n('assess', 'process', '5. Assess ACM Condition & Risk', 1068, 259, 198, 112, { icon: 'clipboardCheck', sub: 'Condition, likelihood of disturbance, exposure risk, occupancy, use' }),
  n('sampling', 'process', '3. Material Sampling & Testing', 301, 402, 260, 50, { icon: 'flask', sub: 'If safe and practical' }),
  n('lab', 'process', 'Laboratory Analysis', 602, 402, 202, 50, { icon: 'microscope', sub: 'Confirm asbestos' }),
  n('risk-level', 'decision', '6. Risk Level?', 650, 494, 198, 62),
  n('level-high', 'level', 'High', 549, 583, 84, 30, { tone: 'high' }),
  n('level-medium', 'level', 'Medium', 708, 583, 96, 30, { tone: 'medium' }),
  n('level-low', 'level', 'Low', 880, 583, 82, 30, { tone: 'low' }),
  n('control-high', 'control', 'Prioritize Control', 510, 633, 162, 84, { tone: 'high', icon: 'shieldAlert', sub: 'Immediate / short-term (e.g. restrict access, enclose, removal)' }),
  n('control-medium', 'control', 'Planned Control', 679, 633, 162, 84, { tone: 'medium', icon: 'clipboardList', sub: 'Medium-term (e.g. seal, manage in place, monitor more frequently)' }),
  n('control-low', 'control', 'Routine Control', 848, 633, 144, 84, { tone: 'low', icon: 'shieldCheck', sub: 'Long-term (e.g. maintain, label, periodic inspection)' }),
  n('implement', 'process', '7. Implement Control Measures', 538, 753, 428, 50, { icon: 'cog', sub: 'Manage in place / Label / Enclose / Seal / Remove by licensed contractor' }),
  n('monitoring', 'card', '8. Monitoring & Review', 236, 545, 236, 212, { icon: 'calendar', items: [
    'Schedule inspections (based on risk & condition)',
    'Record condition and changes (Good / Fair / Poor / Damaged)',
    'Reassess risk (if condition, use or activity changes)',
  ] }),
  n('communication', 'card', '9. Communication & Training', 1030, 480, 236, 156, { icon: 'users', items: [
    'Asbestos awareness training (staff, contractors, visitors)',
    'Risk communication (locations, controls, precautions)',
    'Maintain training records (completion & refreshers)',
  ] }),
  n('emergency', 'card', '10. Emergency Procedures', 1030, 645, 236, 175, { icon: 'siren', tone: 'high', items: [
    'Respond to damage / disturbance',
    'Secure the area and restrict access',
    'Notify ARP / Duty Holder',
    'Arrange professional assessment',
    'Record incident and actions',
    'Clearance before reoccupation',
  ] }),
  n('update-records', 'process', '11. Update Records & Re-assess', 308, 845, 320, 74, { icon: 'fileText', sub: 'Update ACM Register, Risk Assessment, Control Measures Schedule' }),
  n('approvals', 'process', '12. Workflow & Approvals', 673, 845, 284, 74, { icon: 'network', sub: 'Review & approve key items: Survey, Risk, Control Actions, Plan Updates' }),
  n('plan', 'process', '13. Management Plan', 997, 845, 258, 74, { icon: 'bookOpen', sub: 'Auto-generate / update the Asbestos Management Plan with latest records and approvals' }),
  n('ongoing', 'outcome', '14. Ongoing Compliance (Continuous Cycle)', 508, 939, 516, 72, { icon: 'refresh', sub: 'Periodic review, re-inspection, training refresh, incident management, and plan re-approval (e.g. every 12 months or on change)' }),
]

const e = (source, target, sourceHandle, targetHandle, label) => ({ id: `${source}-${target}`, source, target, sourceHandle, targetHandle, ...(label ? { label } : {}) })

export const TEMPLATE_EDGES = [
  e('start', 'identify', 'r', 'l'),
  e('identify', 'likely', 'r', 'l'),
  e('likely', 'no-acm', 'r', 'l', 'NO'),
  e('likely', 'review', 'b', 't', 'YES'),
  e('review', 'sufficient', 'r', 'l'),
  e('sufficient', 'confirmed', 'r', 'l', 'YES'),
  e('sufficient', 'sampling', 'b', 't', 'NO'),
  e('sampling', 'lab', 'r', 'l'),
  e('lab', 'confirmed', 't', 'b'),
  e('confirmed', 'register', 'r', 'l'),
  e('register', 'assess', 'r', 'l'),
  e('assess', 'risk-level', 'b', 't'),
  e('assess', 'monitoring', 'b', 't'),
  e('risk-level', 'level-high', 'b', 't'),
  e('risk-level', 'level-medium', 'b', 't'),
  e('risk-level', 'level-low', 'b', 't'),
  e('level-high', 'control-high', 'b', 't'),
  e('level-medium', 'control-medium', 'b', 't'),
  e('level-low', 'control-low', 'b', 't'),
  e('control-high', 'implement', 'b', 't'),
  e('control-medium', 'implement', 'b', 't'),
  e('control-low', 'implement', 'b', 't'),
  e('monitoring', 'risk-level', 'r', 'l'),
  e('implement', 'monitoring', 'l', 'b'),
  e('implement', 'update-records', 'b', 't'),
  e('emergency', 'update-records', 'b', 't'),
  e('update-records', 'approvals', 'r', 'l'),
  e('approvals', 'plan', 'r', 'l'),
  e('plan', 'ongoing', 'b', 'r'),
  e('ongoing', 'monitoring', 'l', 'b', 'Repeat'),
]

// Side panels from the reference
export const RISK_LEVELS = [
  { tone: 'high', label: 'High', text: 'Damaged, friable or likely to be disturbed' },
  { tone: 'medium', label: 'Medium', text: 'Intact but with reasonable potential for disturbance' },
  { tone: 'low', label: 'Low', text: 'Good condition and unlikely to be disturbed' },
]
export const KEY_OUTPUTS = [
  'Up-to-date Asbestos Register', 'Risk Assessment Records', 'Control Measures & Actions', 'Monitoring & Inspection Records',
  'Training & Communication Records', 'Incident & Emergency Records', 'Approved Management Plan', 'Audit & Compliance Reports',
]
