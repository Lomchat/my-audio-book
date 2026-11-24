import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />
}

export function ProgressBar({
  value,
  indeterminate,
  animated,
  label,
  className,
}: {
  value?: number
  indeterminate?: boolean
  animated?: boolean
  label?: string
  className?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-subtle', className)}
    >
      <div
        className={cn(
          'bg-brand-gradient h-full rounded-full transition-[width] duration-500',
          indeterminate && 'w-1/3 animate-pulse',
          animated &&
            'bg-[length:28px_28px] [background-image:repeating-linear-gradient(135deg,rgb(255_255_255/.22)_0_8px,transparent_8px_16px),linear-gradient(#c7421f,#c7421f)] animate-stripes',
        )}
        style={indeterminate ? undefined : { width: `${Math.max(pct, 3)}%` }}
      />
    </div>
  )
}

export function Chip({
  children,
  color,
  active,
  onClick,
  className,
  title,
}: {
  children: ReactNode
  color?: string
  active?: boolean
  onClick?: () => void
  className?: string
  title?: string
}) {
  const cls = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
    active ? 'border-transparent bg-brand-gradient text-white' : 'border-line bg-surface text-muted',
    onClick && 'min-h-8 cursor-pointer transition active:scale-95 hover:border-brand/50 px-3 text-[13px]',
    className,
  )
  const inner = (
    <>
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{children}</span>
    </>
  )
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-pressed={active} title={title}>
      {inner}
    </button>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode
  title: string
  text?: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-sm animate-fade flex-col items-center px-4 py-14 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
        {icon}
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {text && <p className="mt-1.5 text-sm text-muted">{text}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

const AVATAR_COLORS = ['#c7421f', '#1f6f78', '#8f5b0e', '#5c6b1f', '#2f5d8a', '#9c2f52', '#14284b']

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  const color = AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length]
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return <img src="/icon.svg?v=2" width={size} height={size} alt="" className="shrink-0 rounded-[22%]" />
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>{children}</div>
}
