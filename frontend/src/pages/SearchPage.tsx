import { Fragment, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Search as SearchIcon, SearchX } from 'lucide-react'
import { api } from '../lib/api'
import { useCategories } from '../lib/queries'
import { fmtClock, fmtDate, recDate, splitHighlight } from '../lib/format'
import type { SearchHit } from '../lib/types'
import { useLang, useT } from '../i18n'
import { Chip, EmptyState, Skeleton } from '../components/ui/Misc'

export function SearchPage() {
  const t = useT()
  const lang = useLang()
  const [params, setParams] = useSearchParams()
  const [input, setInput] = useState(params.get('q') ?? '')
  const [q, setQ] = useState(input.trim())
  const cats = useCategories()

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(input.trim())
      setParams(input.trim() ? { q: input.trim() } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(id)
  }, [input, setParams])

  const results = useQuery({
    queryKey: ['recordings', 'search', q],
    queryFn: () => api<{ items: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
  })
  const catMap = new Map(cats.data?.items.map((c) => [c.id, c]))

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t('nav.search')}</h1>
      <div className="sticky top-14 z-20 -mx-4 bg-bg/90 px-4 pb-3 backdrop-blur-xl lg:top-0 lg:mx-0 lg:px-0">
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface ps-4 shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          <SearchIcon className="size-5 shrink-0 text-faint" aria-hidden />
          <input
            autoFocus
            type="search"
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('nav.search')}
            className="min-h-12 min-w-0 flex-1 bg-transparent pe-4 text-base placeholder:text-faint focus:outline-none"
          />
        </div>
      </div>

      {!q ? (
        <EmptyState icon={<SearchIcon className="size-7" />} title={t('search.emptyTitle')} text={t('search.emptyText')} />
      ) : results.isPending ? (
        <div className="space-y-3 pt-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : !results.data?.items.length ? (
        <EmptyState icon={<SearchX className="size-7" />} title={t('search.noResults', { q })} text={t('search.noResultsText')} />
      ) : (
        <ul className="space-y-3 pt-2">
          {results.data.items.map((r) => {
            const cat = r.category_id ? catMap.get(r.category_id) : undefined
            return (
              <li key={r.id}>
                <Link
                  to={`/app/r/${r.id}`}
                  className="block rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-brand/40 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2">
                    <h2 dir="auto" className="min-w-0 flex-1 truncate font-semibold">
                      {r.title || t('rec.untitled')}
                    </h2>
                    {cat && <Chip color={cat.color}>{cat.name}</Chip>}
                  </div>
                  <p dir="auto" className="mt-1.5 line-clamp-3 text-sm text-muted">
                    {splitHighlight(r.snippet).map((p, i) =>
                      p.mark ? (
                        <mark key={i} className="rounded bg-amber-300/70 px-0.5 text-fg dark:bg-amber-400/40">
                          {p.text}
                        </mark>
                      ) : (
                        <Fragment key={i}>{p.text}</Fragment>
                      ),
                    )}
                  </p>
                  <p className="mt-2 text-xs text-faint tnum">
                    {fmtDate(recDate(r), lang)} · {fmtClock(r.duration)}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
