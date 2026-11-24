import { Link } from 'react-router'
import { AlertTriangle, Clock, RotateCcw, Star, Users } from 'lucide-react'
import { cn } from '../lib/cn'
import { fmtClock, fmtTime, LANG_BADGE, recDate } from '../lib/format'
import type { Category, Recording } from '../lib/types'
import { useLang, useT, type Key } from '../i18n'
import { Chip, ProgressBar } from './ui/Misc'
import { Button } from './ui/Button'

export function StageProgress({ r, large }: { r: Recording; large?: boolean }) {
  const t = useT()
  if (r.status === 'queued' || r.status === 'uploading') {
    return (
      <div className="space-y-1.5">
        <ProgressBar indeterminate label={t('status.queued')} />
        <p className={cn('flex items-center gap-1.5 text-muted', large ? 'text-sm' : 'text-xs')}>
          <Clock className="size-3.5" aria-hidden />
          {r.queue_position ? t('status.queuePosition', { n: r.queue_position }) : t('status.queued')}
        </p>
      </div>
    )
  }
  const stage = r.stage ?? 'preparing'
  return (
    <div className="space-y-1.5">
      <ProgressBar value={r.stage === 'summarizing' || r.stage === 'diarizing' ? undefined : r.progress} indeterminate={r.stage === 'summarizing' || r.stage === 'diarizing'} animated label={t(`stage.${stage}` as Key)} />
      <p className={cn('text-muted tnum', large ? 'text-sm' : 'text-xs')}>
        {t(`stage.${stage}` as Key)}
        {stage === 'transcribing' && r.progress > 0 && ` · ${Math.round(r.progress * 100)}%`}
      </p>
    </div>
  )
}

export function RecordingCard({
  rec,
  category,
  onFavorite,
  onRetry,
  retrying,
}: {
  rec: Recording
  category?: Category
  onFavorite: (r: Recording) => void
  onRetry: (r: Recording) => void
  retrying?: boolean
}) {
  const t = useT()
  const lang = useLang()
  const processing = rec.status === 'queued' || rec.status === 'processing' || rec.status === 'uploading'
  const failed = rec.status === 'error'
  const title = rec.title || (processing ? t('rec.untitledProcessing') : t('rec.untitled'))

  return (
    <article
      className={cn(
        'group relative rounded-2xl border bg-surface p-4 shadow-card transition duration-150 hover:-translate-y-px hover:border-brand/40 active:scale-[0.995]',
        failed ? 'border-danger/30' : 'border-line',
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold tracking-tight">
          <Link
            to={`/app/r/${rec.id}`}
            dir="auto"
            className={cn('after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-offset-4', !rec.title && 'text-muted')}
          >
            {title}
          </Link>
        </h3>
        {rec.status === 'done' && (
          <button
            type="button"
            onClick={() => onFavorite(rec)}
            aria-pressed={rec.is_favorite}
            aria-label={rec.is_favorite ? t('rec.unfavorite') : t('rec.favorite')}
            className="relative z-10 -m-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl transition active:scale-75 hover:bg-subtle"
          >
            <Star className={cn('size-5', rec.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-faint')} />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted">
        {category && <Chip color={category.color}>{category.name}</Chip>}
        <span className="tnum">{fmtClock(rec.duration)}</span>
        <span className="tnum">{fmtTime(recDate(rec), lang)}</span>
        {rec.language && (
          <span className="rounded-md bg-subtle px-1.5 py-px text-[11px] font-semibold tracking-wide">
            {LANG_BADGE[rec.language] ?? rec.language.toUpperCase()}
          </span>
        )}
        {rec.num_speakers > 1 && (
          <span className="inline-flex items-center gap-1" title={t('rec.speakers', { n: rec.num_speakers })}>
            <Users className="size-3.5" aria-hidden />
            <span className="tnum">{rec.num_speakers}</span>
          </span>
        )}
      </div>

      {rec.status === 'done' && rec.summary_preview && (
        <p dir="auto" className="mt-2.5 line-clamp-2 text-sm text-muted">
          {rec.summary_preview}
        </p>
      )}
      {processing && (
        <div className="mt-3">
          <StageProgress r={rec} />
        </div>
      )}
      {failed && (
        <div className="mt-3 flex items-center gap-3">
          <p className="flex flex-1 items-start gap-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t(rec.error === 'audio_unreadable' ? 'err.audio_unreadable' : 'err.processing_failed')}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="relative z-10"
            loading={retrying}
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => onRetry(rec)}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {rec.status === 'done' && rec.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {rec.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="text-xs text-faint">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

export function RecordingCardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-hidden>
      <div className="skeleton h-4 w-2/3 rounded-md" />
      <div className="skeleton h-3 w-1/3 rounded-md" />
      <div className="skeleton h-3 w-full rounded-md" />
      <div className="skeleton h-3 w-4/5 rounded-md" />
    </div>
  )
}
