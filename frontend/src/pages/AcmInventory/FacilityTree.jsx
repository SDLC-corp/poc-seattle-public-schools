import { useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Building2, Layers } from 'lucide-react'

// Facility → building → floor; picking a node sets the location filters. Counts are ACM (present or assumed) and
// follow the other filters; the tooltip adds every material recorded there, "No ACM" findings included.
const countTitle = (x, filtered) => (filtered ? `Matching records: ${x.count}` : `ACM (present or assumed): ${x.count} · materials recorded: ${x.records ?? x.count}`)
export default function FacilityTree({ tree, filters, onPick }) {
  const filtered = Boolean(filters.status)
  const [open, setOpen] = useState(() => new Set([filters.school, filters.building].filter(Boolean)))
  const [query, setQuery] = useState('')
  // Whatever is selected from elsewhere (filters, a summary row) is always expanded
  const isOpen = (id) => open.has(id) || id === filters.school || id === filters.building
  const toggle = (id) => setOpen((s) => {
    const next = new Set(s)
    if (isOpen(id)) next.delete(id); else next.add(id)
    return next
  })

  const term = query.trim().toLowerCase()
  const shown = tree?.filter((s) => !term || s.name.toLowerCase().includes(term)) ?? []
  const allSelected = !filters.school

  return (
    <aside className="u-card ai-tree" aria-label="Facility hierarchy">
      <h2>Facility Hierarchy</h2>
      <input type="search" className="u-input ai-tree-search" placeholder="Find a facility…" value={query}
        onChange={(e) => setQuery(e.target.value)} aria-label="Find a facility" />
      <ul role="tree" className="ai-tree-list">
        <li role="treeitem" aria-selected={allSelected}>
          <button type="button" className={`ai-node lvl-0${allSelected ? ' selected' : ''}`} onClick={() => onPick({})}>
            <span className="ai-caret" />
            <Layers size={15} /><span className="ai-node-name">All Facilities</span>
            <span className="ai-count" title={tree ? countTitle({ count: tree.reduce((n, s) => n + s.count, 0), records: tree.reduce((n, s) => n + (s.records ?? s.count), 0) }, filtered) : undefined}>{tree?.reduce((n, s) => n + s.count, 0) ?? ''}</span>
          </button>
        </li>
        {shown.map((s) => {
          const sOpen = isOpen(s.id)
          const sSel = filters.school === s.id && !filters.building
          return (
            <li key={s.id} role="treeitem" aria-expanded={sOpen} aria-selected={sSel}>
              <div className={`ai-node lvl-0${sSel ? ' selected' : ''}`}>
                <button type="button" className="ai-caret" onClick={() => toggle(s.id)} aria-label={`${sOpen ? 'Collapse' : 'Expand'} ${s.name}`}>
                  <ChevronRight size={14} className={sOpen ? 'open' : ''} />
                </button>
                <button type="button" className="ai-node-pick" onClick={() => { onPick({ school: s.id }); if (!sOpen) toggle(s.id) }}>
                  {sOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                  <span className="ai-node-name" title={s.name}>{s.name}</span>
                  <span className="ai-count" title={countTitle(s, filtered)}>{s.count}</span>
                </button>
              </div>
              {sOpen && (
                <ul role="group">
                  {s.buildings.map((b) => {
                    const bOpen = isOpen(b.id)
                    const bSel = filters.building === b.id && !filters.floor
                    return (
                      <li key={b.id} role="treeitem" aria-expanded={bOpen} aria-selected={bSel}>
                        <div className={`ai-node lvl-1${bSel ? ' selected' : ''}`}>
                          <button type="button" className="ai-caret" onClick={() => toggle(b.id)} aria-label={`${bOpen ? 'Collapse' : 'Expand'} ${b.name}`}>
                            <ChevronRight size={14} className={bOpen ? 'open' : ''} />
                          </button>
                          <button type="button" className="ai-node-pick" onClick={() => { onPick({ school: s.id, building: b.id }); if (!bOpen) toggle(b.id) }}>
                            <Building2 size={15} />
                            <span className="ai-node-name" title={b.name}>{b.name}</span>
                            <span className="ai-count" title={countTitle(b, filtered)}>{b.count}</span>
                          </button>
                        </div>
                        {bOpen && (
                          <ul role="group">
                            {b.floors.map((f) => {
                              const fSel = filters.floor === f.id
                              return (
                                <li key={f.id} role="treeitem" aria-selected={fSel}>
                                  <button type="button" className={`ai-node lvl-2${fSel ? ' selected' : ''}`}
                                    onClick={() => onPick({ school: s.id, building: b.id, floor: f.id })}>
                                    <Layers size={14} />
                                    <span className="ai-node-name" title={f.name}>{f.name}</span>
                                    <span className="ai-count" title={countTitle(f, filtered)}>{f.count}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
        {tree && !shown.length && <li className="u-muted ai-tree-empty">No facilities match.</li>}
      </ul>
    </aside>
  )
}
