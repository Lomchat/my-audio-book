import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Sparkles, Square, Trash2 } from 'lucide-react'
import { ApiError, streamChat } from '../lib/api'
import { useConfig } from '../lib/queries'
import type { ChatMessage } from '../lib/types'
import { cn } from '../lib/cn'
import { errorMessage, useT, type Key } from '../i18n'
import { Markdown } from './Markdown'
import { IconButton } from './ui/Button'
import { Spinner } from './ui/Misc'

function load(key: string): ChatMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? '[]') as ChatMessage[]
  } catch {
    return []
  }
}

/** Streaming chat, global or scoped to one recording. Conversation is kept in sessionStorage. */
export function ChatPanel({
  recordingId,
  suggestions,
  stickyBottom,
  initialTitles,
}: {
  recordingId?: number
  suggestions: Key[]
  /** Tailwind `bottom-*` classes so the composer clears the tab bar / player. */
  stickyBottom: string
  initialTitles?: Map<number, string>
}) {
  const t = useT()
  const config = useConfig().data
  const storeKey = `mab.chat.${recordingId ?? 'all'}`
  const [messages, setMessages] = useState<ChatMessage[]>(() => load(storeKey))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionStorage.setItem(storeKey, JSON.stringify(messages.filter((m) => !m.error || m.content)))
  }, [messages, storeKey])

  useEffect(() => () => abort.current?.abort(), [])

  // Keep the newest text in view while it streams, unless the user scrolled away.
  useEffect(() => {
    const nearBottom = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 300
    if (nearBottom) end.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const titles = useMemo(() => {
    const m = new Map(initialTitles)
    for (const msg of messages) msg.sources?.forEach((s) => m.set(s.id, s.title))
    return m
  }, [messages, initialTitles])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || busy) return
      const history: ChatMessage[] = [...messages.filter((m) => !m.error), { role: 'user', content }]
      setMessages([...history, { role: 'assistant', content: '' }])
      setInput('')
      setBusy(true)
      const ctrl = new AbortController()
      abort.current = ctrl
      const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((s) => s.map((m, i) => (i === s.length - 1 ? fn(m) : m)))
      try {
        await streamChat(
          history.map(({ role, content: c }) => ({ role, content: c })),
          recordingId,
          {
            onDelta: (d) => patchLast((m) => ({ ...m, content: m.content + d })),
            onDone: (sources) => patchLast((m) => ({ ...m, sources })),
          },
          ctrl.signal,
        )
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          const msg =
            e instanceof ApiError && e.code === 'llm_error' ? t('err.llm_error') : errorMessage(e, t)
          patchLast((m) => ({ ...m, error: msg }))
        }
      } finally {
        setBusy(false)
        abort.current = null
      }
    },
    [busy, messages, recordingId, t],
  )

  const clear = () => {
    abort.current?.abort()
    setMessages([])
    sessionStorage.removeItem(storeKey)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const touch = window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !touch) {
      e.preventDefault()
      void send(input)
    }
  }

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  if (config && !config.llm_enabled) {
    return (
      <p className="rounded-2xl border border-line bg-subtle p-5 text-sm text-muted" role="status">
        {t('err.llm_disabled')}
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {messages.length === 0 ? (
        <div className="animate-fade py-8 text-center">
          <div className="bg-brand-gradient mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl text-white shadow-card">
            <Sparkles className="size-7" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {recordingId ? t('chat.recordingTitle') : t('chat.title')}
          </h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            {recordingId ? t('chat.recordingText') : t('chat.text')}
          </p>
          <div className="mx-auto mt-6 flex max-w-md flex-col gap-2">
            {suggestions.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => void send(t(k))}
                className="min-h-11 rounded-2xl border border-line bg-surface px-4 py-2.5 text-left text-sm shadow-card transition hover:border-brand/50 hover:bg-subtle active:scale-[0.98]"
              >
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5 py-4" aria-live="polite">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p dir="auto" className="bg-brand-gradient max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] whitespace-pre-wrap text-white">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <span className="bg-brand-gradient mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white">
                  <Sparkles className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 text-[15px]">
                  {m.content ? (
                    <Markdown text={m.content} titles={titles} />
                  ) : (
                    !m.error && <Spinner className="mt-1.5 text-muted" />
                  )}
                  {m.error && (
                    <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                      {m.error}
                    </p>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={end} />
        </div>
      )}

      <div className={cn('sticky z-20 -mx-4 mt-2 bg-bg/90 px-4 pt-2 pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10', stickyBottom)}>
        <div className="flex items-end gap-2 rounded-3xl border border-line bg-surface p-1.5 shadow-card focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
          {messages.length > 0 && (
            <IconButton label={t('chat.clear')} onClick={clear} className="size-10">
              <Trash2 className="size-4" />
            </IconButton>
          )}
          <textarea
            ref={area}
            rows={1}
            value={input}
            dir="auto"
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            maxLength={8000}
            onChange={(e) => {
              setInput(e.target.value)
              grow(e.target)
            }}
            onKeyDown={onKey}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] placeholder:text-faint focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              aria-label={t('chat.stop')}
              onClick={() => abort.current?.abort()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-fg transition active:scale-90"
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label={t('chat.send')}
              disabled={!input.trim()}
              onClick={() => {
                void send(input)
                if (area.current) area.current.style.height = 'auto'
              }}
              className="bg-brand-gradient flex size-10 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90 disabled:opacity-40"
            >
              <ArrowUp className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
