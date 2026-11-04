import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Sparkles, X, Send, RotateCcw, Bot } from 'lucide-react'
import { request } from '../../lib/api'
import './chatAssistant.css'

// Sample assistant: scripted answers (two read live data) with a typing / streaming feel.
// Not connected to an AI model yet.
const SCHOOL = 'garfieldhs'

const QUESTIONS = [
  {
    id: 'inspections', q: 'How often do ACMs need to be inspected?', keys: ['inspect', 'surveillance', 'how often', 'frequency', 'reinspect'],
    answer: async () => ({
      text: ['Under AHERA every school follows a fixed cycle:'],
      list: [
        'Periodic surveillance (visual condition check) of every ACM at least every 6 months.',
        'Re-inspection by an accredited inspector at least every 3 years.',
        'In this plan, high and medium risk ACMs are also re-inspected every year.',
        'The management plan itself is reviewed every 12 months.',
      ],
      after: 'The Monitoring tab shows what is due or overdue for each activity.',
      links: [{ label: 'Open Monitoring Schedule', to: '/management-plans/monitoring' }],
    }),
  },
  {
    id: 'emergency', q: 'What should I do if asbestos is disturbed?', keys: ['disturb', 'damage', 'emergency', 'release', 'spill', 'broke', 'incident'],
    answer: async () => ({
      text: ['Act straight away:'],
      list: [
        'Stop work immediately.',
        'Keep people out – evacuate the area and prevent access.',
        'Secure and isolate: close doors, shut down HVAC serving the area, put up warning signs.',
        'Notify the Asbestos Responsible Person (ARP) and the Duty Holder.',
        'Arrange an assessment by an accredited asbestos contractor or consultant.',
        'Record the incident, then re-occupy only after written clearance.',
      ],
      links: [{ label: 'Emergency Response steps & contacts', to: '/management-plans/emergency' }, { label: 'Report an incident', to: '/operations/activities/new' }],
    }),
  },
  {
    id: 'score', q: 'How is the risk score calculated?', keys: ['score', 'risk level', 'matrix', 'calculate', 'priority risk', 'material risk'],
    answer: async () => ({
      text: ['Risk score = Material Risk × Priority Risk, each rated 1–4:'],
      list: [
        'Material risk – likelihood of fibre release (friability and condition).',
        'Priority risk – likelihood of exposure (how the area is used and maintained).',
        'Score 12–16 is High, 6–11 Medium, 2–5 Low, and 1 Very Low.',
      ],
      after: 'High scores need urgent action; medium ones are managed and monitored.',
      links: [{ label: 'Open Risk Assessment', to: '/management-plans/risk' }],
    }),
  },
  {
    id: 'high', q: 'Which ACMs are high risk at Garfield High School?', keys: ['high risk', 'which acm', 'dangerous', 'worst', 'urgent'],
    answer: async () => {
      const d = await request(`/management-plans/${SCHOOL}/register`)
      const high = d.records.filter((r) => r.risk === 'High')
      return {
        text: [`Garfield High School has ${high.length} high-risk ACM${high.length === 1 ? '' : 's'} out of ${d.stats.total}:`],
        list: high.slice(0, 7).map((r) => `${r.description} – ${r.building} / ${r.room} (${r.condition})`),
        after: high.length > 7 ? `…and ${high.length - 7} more.` : 'Each one has a control measure and target date in the plan.',
        links: [{ label: 'View in Asbestos Register', to: '/management-plans/register' }, { label: 'Control Measures', to: '/management-plans/controls' }],
      }
    },
  },
  {
    id: 'arp', q: 'Who is the Asbestos Responsible Person?', keys: ['arp', 'responsible person', 'who', 'contact', 'coordinator'],
    answer: async () => {
      const d = await request(`/management-plans/${SCHOOL}/roles`)
      const arp = d.roles.find((r) => r.id === 'arp')
      const p = arp?.person
      return p
        ? {
          text: [`The ARP for Garfield High School is ${p.name}${p.position ? `, ${p.position}` : ''}.`],
          list: [p.phone && `Phone: ${p.phone}`, p.email && `Email: ${p.email}`].filter(Boolean),
          after: 'They manage the register, arrange inspections and are the first contact in an emergency.',
          links: [{ label: 'Roles & Responsibilities', to: '/management-plans/roles' }],
        }
        : { text: ['No ARP is assigned in the plan yet.'], links: [{ label: 'Assign one in Roles & Responsibilities', to: '/management-plans/roles' }] }
    },
  },
  {
    id: 'training', q: 'What training do maintenance staff need?', keys: ['training', 'course', 'certif', 'staff', 'custodial', 'maintenance'],
    answer: async () => ({
      text: ['AHERA training depends on the work:'],
      list: [
        'All custodial and maintenance staff: 2-hour asbestos awareness training.',
        'Anyone doing O&M work that may disturb ACM: an extra 14 hours (16-hour O&M course).',
        'Abatement workers, inspectors and planners need accredited courses and refreshers.',
      ],
      after: 'Training status and expiry dates are tracked per person.',
      links: [{ label: 'Personnel, Training & Certifications', to: '/personnel' }],
    }),
  },
]

const FALLBACK = {
  text: ['I’m a sample assistant, so I can only answer a few questions for now. Try one of these:'],
  suggest: true,
}

function match(input) {
  const t = input.toLowerCase()
  return QUESTIONS.find((q) => q.keys.some((k) => t.includes(k)))
}

