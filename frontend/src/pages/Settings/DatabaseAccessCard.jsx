import { Database, ArrowRightLeft, RefreshCw, ShieldCheck, Table2, Clock } from 'lucide-react'

// Placeholder for the planned SQL Server integration (no connection is made)
const PLANNED = [
  { icon: ArrowRightLeft, text: 'Migrate existing Seattle Public Schools records: schools, buildings, floors, rooms and ACM materials' },
  { icon: Table2, text: 'Map database tables and columns to this app on screen' },
  { icon: RefreshCw, text: 'Keep both in step with scheduled incremental sync' },
  { icon: ShieldCheck, text: 'Read-only access by default, with every import in the audit log' },
]

export default function DatabaseAccessCard() {
  return (
    <section className="lc">
      <div className="lc-head">
        <div>
          <h2>Database</h2>
          <p>Connect the district’s existing facilities database.</p>
        </div>
      </div>
      <article className="db-soon">
        <header>
          <span className="db-soon-icon" aria-hidden="true"><Database size={22} /></span>
          <div className="lc-title">
            <h3>Microsoft Database Access</h3>
            <span className="db-soon-sub">SQL Server · Azure SQL Database</span>
          </div>
          <span className="db-soon-badge"><Clock size={12} />Coming soon</span>
        </header>
        <p className="db-soon-desc">
          Bring Seattle Public Schools’ existing data into this app and keep it synchronized, so facility and asbestos records stay in one place.
        </p>
        <ul className="db-soon-list">
          {PLANNED.map(({ icon: Icon, text }) => <li key={text}><Icon size={15} />{text}</li>)}
        </ul>
      </article>
    </section>
  )
}
