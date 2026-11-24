import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useT } from '../i18n'

export function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const commit = () => {
    const v = draft.trim().toLowerCase().replace(/^#/, '')
    setDraft('')
    setAdding(false)
    if (v && !tags.includes(v)) onChange([...tags, v])
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-subtle ps-3 pe-1 text-[13px] text-muted">
          #{tag}
          <button
            type="button"
            aria-label={t('tags.remove', { tag })}
            onClick={() => onChange(tags.filter((x) => x !== tag))}
            className="flex size-6 items-center justify-center rounded-full hover:bg-line hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          maxLength={40}
          aria-label={t('tags.add')}
          placeholder={t('tags.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          className="h-8 w-32 rounded-full border border-brand bg-surface px-3 text-[13px] focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-line px-3 text-[13px] text-muted transition hover:border-brand hover:text-brand-text"
        >
          <Plus className="size-3.5" aria-hidden />
          {t('tags.add')}
        </button>
      )}
    </div>
  )
}
