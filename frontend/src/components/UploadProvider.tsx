import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, MessageCircle, UploadCloud } from 'lucide-react'
import { runUploads, toItems, type QuotaDetail, type UploadItem } from '../lib/uploads'
import { AUDIO_ACCEPT, fmtDuration } from '../lib/format'
import { useConfig } from '../lib/queries'
import { useT } from '../i18n'
import { Sheet } from './ui/Sheet'
import { Button, AnchorButton } from './ui/Button'
import { Field, Select } from './ui/Form'
import { UploadList } from './UploadList'
import { useToast } from './ui/Toast'

interface UploadApi {
  openUpload: (files?: File[]) => void
  showQuota: (detail: QuotaDetail) => void
}
const Ctx = createContext<UploadApi | null>(null)
export const useUpload = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('UploadProvider missing')
  return v
}

/** Language options shared by the upload and share screens. */
export function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT()
  return (
    <Field label={t('upload.language')} hint={t('upload.languageHint')}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="auto">{t('lang.auto')}</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="he">עברית</option>
        </Select>
      )}
    </Field>
  )
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const config = useConfig()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [language, setLanguage] = useState('auto')
  const [busy, setBusy] = useState(false)
  const [quota, setQuota] = useState<QuotaDetail | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: File[]) => {
    if (files.length) setItems((s) => [...s, ...toItems(files)])
  }, [])

  const openUpload = useCallback(
    (files?: File[]) => {
      setOpen(true)
      if (files) addFiles(files)
    },
    [addFiles],
  )

  // Desktop drag-and-drop anywhere in the app.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      openUpload([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [openUpload])

  const start = async () => {
    setBusy(true)
    const n = await runUploads(items, {
      language,
      source: 'upload',
      onChange: (key, patch) => setItems((s) => s.map((i) => (i.key === key ? { ...i, ...patch } : i))),
      onQuota: setQuota,
    })
    setBusy(false)
    if (n > 0) {
      toast.success(t('upload.success', { n }))
      void qc.invalidateQueries({ queryKey: ['recordings'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
      void qc.invalidateQueries({ queryKey: ['categories'] })
    }
    setItems((s) => {
      const left = s.filter((i) => i.state !== 'done')
      if (!left.length) setOpen(false)
      return left
    })
  }

  const close = () => {
    if (busy) return
    setOpen(false)
    setItems((s) => s.filter((i) => i.state !== 'error' && i.state !== 'done'))
  }

  const api = useMemo<UploadApi>(() => ({ openUpload, showQuota: setQuota }), [openUpload])
  const pending = items.filter((i) => i.state !== 'done').length

  return (
    <Ctx.Provider value={api}>
      {children}
      <input
        ref={input}
        type="file"
        multiple
        accept={AUDIO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <Sheet open={open} onClose={close} title={t('upload.title')}>
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-7 text-center transition hover:border-brand hover:bg-brand-soft"
          >
            <UploadCloud className="size-8 text-brand-text" aria-hidden />
            <span className="text-sm font-medium">{t('upload.choose')}</span>
            <span className="text-xs text-muted">
              {t('upload.limits', { mb: config.data?.max_upload_mb ?? 0, min: config.data?.max_audio_minutes ?? 0 })}
            </span>
          </button>
          {items.length > 0 && (
            <UploadList items={items} onRemove={(key) => setItems((s) => s.filter((i) => i.key !== key))} />
          )}
          <LanguageSelect value={language} onChange={setLanguage} />
          <Button className="w-full" size="lg" disabled={!pending} loading={busy} onClick={start} icon={<FolderOpen className="size-5" />}>
            {t('upload.start', { n: pending })}
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!quota} onClose={() => setQuota(null)} title={t('quota.title')}>
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            {t('quota.text', { minutes: config.data?.free_quota_minutes ?? 0 })}
            {quota?.remaining_seconds !== undefined && (
              <>
                {' '}
                {t('quota.remaining', { time: fmtDuration(quota.remaining_seconds) })}
              </>
            )}
            {quota?.duration ? <> {t('quota.fileLength', { time: fmtDuration(quota.duration) })}</> : null}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setQuota(null)}>
              {t('common.close')}
            </Button>
            <AnchorButton
              href={quota?.contact_url || config.data?.contact_url}
              target="_blank"
              rel="noopener noreferrer"
             
            >
              <MessageCircle className="size-4" aria-hidden />
              {t('quota.contact')}
            </AnchorButton>
          </div>
        </div>
      </Sheet>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex animate-fade items-center justify-center bg-brand/15 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-brand bg-surface/90 px-12 py-14 shadow-pop">
            <UploadCloud className="size-12 text-brand-text" aria-hidden />
            <p className="text-lg font-semibold">{t('upload.drop')}</p>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
