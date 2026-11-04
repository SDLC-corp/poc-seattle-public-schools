import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import './search-select.css'

// Searchable single-select.
// variant 'chip': compact filter chip with an inline label (dashboard filters).
// variant 'field': full-width form field; `label` is used for accessibility only.
// options: [{ value, label, meta? }] — `meta` is shown dimmed on the right and is searchable.
export default function SearchSelect({
  label,
  value,
  options,
  onChange,
  variant = 'chip',
  searchable = true,
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  wide = false,
  disabled = false,
  id,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value) ?? options[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.meta?.toLowerCase().includes(q))
  }, [options, query])

  const openMenu = () => {
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }
  const closeMenu = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }
  const choose = (option) => {
    if (!option) return
    onChange(option.value)
    closeMenu()
  }

  // Focus the search box (or the list) on open; close on outside click
  useEffect(() => {
    if (!open) return
    ;(inputRef.current ?? listRef.current)?.focus()
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) closeMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Keep the highlighted option in view
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const onKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(filtered.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(filtered.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        choose(filtered[active])
        break
      case 'Escape':
        e.preventDefault()
        closeMenu()
        break
      case 'Tab':
        closeMenu(false)
        break
      default:
    }
  }

  return (
    <div ref={rootRef} className={`search-select ss-${variant}${open ? ' open' : ''}${wide ? ' wide' : ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={variant === 'chip' ? 'filter-chip ss-trigger' : 'ss-trigger ss-field-trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={variant === 'field' ? `${label}: ${selected?.label ?? ''}` : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openMenu()
          }
        }}
      >
        {variant === 'chip' && <span className="filter-label">{label}</span>}
        <span className="ss-value">{selected?.label}</span>
        <ChevronDown size={14} className="ss-chevron" />
      </button>

      {open && (
        <div className="ss-popover">
          {searchable && (
            <div className="ss-search">
              <Search size={15} />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-label={`Search ${label}`}
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
              />
            </div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="ss-list"
            // Without a search box the list itself takes focus and handles the keys
            tabIndex={searchable ? undefined : -1}
            aria-activedescendant={!searchable && filtered[active] ? `${listId}-${active}` : undefined}
            onKeyDown={searchable ? undefined : onKeyDown}
          >
            {filtered.length === 0 && <li className="ss-empty">{emptyText}</li>}
            {filtered.map((o, i) => {
              const isSelected = o.value === value
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  className={`ss-option${i === active ? ' active' : ''}${isSelected ? ' selected' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
                  onClick={() => choose(o)}
                >
                  <span className="ss-check">{isSelected && <Check size={14} />}</span>
                  <span className="ss-label">{o.label}</span>
                  {o.meta && <span className="ss-meta">{o.meta}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
