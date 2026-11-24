import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import type { RecordingDetail, Segment } from '../lib/types'
import { fmtClock } from '../lib/format'
import { cn } from '../lib/cn'
import { useT } from '../i18n'
import type { Player } from './AudioPlayer'
import { IconButton } from './ui/Button'

export function speakerColor(sp: number) {
  return `var(--sp${((sp - 1) % 8) + 1})`
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlighted({ text, re }: { text: string; re: RegExp | null }) {
  if (!re) return <>{text}</>
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded bg-amber-300/70 px-0.5 text-inherit dark:bg-amber-400/40">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

function SpeakerLabel({
  sp,
  name,
  onRename,
}: {
  sp: number
  name: string
  onRename: (sp: number, name: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const done = (save: boolean) => {
    setEditing(false)
    if (save && draft.trim() !== name) onRename(sp, draft.trim())
  }
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={60}
        aria-label={t('tr.renameSpeaker')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') done(true)
          if (e.key === 'Escape') done(false)
        }}
        className="h-7 w-40 rounded-lg border border-brand bg-surface px-2 text-sm font-semibold focus:outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      title={t('tr.renameSpeaker')}
      onClick={() => {
        setDraft(name)
        setEditing(true)
      }}
      className="rounded-md py-0.5 text-sm font-semibold hover:underline"
      style={{ color: speakerColor(sp) }}
    >
      {name}
    </button>
  )
}

export function TranscriptView({
  rec,
  player,
  dir,
  onRenameSpeaker,
}: {
  rec: RecordingDetail
  player: Player
  dir: 'rtl' | 'auto'
  onRenameSpeaker: (sp: number, name: string) => void
}) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [follow, setFollow] = useState(true)
  const refs = useRef(new Map<number, HTMLElement>())

  const segments = rec.segments
  const current = useMemo(() => {
    let idx = -1
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].s <= player.time + 0.15) idx = i
      else break
    }
    return idx
  }, [segments, player.time])

  const re = useMemo(() => (query.trim().length > 1 ? new RegExp(`(${escapeRe(query.trim())})`, 'gi') : null), [query])
  const matches = useMemo(
    () => (re ? segments.flatMap((s, i) => (s.t.toLowerCase().includes(query.trim().toLowerCase()) ? [i] : [])) : []),
    [re, segments, query],
  )

  const scrollTo = (i: number, block: ScrollLogicalPosition = 'center') =>
    refs.current.get(i)?.scrollIntoView({ block, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

  // Auto-scroll to the playing segment, paused as soon as the user scrolls by hand.
  useEffect(() => {
    if (follow && player.playing && current >= 0) scrollTo(current)
  }, [current, follow, player.playing])
  useEffect(() => {
    const stop = () => setFollow(false)
    window.addEventListener('wheel', stop, { passive: true })
    window.addEventListener('touchmove', stop, { passive: true })
    return () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
    }
  }, [])

  const go = (delta: number) => {
    if (!matches.length) return
    const n = (matchIdx + delta + matches.length) % matches.length
    setMatchIdx(n)
    scrollTo(matches[n])
  }

  const name = (sp: number) => rec.speakers[String(sp)] || t('tr.speaker', { n: sp })
  const showSpeakers = rec.num_speakers > 1 || Object.keys(rec.speakers).length > 1

  if (!segments.length) return <p className="py-10 text-center text-sm text-muted">{t('tr.empty')}</p>

  return (
    <div>
      <div className="sticky top-14 z-20 -mx-1 mb-3 bg-bg/90 px-1 py-2 backdrop-blur-xl lg:top-0">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface ps-3 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <Search className="size-4 shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setMatchIdx(0)
            }}
            onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)}
            placeholder={t('tr.find')}
            aria-label={t('tr.find')}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-sm placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {re && (
            <>
              <span className="text-xs text-muted tnum" aria-live="polite">
                {matches.length ? `${matchIdx + 1}/${matches.length}` : t('tr.noMatch')}
              </span>
              <IconButton label={t('tr.prev')} className="size-9" onClick={() => go(-1)} disabled={!matches.length}>
                <ChevronUp className="size-4" />
              </IconButton>
              <IconButton label={t('tr.next')} className="size-9" onClick={() => go(1)} disabled={!matches.length}>
                <ChevronDown className="size-4" />
              </IconButton>
              <IconButton label={t('common.clear')} className="size-9" onClick={() => setQuery('')}>
                <X className="size-4" />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div dir={dir} className="space-y-1">
        {segments.map((seg: Segment, i) => {
          const newSpeaker = seg.sp != null && showSpeakers && (i === 0 || segments[i - 1].sp !== seg.sp)
          const active = i === current
          return (
            <div
              key={i}
              ref={(el) => {
                if (el) refs.current.set(i, el)
                else refs.current.delete(i)
              }}
              className={cn(
                'scroll-mt-32 rounded-xl px-3 py-2 transition-colors',
                active ? 'bg-brand-soft' : 'hover:bg-subtle/60',
                matches[matchIdx] === i && 'ring-2 ring-amber-400/70',
              )}
            >
              {newSpeaker && seg.sp != null && (
                <div className="mb-0.5">
                  <SpeakerLabel sp={seg.sp} name={name(seg.sp)} onRename={onRenameSpeaker} />
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFollow(true)
                    player.seek(seg.s, true)
                  }}
                  aria-label={t('tr.seekTo', { time: fmtClock(seg.s) })}
                  dir="ltr"
                  className="mt-0.5 h-6 shrink-0 rounded-md px-1.5 text-xs font-medium text-faint transition tnum hover:bg-brand-soft hover:text-brand-text"
                >
                  {fmtClock(seg.s)}
                </button>
                <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
                  <Highlighted text={seg.t.trim()} re={re} />
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {!follow && player.playing && (
        <button
          type="button"
          onClick={() => {
            setFollow(true)
            scrollTo(current)
          }}
          className="bg-brand-gradient fixed bottom-[calc(10.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex min-h-10 -translate-x-1/2 animate-pop items-center gap-2 rounded-full px-4 text-sm font-medium text-white shadow-pop lg:bottom-28 lg:left-[calc(50%+8rem)]"
        >
          <ArrowDown className="size-4" aria-hidden />
          {t('tr.follow')}
        </button>
      )}
    </div>
  )
}