// Plain-text length of an answer, used to stream it in
const lengthOf = (a) => [...(a.text ?? []), ...(a.list ?? []), a.after ?? ''].join('').length
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// The visible part of each piece of an answer after `shown` characters have streamed in
function visibleParts(a, shown) {
  const pieces = [...(a.text ?? []), ...(a.list ?? []), a.after ?? '']
  const out = []
  let left = shown
  for (const p of pieces) {
    out.push(p.slice(0, Math.max(0, left)))
    left -= p.length
  }
  const nText = a.text?.length ?? 0
  const nList = a.list?.length ?? 0
  return { text: out.slice(0, nText), list: out.slice(nText, nText + nList), after: out[nText + nList] }
}

function Answer({ a, shown, onAsk, onNavigate }) {
  const v = visibleParts(a, shown)
  const done = shown >= lengthOf(a)
  return (
    <>
      {v.text.map((s, i) => s && <p key={i}>{s}</p>)}
      {v.list.some(Boolean) && <ul>{v.list.map((s, i) => s && <li key={i}>{s}</li>)}</ul>}
      {v.after && <p>{v.after}</p>}
      {done && a.links?.length > 0 && (
        <div className="ca-links">{a.links.map((l) => <Link key={l.to} to={l.to} onClick={onNavigate}>{l.label} →</Link>)}</div>
      )}
      {done && a.suggest && (
        <div className="ca-chips">{QUESTIONS.map((q) => <button key={q.id} type="button" onClick={() => onAsk(q)}>{q.q}</button>)}</div>
      )}
    </>
  )
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // { from: 'user' | 'bot', text?, answer?, shown? }
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, typing])
  useEffect(() => () => clearInterval(timer.current), [])

  const stream = (answer) => {
    const total = lengthOf(answer)
    setMessages((m) => [...m, { from: 'bot', answer, shown: 0 }])
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setMessages((m) => {
        const last = m[m.length - 1]
        const shown = Math.min(total, last.shown + 6)
        if (shown >= total) clearInterval(timer.current)
        return [...m.slice(0, -1), { ...last, shown }]
      })
    }, 18)
  }

  const ask = async (question, typed) => {
    if (typing) return
    setMessages((m) => [...m, { from: 'user', text: typed ?? question?.q }])
    setTyping(true)
    // a short "thinking" pause alongside the lookup, so it reads like an assistant
    const [answer] = await Promise.all([
      (question ? question.answer() : Promise.resolve(FALLBACK))
        .catch(() => ({ text: ['Sorry, I couldn’t load that information right now. Please try again in a moment.'] })),
      wait(650),
    ])
    setTyping(false)
    stream(answer)
  }
  const submit = (e) => {
    e.preventDefault()
    const t = input.trim()
    if (!t || typing) return
    setInput('')
    ask(match(t), t)
  }
  const reset = () => { clearInterval(timer.current); setMessages([]); setTyping(false) }
  const asked = new Set(messages.filter((m) => m.from === 'user').map((m) => m.text))

  return (
    <>
      {open && (
        <section className="ca-panel" role="dialog" aria-label="Asbestos assistant">
          <header className="ca-head">
            <span className="ca-avatar"><Sparkles size={18} /></span>
            <div><strong>Asbestos Assistant</strong><small><span className="ca-dot" />Sample · answers are scripted</small></div>
            {messages.length > 0 && <button type="button" className="ca-icon-btn" onClick={reset} title="New conversation" aria-label="New conversation"><RotateCcw size={16} /></button>}
            <button type="button" className="ca-icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close assistant"><X size={18} /></button>
          </header>

          <div className="ca-body" ref={listRef} aria-live="polite">
            <div className="ca-msg bot">
              <span className="ca-bot-icon"><Bot size={15} /></span>
              <div className="ca-bubble">
                <p>Hi! I can help with asbestos compliance and this management plan. Pick a question or type your own.</p>
              </div>
            </div>
            {messages.length === 0 && (
              <div className="ca-suggest">
                <span>Suggested questions</span>
                {QUESTIONS.map((q) => <button key={q.id} type="button" onClick={() => ask(q)}><Sparkles size={13} />{q.q}</button>)}
              </div>
            )}
            {messages.map((m, i) => (m.from === 'user' ? (
              <div key={i} className="ca-msg user"><div className="ca-bubble">{m.text}</div></div>
            ) : (
              <div key={i} className="ca-msg bot">
                <span className="ca-bot-icon"><Bot size={15} /></span>
                <div className="ca-bubble"><Answer a={m.answer} shown={m.shown} onAsk={(q) => ask(q)} onNavigate={() => setOpen(false)} /></div>
              </div>
            )))}
            {typing && (
              <div className="ca-msg bot"><span className="ca-bot-icon"><Bot size={15} /></span><div className="ca-bubble ca-typing" aria-label="Assistant is typing"><i /><i /><i /></div></div>
            )}
            {messages.length > 0 && !typing && (
              <div className="ca-more">
                {QUESTIONS.filter((q) => !asked.has(q.q)).slice(0, 3).map((q) => <button key={q.id} type="button" onClick={() => ask(q)}>{q.q}</button>)}
              </div>
            )}
          </div>

          <form className="ca-input" onSubmit={submit}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about inspections, risk, emergencies…" aria-label="Ask the assistant" maxLength={300} />
            <button type="submit" disabled={!input.trim() || typing} aria-label="Send"><Send size={16} /></button>
          </form>
        </section>
      )}
      <button type="button" className={`ca-fab${open ? ' open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close assistant' : 'Open asbestos assistant'} aria-expanded={open}>
        {open ? <X size={24} /> : <Sparkles size={24} />}
        {!open && <span className="ca-fab-label">Ask AI</span>}
      </button>
    </>
  )
}
