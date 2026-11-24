import { ApiError, uploadFile } from './api'

export interface UploadItem {
  key: string
  file: File
  progress: number
  state: 'ready' | 'uploading' | 'done' | 'error'
  error?: unknown
}

export interface QuotaDetail {
  remaining_seconds?: number
  duration?: number
  contact_url?: string
}

let counter = 0
export const toItems = (files: File[]): UploadItem[] =>
  files.map((file) => ({ key: `${Date.now()}-${counter++}`, file, progress: 0, state: 'ready' as const }))

/** Upload items one after the other. Stops at the first quota error. Returns the number of successes. */
export async function runUploads(
  items: UploadItem[],
  opts: {
    language: string
    source: 'upload' | 'share'
    onChange: (key: string, patch: Partial<UploadItem>) => void
    onQuota: (detail: QuotaDetail) => void
  },
): Promise<number> {
  let ok = 0
  for (const item of items) {
    if (item.state === 'done') continue
    opts.onChange(item.key, { state: 'uploading', progress: 0, error: undefined })
    try {
      await uploadFile(item.file, item.file.name, {
        language: opts.language,
        source: opts.source,
        recordedAt: item.file.lastModified ? new Date(item.file.lastModified) : undefined,
        onProgress: (p) => opts.onChange(item.key, { progress: p }),
      }).promise
      opts.onChange(item.key, { state: 'done', progress: 1 })
      ok++
    } catch (e) {
      opts.onChange(item.key, { state: 'error', error: e })
      if (e instanceof ApiError && e.code === 'quota_exceeded') {
        opts.onQuota(e.detail as QuotaDetail)
        break
      }
    }
  }
  return ok
}
