import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { findNav } from './navItems'

/**
 * Breadcrumb of how the user got to this page within the browser tab, e.g. Inspections › Inspection
 * INS-2026-00084 · O&M Tasks › O&M Activity OM-2026-0273. A sidebar click starts a new trail (Sidebar passes
 * state.navRoot); following links extends it. A crumb goes back through history to that exact page (with its
 * tab and filters). Shown only for pages reached from Inspections (e.g. an inspection's O&M activity or air
 * sample), starting at the first inspection page.
 */

const STORAGE_KEY = 'nav-trail'
const MAX_CRUMBS = 5
const INSPECTION_TABS = { followUp: 'Follow-up Inspections', lab: 'Lab Results', om: 'O&M Tasks' }
const titleCase = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// A short name for a page from its URL
export function labelOf(pathname, search = '') {
  const q = new URLSearchParams(search)
  let m
  if ((m = pathname.match(/^\/inspections\/records\/([^/]+)/))) {
    return `Inspection ${decodeURIComponent(m[1])}${INSPECTION_TABS[q.get('tab')] ? ` · ${INSPECTION_TABS[q.get('tab')]}` : ''}`
  }
  if (pathname === '/inspections/new') return 'New Inspection'
  if ((m = pathname.match(/^\/operations\/activities\/([^/]+)/))) return m[1] === 'new' ? 'New O&M Activity' : `O&M Activity ${decodeURIComponent(m[1])}`
  if ((m = pathname.match(/^\/surveillance\/records\/([^/]+)/))) return `Surveillance ${decodeURIComponent(m[1])}`
  if ((m = pathname.match(/^\/air-monitoring\/events\/([^/]+)/))) return `Air Event ${decodeURIComponent(m[1])}`
  if (pathname === '/surveillance/new') return 'New Surveillance'
  if (/^\/schools\/[^/]+\/buildings\/[^/]+\/floors\/[^/]+/.test(pathname)) return 'Floor Plan & ACMs'
  if (/^\/schools\/(?!list|buildings|floors|rooms|acm-materials)[^/]+\/buildings\/[^/]+/.test(pathname)) return 'Building'
  if (/^\/schools\/(?!list|buildings|floors|rooms|acm-materials)[^/]+/.test(pathname)) return 'School'
  const nav = findNav(pathname)
  if (!nav) return titleCase(pathname.split('/').filter(Boolean)[0] ?? 'Home')
  if (nav.child) return nav.child.label
  // A module's own tab, e.g. /operations/activities → Operations & Maintenance · Activities
  const tab = pathname.slice(nav.item.path.length).split('/').filter(Boolean)[0]
  return tab ? `${nav.item.label} · ${titleCase(tab)}` : nav.item.label
}

function readTrail() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export default function NavTrail() {
  const location = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  const [view, setView] = useState({ trail: [], idx: 0 })

  // Each page visited is kept with its history position (idx), so a crumb can step back to it
  useEffect(() => {
    const idx = window.history.state?.idx ?? 0
    const here = { idx, pathname: location.pathname, search: location.search }
    let trail = readTrail()
    if (type === 'PUSH') trail = location.state?.navRoot ? [here] : [...trail.filter((e) => e.idx < idx), here]
    else if (trail.some((e) => e.idx === idx)) trail = trail.map((e) => (e.idx === idx ? here : e)) // replace, or back / forward
    else trail = [here] // reload of an unknown page, or back past a new trail
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trail))
    } catch {
      // storage unavailable — the trail only lasts until the page reloads
    }
    setView({ trail, idx })
  }, [location, type])

  // The pages up to this one (a later page stays available for "forward" but isn't shown) — only when the user
  // came here through Inspections, starting from the first inspection page
  const upToHere = view.trail.filter((e) => e.idx <= view.idx).sort((a, b) => a.idx - b.idx)
  const start = upToHere.slice(0, -1).findIndex((e) => e.pathname.startsWith('/inspections'))
  if (start < 0) return null
  const crumbs = upToHere.slice(start)
  if (crumbs.length < 2) return null
  const shown = crumbs.slice(-MAX_CRUMBS)
  return (
    <nav className="nav-trail" aria-label="Breadcrumb">
      <ol>
        {crumbs.length > shown.length && <li className="nav-trail-more" aria-hidden="true">…</li>}
        {shown.map((e, i) => {
          const last = i === shown.length - 1
          return (
            <li key={e.idx}>
              {i > 0 || crumbs.length > shown.length ? <ChevronRight size={13} aria-hidden="true" /> : null}
              {last
                ? <span aria-current="page">{labelOf(e.pathname, e.search)}</span>
                : <button type="button" onClick={() => navigate(e.idx - view.idx)}>{labelOf(e.pathname, e.search)}</button>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
