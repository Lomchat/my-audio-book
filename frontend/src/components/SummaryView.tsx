import { useState } from 'react'
import { Check, ListChecks, Lightbulb, RefreshCw } from 'lucide-react'
import type { RecordingDetail } from '../lib/types'
import { cn } from '../lib/cn'
import { useT } from '../i18n'
import { Button } from './ui/Button'
import { Card } from './ui/Misc'

function ActionItems({ id, items, dir }: { id: number; items: string[]; dir: 'rtl' | 'auto' }) {
  const key = `mab.todo.${id}`
  const [done, setDone] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]') as number[]
    } catch {
      return []
    }
  })
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i]
    setDone(next)
    localStorage.setItem(key, JSON.stringify(next))
  }
  return (
    <ul dir={dir} className="space-y-1">
      {items.map((item, i) => {
        const checked = done.includes(i)
        return (
          <li key={i}>
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(i)}
              className="flex min-h-11 w-full items-start gap-3 rounded-xl px-2 py-2.5 text-start transition hover:bg-subtle"
            >
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition',
                  checked ? 'border-transparent bg-brand text-white' : 'border-faint/60',
                )}
              >
                {checked && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className={cn('text-[15px]', checked && 'text-faint line-through')}>{item}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function SummaryView({
  rec,
  dir,
  onResummarize,
  resummarizing,
  llmEnabled,
}: {
  rec: RecordingDetail
  dir: 'rtl' | 'auto'
  onResummarize: () => void
  resummarizing: boolean
  llmEnabled: boolean
}) {
  const t = useT()
  const status = rec.summary_status
  const regen = llmEnabled && (status === 'error' || status === 'ok' || status === 'empty')

  if (status === 'disabled' || (!llmEnabled && !rec.summary)) {
    return <p className="rounded-2xl bg-subtle p-5 text-sm text-muted">{t('sum.disabled')}</p>
  }
  if (status === 'error') {
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5">
        <p className="text-sm text-danger">{t('sum.error')}</p>
        {regen && (
          <Button className="mt-3" variant="secondary" size="sm" loading={resummarizing} icon={<RefreshCw className="size-3.5" />} onClick={onResummarize}>
            {t('sum.regenerate')}
          </Button>
        )}
      </div>
    )
  }
  if (status === 'empty' || (!rec.summary && !rec.key_points.length && !rec.action_items.length)) {
    return <p className="rounded-2xl bg-subtle p-5 text-sm text-muted">{t('sum.empty')}</p>
  }

  return (
    <div className="space-y-5">
      {rec.summary && (
        <p dir={dir} className="text-[16px] leading-relaxed whitespace-pre-line">
          {rec.summary}
        </p>
      )}
      {rec.key_points.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-brand-text" aria-hidden />
            {t('sum.keyPoints')}
          </h3>
          <ul dir={dir} className="space-y-2.5">
            {rec.key_points.map((p, i) => (
              <li key={i} className="flex gap-3 text-[15px]">
                <span className="bg-brand-gradient mt-2 size-1.5 shrink-0 rounded-full" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {rec.action_items.length > 0 && (
        <Card className="p-3 sm:p-4">
          <h3 className="mb-1 flex items-center gap-2 px-2 pt-1 text-sm font-semibold">
            <ListChecks className="size-4 text-brand-text" aria-hidden />
            {t('sum.actions')}
          </h3>
          <ActionItems id={rec.id} items={rec.action_items} dir={dir} />
        </Card>
      )}
      {regen && (
        <Button variant="ghost" size="sm" loading={resummarizing} icon={<RefreshCw className="size-3.5" />} onClick={onResummarize}>
          {t('sum.regenerate')}
        </Button>
      )}
    </div>
  )
}
