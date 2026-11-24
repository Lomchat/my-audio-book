import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, MicOff, Mic, Pause, Play, Square, Trash2 } from 'lucide-react'
import { ApiError, uploadFile } from '../lib/api'
import { useConfig, useMe } from '../lib/queries'
import { fmtClock, fmtDuration, nowStamp } from '../lib/format'
import type { QuotaDetail } from '../lib/uploads'
import { cn } from '../lib/cn'
import { errorMessage, useT, type Key } from '../i18n'
import { LanguageSelect, useUpload } from '../components/UploadProvider'
import { Button } from '../components/ui/Button'
import { ProgressBar } from '../components/ui/Misc'
import { useToast } from '../components/ui/Toast'

type Phase = 'idle' | 'recording' | 'paused' | 'recorded'
type MicError = 'denied' | 'nodevice' | 'unsupported' | 'failed' | null

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

const extFor = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm')
const HISTORY = 72

export function Record() {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const me = useMe().data
  const config = useConfig().data
  const { showQuota } = useUpload()

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [micError, setMicError] = useState<MicError>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [language, setLanguage] = useState('auto')
  const [progress, setProgress] = useState<number | null>(null)
  const [autoStopped, setAutoStopped] = useState(false)

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const mime = useRef('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const raf = useRef(0)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const clock = useRef({ base: 0, startedAt: 0 })
  const levels = useRef<number[]>(new Array(HISTORY).fill(0))
  const limitRef = useRef(Infinity)

  const quota = me?.quota
  const remaining = quota && quota.limit_seconds >= 0 ? Math.max(0, quota.limit_seconds - quota.used_seconds) : Infinity
  const maxSeconds = Math.min(remaining, (config?.max_audio_minutes ?? Infinity) * 60)
  limitRef.current = maxSeconds

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const releaseResources = useCallback(() => {
    cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((tr) => tr.stop())
    stream.current = null
    void audioCtx.current?.close().catch(() => undefined)
    audioCtx.current = null
    analyser.current = null
    void wakeLock.current?.release().catch(() => undefined)
    wakeLock.current = null
  }, [])

  useEffect(() => () => releaseResources(), [releaseResources])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  // Warn before leaving with an unsaved recording.
  useEffect(() => {
    if (phase === 'idle' || progress !== null) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase, progress])

  // Re-acquire the wake lock when the tab becomes visible again.
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === 'visible' && phase === 'recording' && !wakeLock.current) {
        wakeLock.current = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase])

  const draw = useCallback(() => {
    const cv = canvas.current
    const an = analyser.current
    if (!cv || !an) return
    const data = new Uint8Array(an.fftSize)
    let last = 0
    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const still = reducedMotion()
      if (now - last < (still ? 250 : 50)) return
      last = now
      an.getByteTimeDomainData(data)
      let peak = 0
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128))
      levels.current.push(Math.min(1, (peak / 128) * 1.6))
      levels.current.shift()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = cv.clientWidth * dpr
      const h = cv.clientHeight * dpr
      if (cv.width !== w) cv.width = w
      if (cv.height !== h) cv.height = h
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, '#1f6f78')
      grad.addColorStop(1, '#1f6f78')
      ctx.fillStyle = grad
      const slot = w / HISTORY
      const bar = Math.max(2 * dpr, slot * 0.6)
      levels.current.forEach((lv, i) => {
        const bh = Math.max(bar, lv * h)
        const x = i * slot + (slot - bar) / 2
        ctx.beginPath()
        ctx.roundRect(x, (h - bh) / 2, bar, bh, bar / 2)
        ctx.fill()
      })
    }
    raf.current = requestAnimationFrame(frame)
  }, [])

  // Timer + automatic stop at the quota limit.
  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => {
      const e = clock.current.base + (performance.now() - clock.current.startedAt) / 1000
      setElapsed(e)
      if (e >= limitRef.current) {
        setAutoStopped(true)
        stop()
      }
    }, 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const start = async () => {
    setMicError(null)
    setAutoStopped(false)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('unsupported')
      return
    }
    if (remaining <= 0) {
      showQuota({ remaining_seconds: 0, contact_url: config?.contact_url })
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = s
      mime.current = pickMime()
      const rec = new MediaRecorder(s, mime.current ? { mimeType: mime.current } : undefined)
      mime.current = rec.mimeType || mime.current
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        const b = new Blob(chunks.current, { type: mime.current || 'audio/webm' })
        setBlob(b)
        setPreviewUrl(URL.createObjectURL(b))
        setPhase('recorded')
        releaseResources()
      }
      recorder.current = rec

      const ctx = new AudioContext()
      audioCtx.current = ctx
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(s).connect(an)
      analyser.current = an
      levels.current = new Array(HISTORY).fill(0)

      rec.start(1000)
      clock.current = { base: 0, startedAt: performance.now() }
      setElapsed(0)
      setPhase('recording')
      draw()
      wakeLock.current = (await navigator.wakeLock?.request('screen').catch(() => null)) ?? null
    } catch (e) {
      releaseResources()
      const name = e instanceof DOMException ? e.name : ''
      setMicError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'nodevice'
            : 'failed',
      )
    }
  }

  function stop() {
    const rec = recorder.current
    if (rec && rec.state !== 'inactive') {
      if (rec.state === 'recording') clock.current.base += (performance.now() - clock.current.startedAt) / 1000
      rec.stop()
    }
  }

  const togglePause = () => {
    const rec = recorder.current
    if (!rec) return
    if (rec.state === 'recording') {
      clock.current.base += (performance.now() - clock.current.startedAt) / 1000
      rec.pause()
      setPhase('paused')
    } else if (rec.state === 'paused') {
      clock.current.startedAt = performance.now()
      rec.resume()
      setPhase('recording')
    }
  }

  const discard = () => {
    setBlob(null)
    setPreviewUrl('')
    setElapsed(0)
    setPhase('idle')
    setAutoStopped(false)
  }

  const transcribe = async () => {
    if (!blob) return
    setProgress(0)
    try {
      const { id } = await uploadFile(blob, `Recording ${nowStamp()}.${extFor(blob.type)}`, {
        language,
        source: 'record',
        recordedAt: new Date(),
        onProgress: setProgress,
      }).promise
      void qc.invalidateQueries({ queryKey: ['recordings'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
      setPhase('idle')
      setBlob(null)
      toast.success(t('upload.success', { n: 1 }))
      navigate(`/app/r/${id}`)
    } catch (e) {
      setProgress(null)
      if (e instanceof ApiError && e.code === 'quota_exceeded') showQuota(e.detail as QuotaDetail)
      else toast.error(errorMessage(e, t))
    }
  }

  const recording = phase === 'recording'
  const active = recording || phase === 'paused'
  const timeLeft = Number.isFinite(maxSeconds) ? Math.max(0, maxSeconds - elapsed) : null

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center pt-2 text-center lg:pt-6">
      <h1 className="sr-only">{t('rec.recordTitle')}</h1>

      {micError && (
        <div role="alert" className="mb-6 flex w-full items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-start text-sm text-danger">
          <MicOff className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t(`mic.${micError}.title` as Key)}</p>
            <p className="mt-0.5 opacity-90">{t(`mic.${micError}.text` as Key)}</p>
          </div>
        </div>
      )}

      {phase !== 'recorded' ? (
        <>
          <p className={cn('text-6xl font-light tracking-tight tnum sm:text-7xl', !active && 'text-faint')} aria-live="off">
            {fmtClock(elapsed)}
          </p>
          <p className="mt-2 h-5 text-sm text-muted">
            {phase === 'paused'
              ? t('rec.paused')
              : recording
                ? timeLeft !== null && timeLeft < 120
                  ? t('rec.autoStopIn', { time: fmtClock(timeLeft) })
                  : t('rec.recording')
                : t('rec.tapToStart')}
          </p>

          <div className="my-8 h-24 w-full">
            {active ? (
              <canvas ref={canvas} className="size-full" role="img" aria-label={t('rec.levelLabel')} />
            ) : (
              <div className="flex size-full items-center justify-center gap-1" aria-hidden>
                {Array.from({ length: 40 }, (_, i) => (
                  <span key={i} className="w-1 rounded-full bg-line" style={{ height: `${6 + ((i * 37) % 18)}%` }} />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-6">
            {active && (
              <button
                type="button"
                onClick={togglePause}
                aria-label={phase === 'paused' ? t('rec.resume') : t('rec.pause')}
                className="flex size-14 items-center justify-center rounded-full border border-line bg-surface shadow-card transition active:scale-90"
              >
                {phase === 'paused' ? <Play className="size-6 fill-current" /> : <Pause className="size-6 fill-current" />}
              </button>
            )}
            <div className="relative">
              {recording && !reducedMotion() && (
                <span className="absolute inset-0 rounded-full bg-red-500/40 [animation:pulse-ring_1.6s_ease-out_infinite]" aria-hidden />
              )}
              <button
                type="button"
                onClick={active ? stop : start}
                aria-label={active ? t('rec.stop') : t('rec.start')}
                className={cn(
                  'relative flex size-28 items-center justify-center rounded-full text-white shadow-pop transition active:scale-95 sm:size-32',
                  active ? 'bg-red-500' : 'bg-brand-gradient',
                )}
              >
                {active ? <Square className="size-10 fill-current" /> : <Mic className="size-12" />}
              </button>
            </div>
            {active && <span className="size-14" aria-hidden />}
          </div>

          {Number.isFinite(remaining) && (
            <p className="mt-8 text-sm text-muted tnum">{t('rec.remaining', { time: fmtDuration(Math.max(0, remaining - elapsed)) })}</p>
          )}
          {autoStopped && <p className="mt-3 text-sm text-warn">{t('rec.autoStopped')}</p>}
        </>
      ) : (
        <div className="w-full animate-fade space-y-5 text-start">
          <div className="text-center">
            <p className="text-5xl font-light tracking-tight tnum">{fmtClock(elapsed)}</p>
            <p className="mt-1 text-sm text-muted">{t('rec.preview')}</p>
          </div>
          {autoStopped && <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-center text-sm text-warn">{t('rec.autoStopped')}</p>}
          <audio controls src={previewUrl} className="w-full" aria-label={t('rec.preview')} />
          <LanguageSelect value={language} onChange={setLanguage} />
          {progress !== null && <ProgressBar value={progress} label={t('rec.uploading')} />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" size="lg" className="sm:flex-1" disabled={progress !== null} icon={<Trash2 className="size-4" />} onClick={discard}>
              {t('rec.discard')}
            </Button>
            <Button size="lg" className="sm:flex-[2]" loading={progress !== null} icon={<Check className="size-5" />} onClick={transcribe}>
              {t('rec.transcribe')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
