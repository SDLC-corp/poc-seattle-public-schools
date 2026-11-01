// Default platform settings. Saved settings are validated against this shape: unknown keys
// are dropped and every value must have the same type as its default.
export const settingsDefaults = {
  organization: {
    districtName: 'Seattle Public Schools',
    address: '2445 3rd Avenue South\nSeattle, WA 98134',
    phone: '(206) 252-0566',
    email: 'ehs@seattleschools.org',
    timeZone: 'America/Los_Angeles',
  },
  application: {
    defaultLandingPage: 'dashboard',
    defaultSchoolView: '',
    itemsPerPage: 10,
    systemBannerEnabled: true,
    systemBannerText: 'Asbestos management system – Seattle Public Schools',
    helpSupportEnabled: true,
    helpSupportText: 'Show help menu and support contact',
    sessionTimeoutMinutes: 60,
    dateFormat: 'MM/DD/YYYY',
    numberFormat: 'en-US',
  },
  theme: {
    mode: 'light',
    primaryColor: '#006AA3',
    secondaryColor: '#F2A33A',
    logoDataUrl: '',
  },
  security: {
    mfaEnabled: true,
    passwordResetByEmail: true,
    minPasswordLength: 8,
    requireSpecialCharacter: true,
    passwordExpiryDays: 90,
    lockoutAttempts: 5,
  },
  // AHERA (40 CFR 763): reinspection every 3 years, periodic surveillance every 6 months
  compliance: {
    inspectionReminderDays: 30,
    reinspectionCycleYears: 3,
    surveillanceIntervalMonths: 6,
    defaultAcmStatus: 'ACM Present',
    defaultMaterialCondition: 'Good',
    defaultFriability: 'Friable',
  },
  system: {
    auditLogging: true,
    dataExport: true,
    bulkImport: true,
    apiAccess: false,
  },
  support: {
    supportEmail: 'procurementservices@seattleschools.org',
    supportPhone: '(206) 252-0713',
    helpUrl: 'https://www.seattleschools.org/ehs/asbestos',
  },
};
