import { useState } from 'react'
import { Check, ChevronDown, Plus, Tag } from 'lucide-react'
import { useCategories } from '../lib/queries'
import { cn } from '../lib/cn'
import { useT } from '../i18n'
import { Sheet } from './ui/Sheet'
import { Button } from './ui/Button'
import { Input } from './ui/Form'

export type CategoryChoice = { id: number } | { name: string } | { clear: true }

export function CategoryPicker({ value, onPick }: { value: number | null; onPick: (c: CategoryChoice) => void }) {
  const t = useT()
  const cats = useCategories()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const current = cats.data?.items.find((c) => c.id === value)

  const pick = (c: CategoryChoice) => {
    setOpen(false)
    setName('')
    onPick(c)
  }
  const row = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-subtle'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium transition hover:border-brand/50 active:scale-95"
      >
        {current ? (
          <span className="size-2.5 rounded-full" style={{ background: current.color }} aria-hidden />
        ) : (
          <Tag className="size-3.5 text-faint" aria-hidden />
        )}
        {current?.name ?? t('cat.none')}
        <ChevronDown className="size-3.5 text-faint" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('cat.pick')}>
        <div className="space-y-1">
          {cats.data?.items.map((c) => (
            <button key={c.id} type="button" className={row} onClick={() => pick({ id: c.id })}>
              <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === value && <Check className="size-4 text-brand-text" aria-label={t('cat.selected')} />}
            </button>
          ))}
          <button type="button" className={cn(row, 'text-muted')} onClick={() => pick({ clear: true })}>
            <span className="size-3 rounded-full border border-dashed border-faint" aria-hidden />
            {t('cat.none')}
          </button>
        </div>
        <form
          className="mt-4 flex gap-2 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) pick({ name: name.trim() })
          }}
        >
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t('cat.newPlaceholder')} aria-label={t('cat.newPlaceholder')} />
          <Button type="submit" disabled={!name.trim()} icon={<Plus className="size-4" />}>
            {t('common.create')}
          </Button>
        </form>
      </Sheet>
    </>
  )
}
