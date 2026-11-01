// Permission catalogue and the default (seed) roles. School access is separate from
// permissions: a permission says what a user may do, school access says where.
// Permissions map to app features, so the catalogue is fixed in code; roles are editable at
// runtime and stored in data/roles.json (see rolesStore.js).

export const permissions = [
  { id: 'schools.view_all', label: 'View all schools and facilities', group: 'Schools' },
  { id: 'schools.view_assigned', label: 'View assigned schools', group: 'Schools' },
  { id: 'acm.manage', label: 'Manage ACM inventory', group: 'ACM' },
  { id: 'acm.view', label: 'View ACM inventory', group: 'ACM' },
  { id: 'inspections.manage', label: 'Manage inspections', group: 'Inspections' },
  { id: 'inspections.perform', label: 'Perform and record inspections', group: 'Inspections' },
  { id: 'response.manage', label: 'Manage response actions', group: 'Response' },
  { id: 'response.update', label: 'Update assigned response actions', group: 'Response' },
  { id: 'lab.upload', label: 'Upload lab results', group: 'Lab' },
  { id: 'reports.generate', label: 'View and generate reports', group: 'Reports' },
  { id: 'documents.all', label: 'Access all documents', group: 'Documents' },
  { id: 'documents.assigned', label: 'Access documents for assigned schools', group: 'Documents' },
  { id: 'notifications.receive', label: 'Receive compliance notifications', group: 'Notifications' },
  { id: 'users.manage', label: 'Manage users and roles', group: 'Administration' },
  { id: 'settings.manage', label: 'Manage system settings', group: 'Administration' },
];

export const TONES = ['primary', 'good', 'violet', 'warning', 'critical', 'teal'];
export const ACCESS_SCOPES = ['all', 'schools', 'assigned', 'lab'];

// The admin role can't be deleted and must keep these, so nobody can lock themselves out
export const SYSTEM_ROLE_ID = 'ehs-manager';
export const SYSTEM_ROLE_REQUIRED = ['users.manage', 'settings.manage'];

export const defaultRoles = [
  {
    id: 'ehs-manager',
    name: 'EHS Manager',
    tone: 'primary',
    description: 'District environmental health & safety lead with full access.',
    defaultAccess: 'all',
    permissions: [
      'schools.view_all', 'acm.manage', 'inspections.manage', 'response.manage', 'lab.upload',
      'reports.generate', 'documents.all', 'notifications.receive', 'users.manage', 'settings.manage',
    ],
  },
  {
    id: 'principal',
    name: 'Principal',
    tone: 'violet',
    description: 'School leader; views their school’s asbestos status and is notified of issues.',
    defaultAccess: 'schools',
    permissions: ['schools.view_assigned', 'acm.view', 'documents.assigned', 'notifications.receive'],
  },
  {
    id: 'facilities-manager',
    name: 'Facilities Manager',
    tone: 'good',
    description: 'Maintains buildings; manages ACM records and response actions for assigned schools.',
    defaultAccess: 'schools',
    permissions: [
      'schools.view_assigned', 'acm.manage', 'inspections.manage', 'response.manage',
      'documents.assigned', 'notifications.receive', 'reports.generate',
    ],
  },
  {
    id: 'inspector',
    name: 'Inspector',
    tone: 'warning',
    description: 'Accredited inspector performing AHERA inspections and surveillance.',
    defaultAccess: 'schools',
    permissions: ['schools.view_assigned', 'acm.view', 'inspections.perform', 'documents.assigned'],
  },
  {
    id: 'capital-projects',
    name: 'Capital Projects',
    tone: 'teal',
    description: 'Plans renovations and needs district-wide ACM visibility.',
    defaultAccess: 'all',
    permissions: ['schools.view_all', 'acm.view', 'reports.generate', 'documents.all'],
  },
  {
    id: 'contractor',
    name: 'Contractor',
    tone: 'critical',
    description: 'External abatement contractor limited to assigned projects.',
    defaultAccess: 'assigned',
    permissions: ['schools.view_assigned', 'acm.view', 'response.update', 'documents.assigned'],
  },
  {
    id: 'lab-user',
    name: 'Lab User',
    tone: 'violet',
    description: 'External laboratory uploading sample analysis results.',
    defaultAccess: 'lab',
    permissions: ['lab.upload'],
  },
];
