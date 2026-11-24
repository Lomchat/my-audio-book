import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { AppConfig, CategoriesResponse, Me, WorkerStatus } from './types'

export const useConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => api<AppConfig>('/api/config'), staleTime: Infinity, retry: 1 })

/** `data` is undefined and `isError` true when the visitor is not logged in. */
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me', { noRedirect: true }),
    staleTime: 60_000,
    retry: false,
  })

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<CategoriesResponse>('/api/categories') })

export const useTags = () =>
  useQuery({ queryKey: ['tags'], queryFn: () => api<{ items: { name: string; count: number }[] }>('/api/tags') })

export const useWorkerStatus = () =>
  useQuery({
    queryKey: ['status'],
    queryFn: () => api<WorkerStatus>('/api/status'),
    refetchInterval: 20_000,
  })
