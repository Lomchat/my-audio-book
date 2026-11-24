import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { Mic, Upload, Inbox } from 'lucide-react'
import { ApiError, api, patch, post } from '../lib/api'
import { useCategories, useTags } from '../lib/queries'
import { useRecordingPolling } from '../lib/polling'
import { dayKey, dayLabel, recDate } from '../lib/format'
import type { Recording } from '../lib/types'
import { errorMessage, useLang, useT } from '../i18n'
import { RecordingCard, RecordingCardSkeleton } from '../components/RecordingCard'
import { useUpload } from '../components/UploadProvider'
import { Chip, EmptyState } from '../components/ui/Misc'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/Toast'
import type { QuotaDetail } from '../lib/uploads'

type Page = { items: Recording[]; has_more: boolean }

export function Library() {
  const t = useT()
  const lang = useLang()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { openUpload, showQuota } = useUpload()
  const [params, setParams] = useSearchParams()
  const cats = useCategories()
  const tags = useTags()

  const cat = params.get('cat')
  const fav = params.get('fav') === '1'
  const uncat = params.get('uncat') === '1'
  const tag = params.get('tag')
  const filtered = !!(cat || fav || uncat || tag)
  const filterKey = `${cat ?? ''}|${fav}|${uncat}|${tag ?? ''}`

  const list = useInfiniteQuery({
    queryKey: ['recordings', 'list', filterKey],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: '30' })
      if (cat) q.set('category_id', cat)
      if (fav) q.set('favorite', 'true')
      if (uncat) q.set('uncategorized', 'true')
      if (tag) q.set('tag', tag)
      if (pageParam) q.set('before_id', String(pageParam))
      return api<Page>(`/api/recordings?${q}`)
    },
    getNextPageParam: (last) => (last.has_more ? last.items[last.items.length - 1]?.id : undefined),
  })

  const raw = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data])
  const overlay = useRecordingPolling(raw)
  const items = useMemo(() => raw.map((r) => overlay.get(r.id) ?? r), [raw, overlay])

  // Infinite scroll sentinel.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const favorite = useMutation({
    mutationFn: (r: Recording) => patch(`/api/recordings/${r.id}`, { is_favorite: !r.is_favorite }),
    onMutate: async (r) => {
      qc.setQueriesData<InfiniteData<Page>>({ queryKey: ['recordings', 'list'] }, (d) =>
        d && {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            items: p.items.map((x) => (x.id === r.id ? { ...x, is_favorite: !r.is_favorite } : x)),
          })),
        },
      )
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['recordings'] })
      void qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })

  const retry = useMutation({
    mutationFn: (r: Recording) => post(`/api/recordings/${r.id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recordings'] }),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'quota_exceeded') showQuota(e.detail as QuotaDetail)
      else toast.error(errorMessage(e, t))
    },
  })

  const catMap = useMemo(() => new Map(cats.data?.items.map((c) => [c.id, c])), [cats.data])
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Recording[] }[] = []
    for (const r of items) {
      const d = recDate(r)
      const key = dayKey(d)
      const last = out[out.length - 1]
      if (last?.key === key) last.items.push(r)
      else out.push({ key, label: dayLabel(d, lang, { today: t('date.today'), yesterday: t('date.yesterday') }), items: [r] })
    }
    return out
  }, [items, lang, t])

  const setFilter = (next: Record<string, string>) => setParams(next, { replace: true })
  const title = fav
    ? t('nav.favorites')
    : uncat
      ? t('nav.uncategorized')
      : cat
        ? (catMap.get(Number(cat))?.name ?? t('nav.all'))
        : tag
          ? `#${tag}`
          : t('nav.all')

  return (
    <div>
      <h1 className="mb-4 hidden text-2xl font-semibold tracking-tight lg:block">{title}</h1>

      <div className="scroll-hide -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden" role="group" aria-label={t('lib.filters')}>
        <Chip active={!filtered} onClick={() => setFilter({})}>
          {t('nav.all')}
        </Chip>
        <Chip active={fav} onClick={() => setFilter({ fav: '1' })}>
          {t('nav.favorites')}
        </Chip>
        {!!cats.data?.uncategorized && (
          <Chip active={uncat} onClick={() => setFilter({ uncat: '1' })}>
            {t('nav.uncategorized')}
          </Chip>
        )}
        {cats.data?.items.map((c) => (
          <Chip key={c.id} color={c.color} active={cat === String(c.id)} onClick={() => setFilter({ cat: String(c.id) })}>
            {c.name}
          </Chip>
        ))}
        {tags.data?.items.slice(0, 8).map((tg) => (
          <Chip key={tg.name} active={tag === tg.name} onClick={() => setFilter({ tag: tg.name })}>
            #{tg.name}
          </Chip>
        ))}
      </div>
      {tag && (
        <div className="mb-4 hidden lg:block">
          <Chip active onClick={() => setFilter({})} title={t('lib.clearFilter')}>
            #{tag} ✕
          </Chip>
        </div>
      )}

      {list.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <RecordingCardSkeleton key={i} />
          ))}
        </div>
      ) : list.isError ? (
        <EmptyState icon={<Inbox className="size-7" />} title={t('err.unknown')}>
          <Button onClick={() => void list.refetch()}>{t('common.retry')}</Button>
        </EmptyState>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={<Inbox className="size-7" />} title={t('lib.noResults')} text={t('lib.noResultsText')}>
            <Button variant="secondary" onClick={() => setFilter({})}>
              {t('lib.clearFilter')}
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={<Mic className="size-7" />} title={t('lib.emptyTitle')} text={t('lib.emptyText')}>
            <Button icon={<Mic className="size-4" />} onClick={() => navigate('/app/record')}>
              {t('new.record')}
            </Button>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => openUpload()}>
              {t('new.import')}
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="mb-2.5 px-1 text-xs font-semibold tracking-wide text-faint uppercase">{g.label}</h2>
              <div className="space-y-3">
                {g.items.map((r) => (
                  <RecordingCard
                    key={r.id}
                    rec={r}
                    category={r.category_id ? catMap.get(r.category_id) : undefined}
                    onFavorite={(x) => favorite.mutate(x)}
                    onRetry={(x) => retry.mutate(x)}
                    retrying={retry.isPending && retry.variables?.id === r.id}
                  />
                ))}
              </div>
            </section>
          ))}
          <div ref={sentinel} className="h-px" />
          {isFetchingNextPage && <RecordingCardSkeleton />}
        </div>
      )}
    </div>
  )
}
