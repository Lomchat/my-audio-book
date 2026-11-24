import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Folder, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { del, patch, post } from '../lib/api'
import { useCategories } from '../lib/queries'
import type { Category } from '../lib/types'
import { cn } from '../lib/cn'
import { errorMessage, useT } from '../i18n'
import { Button, IconButton } from '../components/ui/Button'
import { Input } from '../components/ui/Form'
import { Card, EmptyState, Skeleton } from '../components/ui/Misc'
import { ConfirmDialog, Sheet } from '../components/ui/Sheet'
import { useToast } from '../components/ui/Toast'

export const PALETTE = [
  '#1f6f78', '#c7421f', '#8f5b0e', '#5c6b1f', '#2f5d8a', '#9c2f52',
  '#2e7d6b', '#b87700', '#a8432a', '#4f7a28', '#3d6a9e', '#7a5a2e',
]

export function Categories() {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const cats = useCategories()
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [newName, setNewName] = useState('')

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['categories'] })
    void qc.invalidateQueries({ queryKey: ['recordings'] })
  }
  const onError = (e: unknown) => toast.error(errorMessage(e, t))

  const create = useMutation({
    mutationFn: (name: string) => post('/api/categories', { name }),
    onSuccess: () => {
      setNewName('')
      refresh()
    },
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; color?: string }) =>
      patch<{ merged_into?: number }>(`/api/categories/${id}`, body),
    onSuccess: (res) => {
      if (res.merged_into) toast.success(t('cat.merged'))
      setEditing(null)
      refresh()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: number) => del(`/api/categories/${id}`),
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
    onError,
  })

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t('nav.categories')}</h1>
      <p className="mb-5 text-sm text-muted">{t('cat.intro')}</p>

      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim()) create.mutate(newName.trim())
        }}
      >
        <Input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder={t('cat.newPlaceholder')} aria-label={t('cat.newPlaceholder')} />
        <Button type="submit" loading={create.isPending} disabled={!newName.trim()} icon={<Plus className="size-4" />}>
          {t('common.create')}
        </Button>
      </form>

      {cats.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : !cats.data?.items.length ? (
        <EmptyState icon={<Folder className="size-7" />} title={t('cat.emptyTitle')} text={t('cat.emptyText')} />
      ) : (
        <Card className="divide-y divide-line">
          {cats.data.items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2">
              <span className="size-4 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-muted tnum">{t('cat.count', { n: c.count })}</p>
              </div>
              <IconButton label={t('cat.edit')} onClick={() => setEditing(c)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label={t('common.delete')} onClick={() => setDeleting(c)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
        </Card>
      )}

      {editing && <EditSheet key={editing.id} cat={editing} busy={update.isPending} onClose={() => setEditing(null)} onSave={(b) => update.mutate({ id: editing.id, ...b })} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('cat.deleteTitle', { name: deleting?.name ?? '' })}
        text={t('cat.deleteText')}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  )
}

function EditSheet({
  cat,
  busy,
  onClose,
  onSave,
}: {
  cat: Category
  busy: boolean
  onClose: () => void
  onSave: (b: { name?: string; color?: string }) => void
}) {
  const t = useT()
  const [name, setName] = useState(cat.name)
  const [color, setColor] = useState(cat.color)
  return (
    <Sheet open onClose={onClose} title={t('cat.edit')}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          onSave({ name: name.trim() !== cat.name ? name.trim() : undefined, color: color !== cat.color ? color : undefined })
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="cat-name" className="text-sm font-medium">
            {t('cat.name')}
          </label>
          <Input id="cat-name" data-autofocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <p className="text-xs text-muted">{t('cat.mergeHint')}</p>
        </div>
        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Palette className="size-4" aria-hidden />
            {t('cat.color')}
          </legend>
          <div className="grid grid-cols-6 gap-2.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full text-white transition active:scale-90',
                  color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-surface',
                )}
                style={{ background: c }}
              >
                {color === c && <Check className="size-5" />}
              </button>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="w-full" loading={busy} disabled={!name.trim()}>
          {t('common.save')}
        </Button>
      </form>
    </Sheet>
  )
}
