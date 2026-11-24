import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  FileDown,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ScrollText,
  AudioLines,
  FileText,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import { ApiError, api, del, patch, post } from '../lib/api'
import { useConfig } from '../lib/queries'
import { fmtClock, fmtDateTime, LANG_BADGE, recDate } from '../lib/format'
import type { RecordingDetail, RecStage } from '../lib/types'
import { cn } from '../lib/cn'
import { errorMessage, useLang, useT, type Key } from '../i18n'
import { AudioPlayer, usePlayer } from '../components/AudioPlayer'
import { CategoryPicker, type CategoryChoice } from '../components/CategoryPicker'
import { ChatPanel } from '../components/ChatPanel'
import { StageProgress } from '../components/RecordingCard'
import { SummaryView } from '../components/SummaryView'
import { TagEditor } from '../components/TagEditor'
import { TranscriptView } from '../components/TranscriptView'
import { Button, IconButton } from '../components/ui/Button'
import { Menu } from '../components/ui/Menu'
import { ConfirmDialog } from '../components/ui/Sheet'
import { Tabs } from '../components/ui/Tabs'
import { Card, Skeleton } from '../components/ui/Misc'
import { useToast } from '../components/ui/Toast'
import { useUpload } from '../components/UploadProvider'
import type { QuotaDetail } from '../lib/uploads'

type Tab = 'summary' | 'transcript' | 'ask'
const STAGES: RecStage[] = ['preparing', 'detecting', 'transcribing', 'diarizing', 'summarizing']

function EditableTitle({ value, dir, onSave }: { value: string; dir: 'rtl' | 'auto'; onSave: (v: string) => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const finish = (save: boolean) => {
    setEditing(false)
    if (save && draft.trim() && draft.trim() !== value) onSave(draft.trim())
  }
  if (editing) {
    return (
      <input
        autoFocus
        dir={dir}
        value={draft}
        maxLength={200}
        aria-label={t('rec.title')}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true)
          if (e.key === 'Escape') finish(false)
        }}
        className="w-full rounded-xl border border-brand bg-surface px-3 py-1.5 text-2xl font-semibold tracking-tight focus:outline-none focus:ring-4 focus:ring-brand/15"
      />
    )
  }
  return (
    <h1 className="text-2xl leading-tight font-semibold tracking-tight">
      <button
        type="button"
        dir={dir}
        title={t('rec.editTitle')}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className="-mx-2 rounded-xl px-2 py-0.5 text-start transition hover:bg-subtle"
      >
        {value || t('rec.untitled')}
      </button>
    </h1>
  )
}

