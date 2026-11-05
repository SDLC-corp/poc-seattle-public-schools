import '../Users/users.css'
import './cost.css'

export function CostHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="ci-head">
      <div>
        <h1><Icon size={24} />{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="ci-head-actions">{children}</div>}
    </div>
  )
}

export function Kpi({ icon: Icon, label, sub, value, tone = 'primary', hint, onClick, active }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={`ci-kpi tone-${tone}${onClick ? ' click' : ''}${active ? ' active' : ''}`} onClick={onClick} title={hint}>
      <span className="ci-kpi-icon"><Icon size={18} /></span>
      <span className="ci-kpi-text">
        <span className="ci-kpi-label">{label}{sub && <small>{sub}</small>}</span>
        <strong>{value}</strong>
      </span>
    </Tag>
  )
}

export function Card({ title, sub, actions, children, className = '' }) {
  return (
    <section className={`u-card ci-card ${className}`}>
      {(title || actions) && (
        <header className="ci-card-head">
          <div>{title && <h2>{title}</h2>}{sub && <small>{sub}</small>}</div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

export function Field({ label, children }) {
  return <label className="ci-field"><span>{label}</span>{children}</label>
}
