// Page code prefetching, so moving around the app feels instant. Pages are loaded on demand (App.jsx lazy routes);
// these are the same imports, so a page fetched here early is already there when it's opened.
//  - prefetchPath(href): when the pointer rests on (or keyboard focus reaches) a link to that page
//  - prefetchCommonPages(): the most used pages, quietly, once the app is idle after the first load

const PAGES = [
  [/^\/dashboard/, () => import('../pages/Dashboard/Dashboard')],
  [/^\/users/, () => import('../pages/Users/UsersRoles')],
  [/^\/settings/, () => import('../pages/Settings/Settings')],
  [/^\/integrations/, () => import('../pages/Settings/IntegrationsPage')],
  [/^\/management-plans/, () => import('../pages/ManagementPlans/ManagementPlan')],
  [/^\/operations\/activities\//, () => import('../pages/Operations/ActivityForm')],
  [/^\/operations/, () => import('../pages/Operations/Operations')],
  [/^\/audit/, () => import('../pages/Audit/AuditLogs')],
  [/^\/notifications/, () => import('../pages/Notifications/Notifications')],
  [/^\/compliance/, () => import('../pages/Compliance/Compliance')],
  [/^\/air-monitoring\/events\//, () => import('../pages/AirMonitoring/AirEventPage')],
  [/^\/air-monitoring/, () => import('../pages/AirMonitoring/AirMonitoring')],
  [/^\/personnel/, () => import('../pages/Personnel/Personnel')],
  [/^\/sampling\/samples\//, () => import('../pages/LabSamples/SamplePage')],
  [/^\/sampling/, () => import('../pages/LabSamples/LabSamples')],
  [/^\/trends/, () => import('../pages/Trends/Trends')],
  [/^\/cost\/invoices\/[^/]+/, () => import('../pages/Cost/InvoiceDetail')],
  [/^\/cost\/invoices/, () => import('../pages/Cost/InvoiceAnalysis')],
  [/^\/cost\/reports/, () => import('../pages/Cost/CostReports')],
  [/^\/cost/, () => import('../pages/Cost/CostForecasting')],
  [/^\/(reports|documents)/, () => import('../pages/Reports/Reports')],
  [/^\/acm/, () => import('../pages/AcmInventory/AcmInventory')],
  [/^\/surveillance\/(new|records)/, () => import('../pages/Surveillance/SurveillanceForm')],
  [/^\/surveillance/, () => import('../pages/Surveillance/Surveillance')],
  [/^\/inspections\/(new|records)/, () => import('../pages/Inspections/InspectionForm')],
  [/^\/inspections/, () => import('../pages/Inspections/Inspections')],
  [/^\/microsoft-365/, () => import('../pages/Microsoft365/Microsoft365')],
  [/^\/help/, () => import('../pages/Help/HelpPage')],
  [/^\/schools\/(list)?\/?$/, () => import('../pages/Schools/Schools')],
  [/^\/schools\/buildings/, () => import('../pages/Schools/Buildings')],
  [/^\/schools\/(floors|rooms|acm-materials)/, () => import('../pages/Schools/RoomsFloorPlans')],
  [/^\/schools\/[^/]+\/buildings\/[^/]+\/floors\/[^/]+/, () => import('../pages/Schools/FloorRooms')],
  [/^\/schools\/[^/]+\/buildings\/[^/]+/, () => import('../pages/Schools/BuildingDetail')],
  [/^\/schools\/[^/]+/, () => import('../pages/Schools/SchoolDetail')],
]

const started = new Set()

/** Start loading the code of the page at this app path (no-op for unknown or already started pages). */
export function prefetchPath(href) {
  if (!href || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api')) return
  const path = href.split(/[?#]/)[0]
  const hit = PAGES.find(([re]) => re.test(path))
  if (!hit || started.has(hit[1])) return
  started.add(hit[1])
  hit[1]().catch(() => started.delete(hit[1])) // a failed fetch can be retried on the next hover
}

// Pages most people open next; skipped on metered / "save data" connections
const COMMON = ['/inspections', '/schools/list', '/acm', '/surveillance', '/operations', '/compliance', '/reports', '/schools/x']

export function prefetchCommonPages() {
  if (navigator.connection?.saveData) return
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500))
  let i = 0
  const next = () => { if (i < COMMON.length) { prefetchPath(COMMON[i]); i += 1; idle(next) } }
  idle(next)
}
