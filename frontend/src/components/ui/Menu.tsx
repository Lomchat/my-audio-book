import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from './Button'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect?: () => void
  href?: string
  danger?: boolean
  divider?: boolean
}

/** Popover menu with arrow-key navigation. */
export function Menu({
  items,
  label,
  trigger,
  align = 'end',
  up,
}: {
  items: MenuItem[]
  label: string
  trigger?: ReactNode
  align?: 'start' | 'end'
  up?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const els = [...(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
        const i = els.indexOf(document.activeElement as HTMLElement)
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemClass = (danger?: boolean) =>
    cn(
      'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition hover:bg-subtle focus:bg-subtle focus:outline-none',
      danger ? 'text-danger' : 'text-fg',
    )

  return (
    <div ref={root} className="relative">
      {trigger ? (
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full"
        >
          {trigger}
        </button>
      ) : (
        <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <MoreHorizontal className="size-5" />
        </IconButton>
      )}
      {open && (
        <div
          ref={list}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute z-40 min-w-52 animate-pop rounded-2xl border border-line bg-surface p-1.5 shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
            up ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {items.map((it, i) => (
            <div key={i}>
              {it.divider && <div className="my-1 h-px bg-line" />}
              {it.href ? (
                <a
                  role="menuitem"
                  href={it.href}
                  className={itemClass(it.danger)}
                  onClick={() => setOpen(false)}
                  download
                >
                  {it.icon}
                  {it.label}
                </a>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass(it.danger)}
                  onClick={() => {
                    setOpen(false)
                    it.onSelect?.()
                  }}
                >
                  {it.icon}
                  {it.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
