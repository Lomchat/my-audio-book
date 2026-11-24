import type { Me } from '../lib/types'
import { fmtDuration } from '../lib/format'
import { useT } from '../i18n'
import { ProgressBar } from './ui/Misc'

export function QuotaMeter({ me, compact }: { me: Me; compact?: boolean }) {
  const t = useT()
  const { limit_seconds: limit, used_seconds: used } = me.quota
  if (limit < 0) {
    return <p className="text-xs text-muted">{t('quota.unlimited')}</p>
  }
  const ratio = limit > 0 ? used / limit : 1
  return (
    <div className="space-y-1.5">
      <ProgressBar value={ratio} label={t('quota.label')} />
      <p className="text-xs text-muted tnum">
        {compact
          ? t('quota.compact', { used: fmtDuration(used), limit: fmtDuration(limit) })
          : t('quota.detail', { used: fmtDuration(used), limit: fmtDuration(limit), left: fmtDuration(Math.max(0, limit - used)) })}
      </p>
    </div>
  )
}
