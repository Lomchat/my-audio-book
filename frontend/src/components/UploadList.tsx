import { AlertCircle, CheckCircle2, FileAudio, X } from 'lucide-react'
import type { UploadItem } from '../lib/uploads'
import { errorMessage, useT } from '../i18n'
import { ProgressBar } from './ui/Misc'
import { IconButton } from './ui/Button'

function size(bytes: number) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`
}

export function UploadList({ items, onRemove }: { items: UploadItem[]; onRemove?: (key: string) => void }) {
  const t = useT()
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="rounded-xl border border-line bg-bg p-3">
          <div className="flex items-center gap-3">
            <FileAudio className="size-5 shrink-0 text-brand-text" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{it.file.name}</p>
              <p className="text-xs text-muted tnum">
                {size(it.file.size)}
                {it.state === 'uploading' && ` · ${Math.round(it.progress * 100)}%`}
              </p>
            </div>
            {it.state === 'done' && <CheckCircle2 className="size-5 text-ok" aria-label={t('upload.done')} />}
            {it.state === 'error' && <AlertCircle className="size-5 text-danger" aria-hidden />}
            {it.state === 'ready' && onRemove && (
              <IconButton label={t('common.remove')} className="-my-2 -mr-2" onClick={() => onRemove(it.key)}>
                <X className="size-4" />
              </IconButton>
            )}
          </div>
          {it.state === 'uploading' && (
            <ProgressBar value={it.progress} label={it.file.name} className="mt-2.5" />
          )}
          {it.state === 'error' && (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {errorMessage(it.error, t)}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
