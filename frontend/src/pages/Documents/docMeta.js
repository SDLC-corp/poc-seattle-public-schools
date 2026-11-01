// Document screen constants and helpers (components live in docUtils.jsx)

export const CATEGORY_TABS = [
  { slug: '', label: 'All Documents' },
  { slug: 'management-plans', label: 'Management Plans' },
  { slug: 'inspection-reports', label: 'Inspection Reports' },
  { slug: 'lab-reports', label: 'Lab Reports' },
  { slug: 'floor-plans', label: 'Floor Plans' },
  { slug: 'training-records', label: 'Training Records' },
  { slug: 'notifications', label: 'Notifications' },
  { slug: 'other', label: 'Other' },
]

export const fmtSize = (bytes) => {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const isPreviewable = (doc) => ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt'].includes(doc.ext)
