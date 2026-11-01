// Microsoft integrations shown under Settings › Integrations.
// Field types: text | guid | url | email | number | select | secret | date | toggle
// `secret` fields are encrypted at rest and never returned to the browser.
const GUID_HINT = '00000000-0000-0000-0000-000000000000';

const appRegistration = [
  { key: 'tenantId', label: 'Directory (Tenant) ID', type: 'guid', required: true, placeholder: GUID_HINT },
  { key: 'clientId', label: 'Application (Client) ID', type: 'guid', required: true, placeholder: GUID_HINT },
  { key: 'clientSecret', label: 'Client Secret', type: 'secret', required: true, placeholder: 'Paste the secret value' },
  { key: 'secretExpiresOn', label: 'Secret Expires On', type: 'date', required: true },
];

export const INTEGRATIONS = [
  {
    id: 'entra',
    name: 'Microsoft Entra ID',
    vendor: 'Microsoft',
    category: 'Identity & Single Sign-On',
    description: 'Single sign-on for district staff and contractors, with user and group sync for roles.',
    brand: '#0078D4',
    authType: 'OAuth 2.0 / OpenID Connect',
    permissions: ['openid', 'profile', 'email', 'User.Read.All', 'GroupMember.Read.All'],
    syncLabel: 'users & groups',
    syncHours: 6,
    fields: [
      ...appRegistration,
      { key: 'redirectUri', label: 'Redirect URI', type: 'url', required: true, placeholder: 'https://asbestos.example/auth/callback' },
      { key: 'allowedDomain', label: 'Allowed Sign-in Domain', type: 'text', required: false, placeholder: 'district.example' },
      { key: 'syncGroups', label: 'Map Entra groups to app roles', type: 'toggle', default: true },
    ],
  },
  {
    id: 'sharepoint',
    name: 'SharePoint Online',
    vendor: 'Microsoft 365',
    category: 'Document Storage',
    description: 'Sync AHERA management plans, inspection reports and lab results with a SharePoint document library.',
    brand: '#038387',
    authType: 'Microsoft Graph (app-only)',
    permissions: ['Sites.Selected', 'Files.ReadWrite.All'],
    syncLabel: 'documents',
    syncHours: 1,
    fields: [
      ...appRegistration,
      { key: 'siteUrl', label: 'Site URL', type: 'url', required: true, placeholder: 'https://contoso.sharepoint.com/sites/Facilities', domain: '.sharepoint.com' },
      { key: 'libraryName', label: 'Document Library', type: 'text', required: true, placeholder: 'Asbestos Records' },
      { key: 'folderPath', label: 'Folder Path', type: 'text', required: false, placeholder: '/AHERA' },
    ],
  },
  {
    id: 'outlook',
    name: 'Microsoft Outlook',
    vendor: 'Exchange Online',
    category: 'Email & Calendar',
    description: 'Send compliance notifications from a shared mailbox and add inspections to Outlook calendars.',
    brand: '#0F6CBD',
    authType: 'Microsoft Graph (app-only)',
    permissions: ['Mail.Send', 'Calendars.ReadWrite'],
    syncLabel: 'calendar events',
    syncHours: 2,
    fields: [
      ...appRegistration,
      { key: 'senderMailbox', label: 'Sender Mailbox', type: 'email', required: true, placeholder: 'asbestos-noreply@district.example' },
      { key: 'calendarSync', label: 'Add inspections to Outlook calendars', type: 'toggle', default: true },
    ],
  },
  {
    id: 'sql',
    name: 'Microsoft SQL Server',
    vendor: 'SQL Server / Azure SQL Database',
    category: 'Database Access',
    description: 'Read facility and room data from the district facilities database, and export compliance data for reporting.',
    brand: '#CC2927',
    authType: 'SQL authentication or Entra ID',
    permissions: ['db_datareader', 'db_datawriter (export schema only)'],
    syncLabel: 'records',
    syncHours: 24,
    fields: [
      { key: 'server', label: 'Server', type: 'text', required: true, placeholder: 'facilities-db.database.windows.net' },
      { key: 'port', label: 'Port', type: 'number', required: true, default: 1433 },
      { key: 'database', label: 'Database', type: 'text', required: true, placeholder: 'Facilities' },
      { key: 'authentication', label: 'Authentication', type: 'select', required: true, options: ['SQL Server Authentication', 'Microsoft Entra ID'], default: 'SQL Server Authentication' },
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'asbestos_reader' },
      { key: 'password', label: 'Password', type: 'secret', required: true, placeholder: 'Database password' },
      { key: 'encrypt', label: 'Encrypt connection (TLS)', type: 'toggle', default: true },
    ],
  },
];

export const integrationById = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i]));
