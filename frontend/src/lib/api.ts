import type { ChatMessage } from './types'

/** Error returned by the backend: `{"detail": {"code": "...", ...}}`. */
export class ApiError extends Error {
  status: number
  code: string
  detail: Record<string, unknown>
  constructor(status: number, detail: Record<string, unknown>) {
    const code = typeof detail.code === 'string' ? detail.code : 'unknown'
    super(code)
    this.status = status
    this.code = code
    this.detail = detail
  }
}

const CSRF = { 'X-Requested-With': 'mab' }
const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot', '/reset', '/privacy', '/terms', '/share']

function parseDetail(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail
    if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>
    if (Array.isArray(d)) return { code: 'validation_error' }
    if (typeof d === 'string') return { code: d }
  }
  return { code: 'unknown' }
}

/** Send the user to the login page (once) when the session is gone. */
function handleUnauthorized() {
  const path = window.location.pathname
  if (PUBLIC_PATHS.includes(path)) return
  window.location.assign(`/login?next=${encodeURIComponent(path + window.location.search)}`)
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; json?: unknown; body?: BodyInit; signal?: AbortSignal; noRedirect?: boolean } = {},
): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = {}
  let body = opts.body
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  if (method !== 'GET') Object.assign(headers, CSRF)
  let res: Response
  try {
    res = await fetch(path, { method, headers, body, credentials: 'same-origin', signal: opts.signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, { code: 'network_error' })
  }
  if (res.status === 204) return undefined as T
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 && !opts.noRedirect) handleUnauthorized()
    throw new ApiError(res.status, parseDetail(data))
  }
  return data as T
}

export const post = <T = unknown>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} })
export const patch = <T = unknown>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json })
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' })

/** Upload one file with progress reporting (fetch cannot report upload progress). */
export function uploadFile(
  file: File | Blob,
  filename: string,
  opts: { language: string; source: 'upload' | 'record' | 'share'; recordedAt?: Date; onProgress?: (p: number) => void },
): { promise: Promise<{ id: number }>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<{ id: number }>((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, filename)
    form.append('language', opts.language)
    form.append('source', opts.source)
    if (opts.recordedAt) form.append('recorded_at', opts.recordedAt.toISOString())
    xhr.open('POST', '/api/recordings')
    xhr.withCredentials = true
    xhr.setRequestHeader('X-Requested-With', 'mab')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      let data: unknown = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as { id: number })
      else {
        if (xhr.status === 401) handleUnauthorized()
        reject(new ApiError(xhr.status, parseDetail(data)))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, { code: 'network_error' }))
    xhr.onabort = () => reject(new ApiError(0, { code: 'aborted' }))
    xhr.send(form)
  })
  return { promise, abort: () => xhr.abort() }
}

export interface ChatHandlers {
  onDelta: (text: string) => void
  onDone: (sources: { id: number; title: string }[]) => void
}

/** Stream a chat answer (server-sent events over fetch). Throws ApiError on failure. */
export async function streamChat(
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  recordingId: number | undefined,
  handlers: ChatHandlers,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...CSRF },
    body: JSON.stringify({ messages, recording_id: recordingId }),
    signal,
  })
  if (!res.ok || !res.body) {
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    if (res.status === 401) handleUnauthorized()
    throw new ApiError(res.status, parseDetail(data))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return
    const evt = JSON.parse(line.slice(5).trim()) as {
      delta?: string
      done?: boolean
      sources?: { id: number; title: string }[]
      error?: string
      message?: string
    }
    if (evt.error) throw new ApiError(500, { code: evt.error, message: evt.message })
    if (evt.delta) handlers.onDelta(evt.delta)
    if (evt.done) handlers.onDone(evt.sources ?? [])
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(handleLine)
  }
  if (buffer) handleLine(buffer)
}