function ProcessingView({ rec }: { rec: RecordingDetail }) {
  const t = useT()
  const currentIdx = rec.status === 'processing' ? Math.max(0, STAGES.indexOf(rec.stage ?? 'preparing')) : -1
  return (
    <Card className="mx-auto mt-6 max-w-xl space-y-6 p-6 text-center sm:p-8">
      <div className="bg-brand-gradient mx-auto flex size-16 animate-pulse items-center justify-center rounded-2xl text-white">
        <AudioLines className="size-8" aria-hidden />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{rec.status === 'queued' ? t('status.queued') : t('proc.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('proc.text')}</p>
      </div>
      <StageProgress r={rec} large />
      <ol className="mx-auto max-w-xs space-y-2.5 text-start">
        {STAGES.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo'
          return (
            <li key={s} className={cn('flex items-center gap-3 text-sm', state === 'todo' && 'text-faint')}>
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full',
                  state === 'done' && 'bg-ok-soft text-ok',
                  state === 'current' && 'bg-brand-soft text-brand-text',
                  state === 'todo' && 'bg-subtle',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" /> : state === 'current' ? <Loader2 className="size-3.5 animate-spin" /> : null}
              </span>
              {t(`stage.${s}` as Key)}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

export function RecordingPage() {
  const id = Number(useParams().id)
  const t = useT()
  const lang = useLang()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const config = useConfig().data
  const { showQuota } = useUpload()
  const [params, setParams] = useSearchParams()
  const seekParam = params.get('t')
  const [tab, setTab] = useState<Tab>('summary')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const query = useQuery({
    queryKey: ['recordings', 'detail', id],
    queryFn: () => api<RecordingDetail>(`/api/recordings/${id}`),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'queued' || s === 'processing' || s === 'uploading' || q.state.data?.stage === 'summarizing' ? 2500 : false
    },
  })
  const rec = query.data
  const player = usePlayer(rec?.duration ?? 0, seekParam ? Number(seekParam) : undefined)

  // `?t=` links (citations, search): seek once the recording is shown, and open the transcript.
  const handledSeek = useRef<string | null>(null)
  useEffect(() => {
    if (seekParam && rec?.status === 'done' && handledSeek.current !== seekParam) {
      handledSeek.current = seekParam
      player.seek(Number(seekParam))
      setTab('transcript')
      setParams({}, { replace: true })
    }
  }, [seekParam, rec?.status, player, setParams])

  // When processing finishes, refresh dependent data once.
  const wasActive = useRef(false)
  useEffect(() => {
    const active = rec?.status === 'queued' || rec?.status === 'processing'
    if (wasActive.current && rec && !active) {
      for (const k of ['list', 'search']) void qc.invalidateQueries({ queryKey: ['recordings', k] })
      for (const k of ['categories', 'tags', 'me']) void qc.invalidateQueries({ queryKey: [k] })
    }
    wasActive.current = !!active
  }, [rec, qc])

  const refreshAround = () => {
    void qc.invalidateQueries({ queryKey: ['recordings', 'list'] })
    void qc.invalidateQueries({ queryKey: ['categories'] })
    void qc.invalidateQueries({ queryKey: ['tags'] })
  }

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<RecordingDetail>(`/api/recordings/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(['recordings', 'detail', id], data)
      refreshAround()
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })

  const resummarize = useMutation({
    mutationFn: () => post<RecordingDetail>(`/api/recordings/${id}/resummarize`),
    onSuccess: (data) => {
      qc.setQueryData(['recordings', 'detail', id], data)
      void qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })

  const retry = useMutation({
    mutationFn: () => post(`/api/recordings/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recordings'] }),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'quota_exceeded') showQuota(e.detail as QuotaDetail)
      else toast.error(errorMessage(e, t))
    },
  })

  const remove = useMutation({
    mutationFn: () => del(`/api/recordings/${id}`),
    onSuccess: () => {
      refreshAround()
      void qc.invalidateQueries({ queryKey: ['recordings'] })
      navigate('/app', { replace: true })
    },
    onError: (e) => {
      setConfirmDelete(false)
      toast.error(errorMessage(e, t))
    },
  })

  const titles = useMemo(() => new Map(rec ? [[rec.id, rec.title]] : []), [rec])

  if (query.isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted">{t('rec.notFound')}</p>
        <Link to="/app" className="mt-3 inline-block text-sm font-medium text-brand-text hover:underline">
          {t('rec.back')}
        </Link>
      </div>
    )
  }
  if (!rec) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )
  }

  const dir = rec.language === 'he' ? 'rtl' : 'auto'
  const done = rec.status === 'done'
  const date = fmtDateTime(recDate(rec), lang)
  const exportItem = (format: string, label: string) => ({
    label,
    icon: <FileDown className="size-4" />,
    href: `/api/recordings/${id}/export?format=${format}`,
  })

  const tabs = [
    { id: 'summary' as const, label: t('tab.summary'), icon: <FileText className="size-4" /> },
    { id: 'transcript' as const, label: t('tab.transcript'), icon: <ScrollText className="size-4" /> },
    { id: 'ask' as const, label: t('tab.ask'), icon: <MessageSquare className="size-4" /> },
  ]

  return (
    <div>
      <Link to="/app" className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t('rec.back')}
      </Link>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <EditableTitle value={rec.title} dir={dir} onSave={(title) => save.mutate({ title })} />
        </div>
        {done && (
          <IconButton
            label={rec.is_favorite ? t('rec.unfavorite') : t('rec.favorite')}
            aria-pressed={rec.is_favorite}
            onClick={() => save.mutate({ is_favorite: !rec.is_favorite })}
          >
            <Star className={cn('size-5', rec.is_favorite && 'fill-amber-400 text-amber-400')} />
          </IconButton>
        )}
        <Menu
          label={t('common.more')}
          items={[
            ...(done
              ? [
                  exportItem('md', t('rec.exportAs', { f: 'Markdown' })),
                  exportItem('txt', t('rec.exportAs', { f: 'Text' })),
                  exportItem('srt', t('rec.exportAs', { f: 'SRT' })),
                  exportItem('vtt', t('rec.exportAs', { f: 'VTT' })),
                  exportItem('json', t('rec.exportAs', { f: 'JSON' })),
                ]
              : []),
            { label: t('rec.downloadOriginal'), icon: <Download className="size-4" />, href: `/api/recordings/${id}/download` },
            ...(done && config?.llm_enabled
              ? [{ label: t('sum.regenerate'), icon: <RefreshCw className="size-4" />, onSelect: () => resummarize.mutate(), divider: true }]
              : []),
            {
              label: t('common.delete'),
              icon: <Trash2 className="size-4" />,
              onSelect: () => setConfirmDelete(true),
              danger: true,
              divider: true,
            },
          ]}
        />
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{date}</span>
        <span aria-hidden>·</span>
        <span className="tnum">{fmtClock(rec.duration)}</span>
        {rec.language && (
          <>
            <span aria-hidden>·</span>
            <span className="rounded-md bg-subtle px-1.5 py-px text-xs font-semibold">{LANG_BADGE[rec.language] ?? rec.language}</span>
          </>
        )}
        {rec.num_speakers > 1 && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              {t('rec.speakers', { n: rec.num_speakers })}
            </span>
          </>
        )}
      </p>

      {done && (
        <div className="mt-4 space-y-3">
          <CategoryPicker
            value={rec.category_id}
            onPick={(c: CategoryChoice) =>
              save.mutate('id' in c ? { category_id: c.id } : 'name' in c ? { category_name: c.name } : { clear_category: true })
            }
          />
          <TagEditor tags={rec.tags} onChange={(tags) => save.mutate({ tags })} />
        </div>
      )}

      {rec.status === 'error' ? (
        <Card className="mx-auto mt-8 max-w-xl space-y-4 border-danger/30 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-danger" aria-hidden />
          <p className="text-sm text-danger">{t(rec.error === 'audio_unreadable' ? 'err.audio_unreadable' : 'err.processing_failed')}</p>
          <Button variant="secondary" loading={retry.isPending} icon={<RotateCcw className="size-4" />} onClick={() => retry.mutate()}>
            {t('common.retry')}
          </Button>
        </Card>
      ) : !done ? (
        <ProcessingView rec={rec} />
      ) : (
        <div className="mt-6">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label={t('tab.label')} />
          <div className="pt-5" role="tabpanel">
            {tab === 'summary' && (
              <SummaryView
                rec={rec}
                dir={dir}
                llmEnabled={!!config?.llm_enabled}
                resummarizing={resummarize.isPending || rec.stage === 'summarizing'}
                onResummarize={() => resummarize.mutate()}
              />
            )}
            {tab === 'transcript' && (
              <TranscriptView
                rec={rec}
                player={player}
                dir={dir}
                onRenameSpeaker={(sp, name) => save.mutate({ speakers: { [String(sp)]: name } })}
              />
            )}
            {tab === 'ask' && (
              <ChatPanel
                recordingId={id}
                initialTitles={titles}
                suggestions={['chat.r1', 'chat.r2', 'chat.r3']}
                stickyBottom="bottom-[calc(10.5rem+env(safe-area-inset-bottom))] lg:bottom-[6.5rem]"
              />
            )}
          </div>
        </div>
      )}

      {/* Audio element is always mounted so playback survives tab switches. */}
      <AudioPlayer player={player} src={`/api/recordings/${id}/audio`} />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('rec.deleteTitle')}
        text={t('rec.deleteText')}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  )
}
