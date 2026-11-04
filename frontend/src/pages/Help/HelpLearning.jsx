import { useState } from 'react'
import { Link } from 'react-router'
import { GraduationCap, PlayCircle, BookOpen, UsersRound, CalendarDays, FileText, ChevronDown } from 'lucide-react'
import './help.css'

const TABS = ['Getting Started', 'User Guides', 'Role-based Learning', 'Training Sessions', 'FAQs']

// Guides link to the real screens; video/manual/sessions are placeholders until published
const GETTING_STARTED = [
  { icon: PlayCircle, title: 'System Overview', text: 'A quick introduction to the system and key modules.', action: 'Video coming soon', disabled: true },
  { icon: BookOpen, title: 'User Manual', text: 'Step-by-step guide with screens and workflows.', action: 'PDF coming soon', disabled: true },
  { icon: UsersRound, title: 'Role-based Guides', text: 'Guides for EHS, Principal, Maintenance and Inspector.', action: 'View guides', tab: 'Role-based Learning' },
  { icon: CalendarDays, title: 'Software Training Sessions', text: 'Live or virtual sessions for district users.', action: 'View schedule', tab: 'Training Sessions' },
]

const GUIDES = [
  { title: 'Log an air monitoring sample and enter the lab result', to: '/air-monitoring' },
  { title: 'Track inspections and mark them completed', to: '/compliance' },
  { title: 'Upload a management plan or lab report', to: '/reports/documents' },
  { title: 'Record staff asbestos training', to: '/personnel/people' },
  { title: 'Add a user and assign school access', to: '/users' },
  { title: 'Review who changed what in the Audit Logs', to: '/audit' },
]

const ROLES = [
  { role: 'EHS Manager', tasks: ['Dashboard & compliance overview', 'Inspection schedule and completions', 'Users, roles and settings'] },
  { role: 'Principal', tasks: ['Your school’s compliance status', 'Annual AHERA notifications', 'Documents for your school'] },
  { role: 'Facilities / Maintenance', tasks: ['ACM locations and condition', 'Response actions', 'Training records for your staff'] },
  { role: 'Inspector', tasks: ['Upcoming inspections', 'Recording results', 'Air monitoring samples'] },
]

const FAQS = [
  ['How is a school’s compliance status decided?', 'From its inspection schedule: Non-Compliant if any inspection is overdue, Due Soon if one is due within 30 days, otherwise Compliant. Marking an inspection completed books the next 6-month surveillance automatically.'],
  ['What makes an air sample an exceedance?', 'The result is compared to the limit for its type and method: 0.01 f/cc for PCM area/clearance/background, 0.1 f/cc (OSHA PEL) for personal samples, 1.0 f/cc for excursions and 70 s/mm² for TEM clearance. Leave the result empty while the lab report is pending.'],
  ['When is someone’s training “Due Soon” or “Expired”?', 'Due Soon when any required course expires within 60 days; Expired when one has lapsed or was never recorded. Accredited disciplines (inspector, supervisor, worker, management planner) need an annual refresher.'],
  ['Where do I see who changed something?', 'Audit Logs records every create, update, delete, export and sign-in with before/after values.'],
  ['Why do some records say “Sample”?', 'This is a proof of concept. Records marked sample were generated for the demo; anything you add yourself is real and is kept when sample data is regenerated.'],
]

export default function HelpLearning() {
  const [tab, setTab] = useState('Getting Started')
  const [open, setOpen] = useState(0)

  return (
    <div className="help-wrap">
      <section className="help-card">
        <header className="help-head">
          <span className="help-icon"><GraduationCap size={26} /></span>
          <div>
            <h2>Help &amp; Learning – Software Training</h2>
            <p>Learn how to use the Asbestos Reporting &amp; Compliance Management System.</p>
          </div>
          <span className="help-tag">District User Training &amp; Documentation</span>
        </header>

        <nav className="help-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>

        {tab === 'Getting Started' && (
          <div className="help-tiles">
            {GETTING_STARTED.map(({ icon: Icon, title, text, action, disabled, tab: target }) => (
              <div key={title} className="help-tile">
                <Icon size={30} />
                <strong>{title}</strong>
                <span>{text}</span>
                <button type="button" className="help-action" disabled={disabled} onClick={() => target && setTab(target)}>{action}{!disabled && ' →'}</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'User Guides' && (
          <ul className="help-list">
            {GUIDES.map((g) => (
              <li key={g.title}><FileText size={15} /><Link to={g.to}>{g.title}</Link></li>
            ))}
          </ul>
        )}

        {tab === 'Role-based Learning' && (
          <div className="help-roles">
            {ROLES.map((r) => (
              <div key={r.role} className="help-role">
                <strong>{r.role}</strong>
                <ul>{r.tasks.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            ))}
          </div>
        )}

        {tab === 'Training Sessions' && (
          <p className="help-empty"><CalendarDays size={18} />No software training sessions are scheduled yet. Sessions will be listed here once the rollout plan is set.</p>
        )}

        {tab === 'FAQs' && (
          <ul className="help-faq">
            {FAQS.map(([q, a], i) => (
              <li key={q}>
                <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                  {q}<ChevronDown size={15} className={open === i ? 'up' : ''} />
                </button>
                {open === i && <p>{a}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  )
}
