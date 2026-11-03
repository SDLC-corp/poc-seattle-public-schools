import { TriangleAlert, CircleCheck, ShieldQuestion, CircleHelp } from 'lucide-react'

// Result classes from the backend's classifier (backend/src/data/labSamplesStore.js)
export const RESULT_META = {
  detected: { label: 'Asbestos Detected', icon: TriangleAlert },
  none: { label: 'No Asbestos Detected', icon: CircleCheck },
  assumed: { label: 'Assumed ACM', icon: ShieldQuestion },
  inconclusive: { label: 'Not Analyzed', icon: CircleHelp },
}

// Status colour always comes with an icon and text, never colour alone
export function ResultChip({ resultClass, label }) {
  const meta = RESULT_META[resultClass] ?? RESULT_META.inconclusive
  const Icon = meta.icon
  return (
    <span className={`lr-chip ${resultClass}`}>
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      {label ?? meta.label}
    </span>
  )
}
