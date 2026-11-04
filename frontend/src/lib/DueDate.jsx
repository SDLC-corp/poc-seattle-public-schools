// A due date coloured by how close it is: red once it's past, amber within `soonDays`, plain otherwise
// (and plain once the work is done). The state is also in the title, so it doesn't rely on colour alone.
const DAY = 86400000

export function dueState(iso, { done = false, soonDays = 30 } = {}) {
  if (!iso || done) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((Date.parse(`${String(iso).slice(0, 10)}T00:00:00`) - today.getTime()) / DAY)
  if (days < 0) return { tone: 'overdue', text: `Overdue by ${-days} day${days === -1 ? '' : 's'}` }
  if (days <= soonDays) return { tone: 'soon', text: days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}` }
  return null
}

export default function DueDate({ date, done, soonDays, children }) {
  const s = dueState(date, { done, soonDays })
  return <span className={s ? `due-date due-${s.tone}` : undefined} title={s?.text}>{children}</span>
}
