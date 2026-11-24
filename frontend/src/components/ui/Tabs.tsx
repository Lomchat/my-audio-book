import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

/** Accessible tab list; render panels yourself with `tabPanelProps`. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabDef<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  const base = useId()
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.id === value)
    if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id)
    if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id)
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-1 border-b border-line">
      {tabs.map((tab) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            id={`${base}-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative inline-flex min-h-11 items-center gap-2 px-3.5 text-sm font-medium transition',
              selected ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {tab.icon}
            {tab.label}
            {selected && <span className="bg-brand-gradient absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </button>
        )
      })}
    </div>
  )
}
