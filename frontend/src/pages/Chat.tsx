import { ChatPanel } from '../components/ChatPanel'
import { useT } from '../i18n'

export function Chat() {
  const t = useT()
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{t('nav.chat')}</h1>
      <ChatPanel
        suggestions={['chat.s1', 'chat.s2', 'chat.s3', 'chat.s4']}
        stickyBottom="bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0"
      />
    </div>
  )
}
