import { FileText, FileImage, FileSpreadsheet, FileType, File as FileIcon, Cloud, Upload } from 'lucide-react'

const ICONS = {
  pdf: { icon: FileText, cls: 'pdf' },
  png: { icon: FileImage, cls: 'img' },
  jpg: { icon: FileImage, cls: 'img' },
  jpeg: { icon: FileImage, cls: 'img' },
  webp: { icon: FileImage, cls: 'img' },
  xlsx: { icon: FileSpreadsheet, cls: 'xls' },
  csv: { icon: FileSpreadsheet, cls: 'xls' },
  docx: { icon: FileType, cls: 'doc' },
  txt: { icon: FileText, cls: 'txt' },
}

export function FileBadge({ ext, size = 16 }) {
  const { icon: Icon, cls } = ICONS[ext] ?? { icon: FileIcon, cls: 'txt' }
  return <span className={`d-file d-file-${cls}`}><Icon size={size} /></span>
}

export function SourceLabel({ source }) {
  return source === 'sharepoint'
    ? <span className="d-source"><Cloud size={14} />SharePoint</span>
    : <span className="d-source"><Upload size={14} />Uploaded</span>
}
