// Asbestos training programs and who must hold them.
// renewalMonths: null = no expiry. Accredited disciplines (TSCA Title II / 40 CFR 763 Appendix C
// to Subpart E, Model Accreditation Plan) lapse 12 months after the last course without a refresher.
export const PROGRAMS = [
  {
    id: 'awareness', name: 'Asbestos Awareness (2-hour)', hours: 2, renewalMonths: 12, accredited: false,
    basis: 'AHERA 40 CFR 763.92(a)(1) – custodial & maintenance staff; annual refresher is district policy',
  },
  {
    id: 'om-16', name: 'Operations & Maintenance (16-hour)', hours: 16, renewalMonths: 12, accredited: false,
    basis: 'AHERA 40 CFR 763.92(a)(2) – staff who may disturb ACM; annual refresher is district policy',
  },
  {
    id: 'designated-person', name: 'AHERA Designated Person', hours: 24, renewalMonths: null, accredited: false,
    basis: 'AHERA 40 CFR 763.84(g) – LEA designated person must be adequately trained',
  },
  {
    id: 'inspector', name: 'AHERA Building Inspector', hours: 24, renewalMonths: 12, accredited: true,
    basis: 'EPA Model Accreditation Plan – 3-day initial, annual 4-hour refresher',
  },
  {
    id: 'management-planner', name: 'AHERA Management Planner', hours: 16, renewalMonths: 12, accredited: true,
    basis: 'EPA Model Accreditation Plan – 2-day initial (after Inspector), annual refresher',
  },
  {
    id: 'supervisor', name: 'Abatement Contractor/Supervisor', hours: 40, renewalMonths: 12, accredited: true,
    basis: 'EPA Model Accreditation Plan – 5-day initial, annual 8-hour refresher',
  },
  {
    id: 'worker', name: 'Abatement Worker', hours: 32, renewalMonths: 12, accredited: true,
    basis: 'EPA Model Accreditation Plan – 4-day initial, annual 8-hour refresher',
  },
  {
    id: 'respirator', name: 'Respirator Fit Test', hours: 1, renewalMonths: 12, accredited: false,
    basis: 'OSHA 29 CFR 1910.134(f) – annual fit testing',
  },
];

// Person categories → required programs
export const CATEGORIES = {
  'employee-custodial': { label: 'Employee (Custodial)', kind: 'Employee', required: ['awareness'] },
  'employee-maintenance': { label: 'Employee (Maintenance)', kind: 'Employee', required: ['awareness', 'om-16', 'respirator'] },
  'employee-ehs': { label: 'Employee (EHS)', kind: 'Employee', required: ['designated-person', 'awareness'] },
  'inspector': { label: 'Inspector (Consultant)', kind: 'Inspector', required: ['inspector', 'management-planner'] },
  'contractor-supervisor': { label: 'Contractor (Supervisor)', kind: 'Contractor', required: ['supervisor', 'respirator'] },
  'contractor-worker': { label: 'Contractor (Abatement)', kind: 'Contractor', required: ['worker', 'respirator'] },
};

export const programById = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));
