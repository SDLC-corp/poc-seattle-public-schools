// Status pill coloured by a dashboard tone (.tone-good / warning / critical / neutral)
export default function Badge({ tone, children }) {
  return <span className={`ai-badge tone-${tone ?? 'neutral'}`}>{children}</span>
}
