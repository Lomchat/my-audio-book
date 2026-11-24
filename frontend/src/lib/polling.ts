import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Recording } from './types'

export const isActive = (r: Pick<Recording, 'status'>) =>
  r.status === 'queued' || r.status === 'processing' || r.status === 'uploading'

/**
 * Poll the status of unfinished recordings every ~2.5 s.
 * Returns the freshest version of each polled recording; when one finishes, the
 * dependent queries are invalidated so lists, counters and quota refresh.
 */
export function useRecordingPolling(items: Recording[]): Map<number, Recording> {
  const qc = useQueryClient()
  const ids = useMemo(() => items.filter(isActive).map((r) => r.id).sort((a, b) => a - b), [items])
  const key = ids.join(',')
  const status = useQuery({
    queryKey: ['recordings', 'status', key],
    queryFn: () => api<{ items: Recording[] }>(`/api/recordings/status?ids=${key}`),
    enabled: ids.length > 0,
    refetchInterval: 2500,
    placeholderData: (prev) => prev,
  })
  const overlay = useMemo(() => new Map((status.data?.items ?? []).map((r) => [r.id, r])), [status.data])

  const prevActive = useRef<Set<number>>(new Set())
  useEffect(() => {
    const finished = [...prevActive.current].filter((id) => {
      const fresh = overlay.get(id)
      return fresh && !isActive(fresh)
    })
    prevActive.current = new Set(ids.filter((id) => !finished.includes(id)))
    if (finished.length) {
      for (const k of ['list', 'detail', 'search']) void qc.invalidateQueries({ queryKey: ['recordings', k] })
      for (const k of ['categories', 'tags', 'me']) void qc.invalidateQueries({ queryKey: [k] })
    }
  }, [overlay, ids, qc])

  return overlay
}
