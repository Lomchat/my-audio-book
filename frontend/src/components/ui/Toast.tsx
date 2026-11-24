import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface ToastItem {
  id: number
  text: string
  kind: 'ok' | 'error'
}
interface ToastApi {
  success: (text: string) => void
  error: (text: string) => void
}

const Ctx = createContext<ToastApi | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = nextId++
    setItems((s) => [...s.slice(-3), { id, text, kind }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('ok', t), error: (t) => push('error', t) }), [push])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        role="status"
        aria-live="polite"
      >
        {items.map((it) => (
          <div
            key={it.id}
            className="pointer-events-auto flex max-w-md animate-pop items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-pop"
          >
            {it.kind === 'ok' ? (
              <CheckCircle2 className="size-5 shrink-0 text-ok" aria-hidden />
            ) : (
              <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
            )}
            {it.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('ToastProvider missing')
  return v
}
