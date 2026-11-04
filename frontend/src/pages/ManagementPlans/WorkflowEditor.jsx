import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, MarkerType, ConnectionMode,
  NodeResizer, addEdge, useNodesState, useEdgesState, useReactFlow, useConnection,
} from '@xyflow/react'
import {
  Search, FileSearch, FlaskConical, Microscope, BadgeCheck, Database, ClipboardCheck, ClipboardList, ShieldAlert, ShieldCheck, Cog,
  CalendarDays, Users, Siren, FileText, Network, BookOpen, RefreshCw, CircleCheck, TriangleAlert, ChartColumn, CircleDot, ListChecks,
  Save, RotateCcw, GripVertical, Trash2, Ban,
} from 'lucide-react'
import { request } from '../../lib/api'
import { useConfirm } from '../../components/ui/useConfirm'
import { timeAgo } from '../../lib/timeAgo'
import { TEMPLATE_NODES, TEMPLATE_EDGES, RISK_LEVELS, KEY_OUTPUTS } from './workflowTemplate'
import '@xyflow/react/dist/base.css'

// Unique ids for steps and arrows added in the editor
let seq = 0
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(seq += 1)}`

const ICONS = {
  search: Search, fileSearch: FileSearch, flask: FlaskConical, microscope: Microscope, badgeCheck: BadgeCheck, database: Database,
  clipboardCheck: ClipboardCheck, clipboardList: ClipboardList, shieldAlert: ShieldAlert, shieldCheck: ShieldCheck, cog: Cog,
  calendar: CalendarDays, users: Users, siren: Siren, fileText: FileText, network: Network, bookOpen: BookOpen, refresh: RefreshCw,
  circleCheck: CircleCheck, triangle: TriangleAlert, chart: ChartColumn, circleDot: CircleDot, listChecks: ListChecks,
}

// Palette: shapes from the legend, then the workflow modules
const SHAPES = [
  { kind: 'process', label: 'Activity / Process', w: 220, h: 74, icon: 'circleDot', sub: 'Task / action' },
  { kind: 'decision', label: 'Decision (Yes / No)', name: 'Decision?', w: 150, h: 100 },
  { kind: 'register', label: 'Register / Record', w: 180, h: 74, icon: 'database' },
  { kind: 'outcome', label: 'Outcome / Closure', w: 190, h: 74, icon: 'circleCheck' },
  { kind: 'control', label: 'Control Measure', w: 162, h: 84, icon: 'shieldCheck', tone: 'medium', sub: 'Describe the control' },
  { kind: 'level', label: 'Risk Level', name: 'Medium', w: 96, h: 30, tone: 'medium' },
  { kind: 'card', label: 'Checklist Card', w: 236, h: 140, icon: 'listChecks', items: ['First item', 'Second item'] },
  { kind: 'start', label: 'Start', name: 'START', w: 92, h: 38 },
  { kind: 'group', label: 'Group Area', name: 'Group', w: 320, h: 220 },
]
const MODULES = [
  { label: 'Surveys & Findings', icon: 'clipboardList' }, { label: 'Asbestos Register', icon: 'database' },
  { label: 'Risk Assessment', icon: 'triangle' }, { label: 'Control Measures', icon: 'shieldCheck' },
  { label: 'Monitoring & Schedule', icon: 'calendar' }, { label: 'Communication & Training', icon: 'users' },
  { label: 'Emergency Procedures', icon: 'siren' }, { label: 'Workflow & Approvals', icon: 'network' },
  { label: 'Management Plan', icon: 'fileText' }, { label: 'Reports & Compliance', icon: 'chart' },
].map((m) => ({ ...m, kind: 'process', w: 220, h: 64 }))
const PALETTE = [...SHAPES.map((s) => ({ ...s, key: `shape:${s.kind}` })), ...MODULES.map((m) => ({ ...m, key: `module:${m.label}` }))]

const TONES = ['high', 'medium', 'low']
const HAS_SUB = new Set(['process', 'register', 'outcome', 'control'])
const HAS_TONE = new Set(['level', 'control', 'card'])
const HAS_ICON = new Set(['process', 'register', 'outcome', 'control', 'card'])
const ICON_NAMES = {
  search: 'Search', fileSearch: 'File search', flask: 'Sampling', microscope: 'Laboratory', badgeCheck: 'Confirmed', database: 'Register',
  clipboardCheck: 'Assessment', clipboardList: 'Survey / plan', shieldAlert: 'Priority control', shieldCheck: 'Control', cog: 'Implement',
  calendar: 'Schedule', users: 'People / training', siren: 'Emergency', fileText: 'Document', network: 'Workflow', bookOpen: 'Management plan',
  refresh: 'Ongoing cycle', circleCheck: 'Complete', triangle: 'Risk', chart: 'Reports', circleDot: 'Activity', listChecks: 'Checklist',
}

const arrow = { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#1d3f63' }
// Small elbow offset so arrows between close steps don't fold back on themselves
const edgeStyle = { type: 'smoothstep', pathOptions: { offset: 8, borderRadius: 6 }, markerEnd: arrow, labelBgPadding: [5, 2], labelBgBorderRadius: 4 }
const toFlowNodes = (list) => list.map(({ id, x, y, w, h, ...data }) => ({
  id, type: 'wf', position: { x, y }, width: w, height: h, zIndex: data.kind === 'group' ? -1 : 0, data,
}))
const toFlowEdges = (list) => list.map((x) => ({ ...edgeStyle, ...x, animated: x.label === 'Repeat', className: x.label ? `wfe-edge-${x.label.toLowerCase()}` : undefined }))
const fromFlow = (nodes, edges) => ({
  nodes: nodes.map((n) => {
    const { kind, label, sub, items, icon, tone } = n.data
    return {
      id: n.id, kind, label, x: n.position.x, y: n.position.y, w: n.width ?? n.measured?.width ?? 120, h: n.height ?? n.measured?.height ?? 60,
      ...(sub ? { sub } : {}), ...(items?.length ? { items } : {}), ...(icon ? { icon } : {}), ...(tone ? { tone } : {}),
    }
  }),
  edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({ id, source, target, sourceHandle, targetHandle, ...(label ? { label } : {}) })),
})

const SIDES = { t: Position.Top, b: Position.Bottom, l: Position.Left, r: Position.Right }

// Clicking text on a step selects it and puts the caret where it was clicked (once the text turns editable)
function focusTextAt(x, y) {
  requestAnimationFrame(() => {
    const el = document.elementFromPoint(x, y)?.closest('[data-edit]')
    if (!el) return
    el.focus()
    const range = document.caretRangeFromPoint?.(x, y)
    if (range) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  })
}

// Text on a step, editable in place once the step is selected (Enter / click away saves, Esc cancels)
function EditableText({ as: Tag = 'span', value, editing, multiline = false, max = 80, placeholder, onCommit, className }) {
  const commit = (el) => {
    const next = el.innerText.replace(/\s*\n\s*/g, multiline ? '\n' : ' ').trim().slice(0, max)
    if (next !== value) onCommit(next)
    else el.innerText = value ?? ''
  }
  if (!editing) return <Tag className={className}>{value}</Tag>
  return (
    <Tag
      key={value} className={`${className ?? ''} wfe-editable nodrag nopan`} data-edit="" data-placeholder={placeholder}
      contentEditable="plaintext-only" suppressContentEditableWarning spellCheck
      onBlur={(ev) => commit(ev.currentTarget)}
      onKeyDown={(ev) => {
        ev.stopPropagation()
        if (ev.key === 'Enter' && !(multiline && ev.shiftKey)) { ev.preventDefault(); ev.currentTarget.blur() }
        if (ev.key === 'Escape') { ev.currentTarget.innerText = value ?? ''; ev.currentTarget.blur() }
      }}
    >{value}</Tag>
  )
}

function WfNode({ id, data, selected }) {
  const { updateNodeData } = useReactFlow()
  const Icon = ICONS[data.icon]
  const tone = data.tone ? ` tone-${data.tone}` : ''
  // While an arrow is being dragged, the whole step is a drop target (the side is picked in onConnect)
  const dropTarget = useConnection((c) => c.inProgress && c.fromNode?.id !== id)
  const title = (className) => (
    <EditableText value={data.label} editing={selected} max={80} placeholder="Name" className={className}
      onCommit={(label) => updateNodeData(id, { label: label || data.label })} />
  )
  const setItem = (i, text) => {
    const items = [...(data.items ?? [])]
    if (text) items[i] = text
    else items.splice(i, 1)
    updateNodeData(id, { items })
  }
  return (
    <>
      <NodeResizer isVisible={selected} minWidth={40} minHeight={26} lineClassName="wfe-resize-line" handleClassName="wfe-resize-handle" />
      {data.kind !== 'group' && Object.entries(SIDES).map(([h, pos]) => [
        <Handle key={`t${h}`} id={h} type="target" position={pos} />,
        <Handle key={`s${h}`} id={h} type="source" position={pos} />,
      ])}
      {data.kind !== 'group' && dropTarget && <Handle id="any" type="target" position={Position.Top} className="wfe-drop" isConnectableStart={false} />}
      {data.kind === 'decision' ? (
        <div className="wfe-node wfe-decision">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1 99,50 50,99 1,50" /></svg>
          {title('wfe-decision-text')}
        </div>
      ) : data.kind === 'start' || data.kind === 'level' ? (
        <div className={`wfe-node wfe-${data.kind}${tone}`}>{title()}</div>
      ) : data.kind === 'group' ? (
        <div className="wfe-node wfe-group">{title()}</div>
      ) : data.kind === 'card' ? (
        <div className={`wfe-node wfe-card${tone}`}>
          <strong>{Icon && <Icon size={17} />}{title()}</strong>
          <ul>
            {(data.items ?? []).map((it, i) => (
              <li key={`${i}-${it}`}><CircleCheck size={13} />
                <EditableText value={it} editing={selected} max={140} onCommit={(text) => setItem(i, text)} />
              </li>
            ))}
            {selected && (
              <li className="wfe-add-item"><CircleCheck size={13} />
                <EditableText value="" editing max={140} placeholder="Add item…" onCommit={(text) => text && setItem((data.items ?? []).length, text)} />
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className={`wfe-node wfe-box wfe-${data.kind}${tone}`}>
          {Icon && <Icon size={data.kind === 'control' ? 18 : 24} className="wfe-icon" />}
          <span className="wfe-text">
            {title('wfe-title')}
            {(data.sub || selected) && (
              <EditableText as="small" value={data.sub ?? ''} editing={selected} multiline max={240} placeholder="Add a description…"
                onCommit={(sub) => updateNodeData(id, { sub: sub || undefined })} />
            )}
          </span>
        </div>
      )}
    </>
  )
}
const nodeTypes = { wf: WfNode }

// Edit panel for the selected step or arrow
function Inspector({ node, edge, onNode, onEdge, onDelete }) {
  if (edge) {
    return (
      <div className="wfe-inspector">
        <strong>Arrow</strong>
        <label>Label<input value={edge.label ?? ''} maxLength={40} placeholder="e.g. YES / NO" onChange={(ev) => onEdge({ label: ev.target.value })} /></label>
        <button type="button" className="u-btn u-btn-ghost" onClick={onDelete}><Trash2 size={14} />Remove arrow</button>
      </div>
    )
  }
  const d = node.data
  return (
    <div className="wfe-inspector">
      <strong>Edit step</strong>
      <label>Name<input value={d.label} maxLength={80} onChange={(ev) => onNode({ label: ev.target.value })} /></label>
      <label>Shape
        <select value={d.kind} onChange={(ev) => {
          const kind = ev.target.value
          onNode({ kind, ...((kind === 'level' || kind === 'control') && !d.tone ? { tone: 'medium' } : {}) })
        }}>
          {SHAPES.map((s) => <option key={s.kind} value={s.kind}>{s.label}</option>)}
        </select>
      </label>
      {HAS_ICON.has(d.kind) && (
        <div className="wfe-field">
          <span>Icon</span>
          <div className="wfe-icons" role="radiogroup" aria-label="Icon">
            <button type="button" role="radio" aria-checked={!d.icon} className={!d.icon ? 'on' : undefined} title="No icon" onClick={() => onNode({ icon: undefined })}><Ban size={15} /></button>
            {Object.entries(ICONS).map(([key, Icon]) => (
              <button key={key} type="button" role="radio" aria-checked={d.icon === key} className={d.icon === key ? 'on' : undefined}
                title={ICON_NAMES[key]} aria-label={ICON_NAMES[key]} onClick={() => onNode({ icon: key })}><Icon size={15} /></button>
            ))}
          </div>
        </div>
      )}
      {HAS_SUB.has(d.kind) && (
        <label>Description<textarea rows={3} maxLength={200} value={d.sub ?? ''} onChange={(ev) => onNode({ sub: ev.target.value })} /></label>
      )}
      {d.kind === 'card' && (
        <label>Checklist <small>(one per line)</small>
          <textarea rows={5} value={(d.items ?? []).join('\n')} onChange={(ev) => onNode({ items: ev.target.value.split('\n').slice(0, 10) })} />
        </label>
      )}
      {HAS_TONE.has(d.kind) && (
        <label>Risk tone
          <select value={d.tone ?? ''} onChange={(ev) => onNode({ tone: ev.target.value || undefined })}>
            {d.kind === 'card' && <option value="">None</option>}
            {TONES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </label>
      )}
      <button type="button" className="u-btn u-btn-ghost" onClick={onDelete}><Trash2 size={14} />Remove step</button>
    </div>
  )
}

function Editor({ schoolId }) {
  const { screenToFlowPosition, fitView } = useReactFlow()
  const [confirm, confirmDialog] = useConfirm()
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(TEMPLATE_NODES))
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(TEMPLATE_EDGES))
  const [saved, setSaved] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refit = useCallback(() => requestAnimationFrame(() => fitView({ padding: 0.04, duration: 200 })), [fitView])
  const apply = useCallback((wf) => {
    setNodes(toFlowNodes(wf?.nodes ?? TEMPLATE_NODES))
    setEdges(toFlowEdges(wf?.edges ?? TEMPLATE_EDGES))
    setSaved(wf ? { updatedAt: wf.updatedAt, updatedBy: wf.updatedBy } : null)
    setDirty(false)
    refit()
  }, [setNodes, setEdges, refit])

  useEffect(() => {
    request(`/management-plans/${schoolId}/workflow`).then((wf) => { if (wf) apply(wf) }).catch(() => {})
  }, [schoolId, apply])

  const onNodes = (changes) => {
    onNodesChange(changes)
    if (changes.some((c) => c.type === 'position' || c.type === 'remove' || c.type === 'replace' || (c.type === 'dimensions' && c.resizing))) setDirty(true)
  }
  const onEdges = (changes) => {
    onEdgesChange(changes)
    if (changes.some((c) => c.type === 'remove')) setDirty(true)
  }
  const onConnect = (conn) => {
    if (conn.source === conn.target) return
    let { targetHandle } = conn
    if (targetHandle === 'any') {
      // Dropped on the step itself: attach to the side facing the arrow's start
      const centre = (nid) => { const n = nodes.find((x) => x.id === nid); return { x: n.position.x + (n.width ?? 0) / 2, y: n.position.y + (n.height ?? 0) / 2 } }
      const s = centre(conn.source)
      const t = centre(conn.target)
      const dx = t.x - s.x
      const dy = t.y - s.y
      targetHandle = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'l' : 'r') : (dy > 0 ? 't' : 'b')
    }
    setEdges((eds) => addEdge({ ...edgeStyle, ...conn, targetHandle, id: newId(`${conn.source}-${conn.target}`) }, eds))
    setDirty(true)
  }

  const add = (tpl, position) => {
    const id = newId(tpl.kind)
    const at = position ?? (() => {
      const maxY = Math.max(0, ...nodes.map((n) => n.position.y + (n.height ?? 60)))
      return { x: 0, y: maxY + 40 }
    })()
    const node = {
      id, kind: tpl.kind, label: tpl.name ?? tpl.label, x: at.x, y: at.y, w: tpl.w, h: tpl.h,
      ...(tpl.icon ? { icon: tpl.icon } : {}), ...(tpl.sub ? { sub: tpl.sub } : {}), ...(tpl.items ? { items: tpl.items } : {}), ...(tpl.tone ? { tone: tpl.tone } : {}),
    }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...toFlowNodes([node])[0], selected: true }])
    setDirty(true)
    if (!position) refit()
  }
  const onDrop = (ev) => {
    ev.preventDefault()
    const tpl = PALETTE.find((p) => p.key === ev.dataTransfer.getData('application/x-plan-step'))
    if (!tpl) return
    const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    add(tpl, { x: p.x - tpl.w / 2, y: p.y - tpl.h / 2 })
  }

  const selNodes = nodes.filter((n) => n.selected)
  const selEdges = edges.filter((x) => x.selected)
  const node = selNodes.length === 1 && !selEdges.length ? selNodes[0] : null
  const edge = selEdges.length === 1 && !selNodes.length ? selEdges[0] : null
  const patchNode = (patch) => {
    setNodes((ns) => ns.map((n) => {
      if (n.id !== node.id) return n
      const data = { ...n.data, ...patch }
      return { ...n, data, zIndex: data.kind === 'group' ? -1 : 0 }
    }))
    setDirty(true)
  }
  const patchEdge = (patch) => {
    setEdges((es) => es.map((x) => (x.id === edge.id ? { ...x, ...patch, className: patch.label ? `wfe-edge-${patch.label.toLowerCase()}` : undefined } : x)))
    setDirty(true)
  }
  const removeSelected = () => {
    if (node) {
      setNodes((ns) => ns.filter((n) => n.id !== node.id))
      setEdges((es) => es.filter((x) => x.source !== node.id && x.target !== node.id))
    } else if (edge) setEdges((es) => es.filter((x) => x.id !== edge.id))
    setDirty(true)
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = fromFlow(nodes, edges)
      body.nodes.forEach((n) => { n.label = n.label.trim() || 'Untitled'; if (n.items) n.items = n.items.map((i) => i.trim()).filter(Boolean) })
      const wf = await request(`/management-plans/${schoolId}/workflow`, { method: 'PUT', body })
      setSaved({ updatedAt: wf.updatedAt, updatedBy: wf.updatedBy })
      setDirty(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const reset = async () => {
    if (!(await confirm({ title: 'Reset the workflow?', message: 'Your changes will be replaced by the standard end-to-end asbestos management workflow.', confirmLabel: 'Reset', tone: 'danger' }))) return
    setBusy(true)
    setError(null)
    try {
      if (saved) await request(`/management-plans/${schoolId}/workflow`, { method: 'DELETE' })
      apply(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const chip = (p) => {
    const Icon = ICONS[p.icon]
    return (
      <button key={p.key} type="button" draggable className={`wfe-chip k-${p.kind}${p.tone ? ` tone-${p.tone}` : ''}`}
        onDragStart={(ev) => { ev.dataTransfer.setData('application/x-plan-step', p.key); ev.dataTransfer.effectAllowed = 'move' }}
        onClick={() => add(p)} title="Drag onto the canvas, or click to add">
        <GripVertical size={13} className="wfe-grip" />
        <span className={`wfe-swatch k-${p.kind}`}>{Icon && <Icon size={14} />}</span>{p.label}
      </button>
    )
  }

  return (
    <div className="wfe">
      <div className="mp-wf-toolbar">
        <span className="mp-wf-status">
          {dirty ? <strong>Unsaved changes</strong>
            : saved ? <>Saved {timeAgo(saved.updatedAt)}{saved.updatedBy && <> by {saved.updatedBy}</>}</>
              : 'Standard end-to-end workflow'}
          {error && <span className="mp-wf-error"> · {error}</span>}
        </span>
        <button type="button" className="u-btn u-btn-outline" onClick={reset} disabled={busy || (!saved && !dirty)}><RotateCcw size={15} />Reset</button>
        <button type="button" className="u-btn u-btn-primary" onClick={save} disabled={busy || !dirty}><Save size={15} />{busy ? 'Saving…' : 'Save Workflow'}</button>
      </div>

      <div className="wfe-body">
        <aside className="wfe-side" aria-label="Steps you can add">
          {(node || edge) && <Inspector node={node} edge={edge} onNode={patchNode} onEdge={patchEdge} onDelete={removeSelected} />}
          <div className="wfe-palette">
            <strong>Shapes</strong>
            <small>Drag onto the canvas, or click to add</small>
            {PALETTE.filter((p) => p.key.startsWith('shape:')).map(chip)}
            <strong className="wfe-palette-sub">Workflow Modules</strong>
            {PALETTE.filter((p) => p.key.startsWith('module:')).map(chip)}
          </div>
        </aside>

        <div className="wfe-canvas" role="figure" aria-label="Asbestos management end-to-end workflow diagram"
          onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move' }} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodes} onEdgesChange={onEdges} onConnect={onConnect}
            connectionMode={ConnectionMode.Loose} connectionLineType="smoothstep" connectionRadius={48} defaultEdgeOptions={edgeStyle}
            fitView fitViewOptions={{ padding: 0.04 }} minZoom={0.25} maxZoom={2}
            zoomOnScroll={false} preventScrolling={false} zoomOnDoubleClick={false}
            deleteKeyCode={['Backspace', 'Delete']}
            onNodeClick={(ev) => focusTextAt(ev.clientX, ev.clientY)}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="#c3d0dc" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable position="bottom-right" nodeStrokeWidth={2} nodeColor={(n) => MINIMAP[n.data.kind] ?? '#c8d6e5'} maskColor="rgba(240, 245, 250, 0.7)" />
          </ReactFlow>
        </div>
      </div>
      <p className="mp-wf-help">Drag steps to move them · select a step to edit or resize it · drag from a dot on a step's edge and drop on another step to connect · select an arrow to label it (YES / NO) · Delete removes the selection</p>

      <div className="wfe-info">
        <section className="wfe-info-card">
          <h4>Legend</h4>
          <ul className="wfe-legend">
            <li><span className="wfe-swatch k-decision" />Decision (Yes / No)</li>
            <li><span className="wfe-swatch k-process" />Activity / Process <small>(task / action)</small></li>
            <li><span className="wfe-swatch k-register" />Register / Record <small>(create / update / maintain)</small></li>
            <li><span className="wfe-swatch k-outcome" />Outcome / Closure <small>(complete / compliant)</small></li>
            <li><span className="wfe-legend-arrow" />Process flow</li>
            <li><RefreshCw size={16} className="wfe-legend-cycle" />Ongoing / repeat cycle</li>
          </ul>
        </section>
        <section className="wfe-info-card">
          <h4>Risk Level (Example)</h4>
          <ul className="wfe-risk">
            {RISK_LEVELS.map((r) => <li key={r.tone}><span className={`wfe-dot tone-${r.tone}`} /><span><strong>{r.label}</strong> – {r.text}</span></li>)}
          </ul>
        </section>
        <section className="wfe-info-card">
          <h4>Key Outputs</h4>
          <ul className="wfe-outputs">{KEY_OUTPUTS.map((o) => <li key={o}><CircleCheck size={15} />{o}</li>)}</ul>
        </section>
      </div>
      {confirmDialog}
    </div>
  )
}
const MINIMAP = { process: '#bcd7f0', decision: '#0f4c8a', register: '#d9d2f5', outcome: '#c9e9c6', start: '#0f3a66', group: '#eef0fb', card: '#dfe9f5', control: '#f3d9b8', level: '#f0c8c3' }

export default function WorkflowEditor({ schoolId }) {
  return (
    <ReactFlowProvider>
      <Editor schoolId={schoolId} />
    </ReactFlowProvider>
  )
}
