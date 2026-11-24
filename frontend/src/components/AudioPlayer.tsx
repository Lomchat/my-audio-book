import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { fmtClock } from '../lib/format'
import { useT } from '../i18n'
import { cn } from '../lib/cn'

export interface Player {
  attach: (el: HTMLAudioElement | null) => void
  time: number
  duration: number
  playing: boolean
  rate: number
  setRate: (r: number) => void
  toggle: () => void
  seek: (t: number, play?: boolean) => void
  skip: (delta: number) => void
}

/** Wraps an <audio> element: state, seeking, Space shortcut. */
export function usePlayer(fallbackDuration: number, initialSeek?: number): Player {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [el, setEl] = useState<HTMLAudioElement | null>(null)
  const attach = useCallback((node: HTMLAudioElement | null) => {
    audioRef.current = node
    setEl(node)
  }, [])
  const [time, setTime] = useState(0)
  const [metaDuration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRateState] = useState(1)
  const pendingSeek = useRef<number | undefined>(initialSeek)

  useEffect(() => {
    const a = el
    if (!a) return
    const onTime = () => setTime(a.currentTime)
    const onMeta = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration)
      if (pendingSeek.current !== undefined) {
        a.currentTime = pendingSeek.current
        setTime(pendingSeek.current)
        pendingSeek.current = undefined
      }
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onMeta)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onPause)
    if (a.readyState >= 1) onMeta()
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('durationchange', onMeta)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onPause)
    }
  }, [el])

  const seek = useCallback((t: number, play = false) => {
    const a = audioRef.current
    if (!a) return
    const clamped = Math.max(0, t)
    if (a.readyState >= 1) {
      a.currentTime = clamped
      setTime(clamped)
    } else pendingSeek.current = clamped
    if (play) void a.play().catch(() => undefined)
  }, [])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play().catch(() => undefined)
    else a.pause()
  }, [])

  const skip = useCallback((d: number) => {
    const a = audioRef.current
    if (a) seek(Math.min(a.duration || Infinity, a.currentTime + d))
  }, [seek])

  const setRate = useCallback((r: number) => {
    setRateState(r)
    if (audioRef.current) audioRef.current.playbackRate = r
  }, [])

  // Space toggles playback unless the user is typing or focused on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      const el = e.target as HTMLElement
      if (el.closest('input,textarea,select,button,a,[role=tab],[role=menuitem],[contenteditable=true],[role=dialog]')) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return { attach, time, duration: metaDuration || fallbackDuration, playing, rate, setRate, toggle, seek, skip }
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]

export function AudioPlayer({ player, src }: { player: Player; src: string }) {
  const t = useT()
  const { time, duration, playing, rate } = player
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0
  const nextRate = () => player.setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])
  const btn = 'flex size-11 items-center justify-center rounded-full text-muted transition hover:bg-subtle hover:text-fg active:scale-90'

  return (
    <div className="pb-safe-player fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 backdrop-blur-xl lg:bottom-0 lg:left-64">
      <audio ref={player.attach} src={src} preload="metadata" />
      <div className="mx-auto max-w-5xl px-4 pt-1.5 pb-2 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="w-12 text-right text-xs text-muted tnum">{fmtClock(time)}</span>
          <input
            type="range"
            className="seek"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(time, duration)}
            style={{ '--p': `${pct}%` } as React.CSSProperties}
            aria-label={t('player.seek')}
            aria-valuetext={`${fmtClock(time)} / ${fmtClock(duration)}`}
            onChange={(e) => player.seek(Number(e.target.value))}
          />
          <span className="w-12 text-xs text-muted tnum">{fmtClock(duration)}</span>
        </div>
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          <button type="button" onClick={nextRate} className={cn(btn, 'w-14 rounded-xl text-sm font-semibold tnum')} aria-label={t('player.speed', { rate })}>
            {rate}×
          </button>
          <button type="button" onClick={() => player.skip(-15)} className={btn} aria-label={t('player.back')}>
            <RotateCcw className="size-5" />
          </button>
          <button
            type="button"
            onClick={player.toggle}
            className="bg-brand-gradient flex size-12 items-center justify-center rounded-full text-white shadow-card transition active:scale-90"
            aria-label={playing ? t('player.pause') : t('player.play')}
          >
            {playing ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
          </button>
          <button type="button" onClick={() => player.skip(15)} className={btn} aria-label={t('player.forward')}>
            <RotateCw className="size-5" />
          </button>
          <span className="w-14" aria-hidden />
        </div>
      </div>
    </div>
  )
}
