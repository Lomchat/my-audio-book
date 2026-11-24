import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useMe } from '../lib/queries'
import { runUploads, toItems, type UploadItem } from '../lib/uploads'
import { useT } from '../i18n'
import { Brand, LangToggle } from '../components/PublicLayout'
import { UploadList } from '../components/UploadList'
import { LanguageSelect, UploadProvider, useUpload } from '../components/UploadProvider'
import { Button, LinkButton } from '../components/ui/Button'
import { Card, EmptyState, Spinner } from '../components/ui/Misc'

const CACHE = 'shared-files'

/** Read the files that the service worker stored when the app received a share. */
async function readShared(): Promise<File[]> {
  if (!('caches' in window)) return []
  const cache = await caches.open(CACHE)
  const files: File[] = []
  for (const req of await cache.keys()) {
    const res = await cache.match(req)
    if (!res) continue
    const blob = await res.blob()
    const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'audio')
    const modified = Number(res.headers.get('X-File-Modified')) || Date.now()
    files.push(new File([blob], name, { type: res.headers.get('Content-Type') ?? blob.type, lastModified: modified }))
  }
  return files
}

async function clearShared() {
  const cache = await caches.open(CACHE)
  for (const k of await cache.keys()) await cache.delete(k)
}

export function Share() {
  const me = useMe()
  if (me.isPending) return null
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent('/share')}`} replace />
  return (
    <UploadProvider>
      <ShareInner />
    </UploadProvider>
  )
}

function ShareInner() {
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { showQuota } = useUpload()
  const [items, setItems] = useState<UploadItem[] | null>(null)
  const [language, setLanguage] = useState('auto')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    readShared()
      .then((f) => setItems(toItems(f)))
      .catch(() => setItems([]))
  }, [])

  const start = async () => {
    if (!items) return
    setBusy(true)
    const n = await runUploads(items, {
      language,
      source: 'share',
      onChange: (key, patch) => setItems((s) => s?.map((i) => (i.key === key ? { ...i, ...patch } : i)) ?? s),
      onQuota: showQuota,
    })
    setBusy(false)
    if (n > 0) {
      void qc.invalidateQueries({ queryKey: ['recordings'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
    }
    // `items` is stale here: re-read the latest state before deciding.
    setItems((s) => {
      const failed = s?.some((i) => i.state !== 'done')
      if (!failed) {
        void clearShared().then(() => navigate('/app', { replace: true }))
      }
      return s
    })
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-safe pb-safe">
      <div className="flex items-center justify-between py-4">
        <Brand to="/app" />
        <LangToggle />
      </div>
      {items === null ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Upload className="size-7" />} title={t('share.emptyTitle')} text={t('share.emptyText')}>
          <LinkButton to="/app">{t('share.toLibrary')}</LinkButton>
        </EmptyState>
      ) : (
        <Card className="space-y-4 p-5">
          <h1 className="text-xl font-semibold tracking-tight">{t('share.title')}</h1>
          <UploadList items={items} />
          <LanguageSelect value={language} onChange={setLanguage} />
          <Button className="w-full" size="lg" loading={busy} onClick={start}>
            {t('upload.start', { n: items.filter((i) => i.state !== 'done').length })}
          </Button>
          <Link to="/app" onClick={() => void clearShared()} className="block text-center text-sm text-muted hover:text-fg">
            {t('common.cancel')}
          </Link>
        </Card>
      )}
    </div>
  )
}
