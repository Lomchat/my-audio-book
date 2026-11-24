import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Inbox,
  Library,
  LogOut,
  Mic,
  Moon,
  Plus,
  Search,
  Settings,
  Hourglass,
  MessagesSquare,
  Star,
  Upload,
  WifiOff,
} from 'lucide-react'
import { cn } from '../lib/cn'
import { post } from '../lib/api'
import { useCategories, useConfig, useMe, useTags, useWorkerStatus } from '../lib/queries'
import { useT } from '../i18n'
import { Avatar, Logo, Skeleton } from './ui/Misc'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'
import { Menu } from './ui/Menu'
import { UploadProvider, useUpload } from './UploadProvider'
import { QuotaMeter } from './QuotaMeter'
import { useThemePref } from '../lib/theme'

const sideLink = (active: boolean) =>
  cn(
    'flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition',
    active ? 'bg-brand-soft text-brand-text' : 'text-muted hover:bg-subtle hover:text-fg',
  )

export function RequireAuth() {
  const me = useMe()
  const loc = useLocation()
  if (me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Logo size={48} />
      </div>
    )
  }
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <Shell />
}

function Shell() {
  return (
    <UploadProvider>
      <ShellLayout />
    </UploadProvider>
  )
}

function ShellLayout() {
  const t = useT()
  const [newOpen, setNewOpen] = useState(false)
  const status = useWorkerStatus()
  const worker = status.data?.worker
  const loc = useLocation()
  const isPlayerPage = /^\/app\/r\//.test(loc.pathname)

  return (
    <div className="min-h-dvh lg:pl-64">
      <Sidebar onNew={() => setNewOpen(true)} />
      <MobileTopBar />
      {worker && !worker.online && (
        <Banner icon={<WifiOff className="size-4" />} text={t('worker.offline')} />
      )}
      {worker?.online && worker.state === 'loading' && (
        <Banner icon={<Hourglass className="size-4" />} text={t('worker.loading')} />
      )}
      <main
        className={cn(
          'mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-10 lg:pt-8',
          isPlayerPage ? 'pb-48 lg:pb-32' : 'pb-32 lg:pb-12',
        )}
      >
        <Outlet />
      </main>
      <TabBar onNew={() => setNewOpen(true)} />
      <NewSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

function Banner({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-xs font-medium text-warn">
      {icon}
      {text}
    </div>
  )
}

function NewSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const { openUpload } = useUpload()
  const row =
    'flex min-h-16 w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-brand/50 hover:bg-subtle active:scale-[0.98]'
  return (
    <Sheet open={open} onClose={onClose} title={t('new.title')}>
      <div className="space-y-3">
        <button
          type="button"
          className={row}
          onClick={() => {
            onClose()
            navigate('/app/record')
          }}
        >
          <span className="bg-brand-gradient flex size-11 items-center justify-center rounded-xl text-white">
            <Mic className="size-5" />
          </span>
          <span>
            <span className="block font-semibold">{t('new.record')}</span>
            <span className="block text-sm text-muted">{t('new.recordHint')}</span>
          </span>
        </button>
        <button
          type="button"
          className={row}
          onClick={() => {
            onClose()
            openUpload()
          }}
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
            <Upload className="size-5" />
          </span>
          <span>
            <span className="block font-semibold">{t('new.import')}</span>
            <span className="block text-sm text-muted">{t('new.importHint')}</span>
          </span>
        </button>
      </div>
    </Sheet>
  )
}

function Sidebar({ onNew }: { onNew: () => void }) {
  const t = useT()
  const me = useMe().data!
  const config = useConfig().data
  const cats = useCategories()
  const tags = useTags()
  const [params] = useSearchParams()
  const loc = useLocation()
  const onLibrary = loc.pathname === '/app'
  const activeCat = onLibrary ? params.get('cat') : null
  const fav = onLibrary && params.get('fav') === '1'
  const uncat = onLibrary && params.get('uncat') === '1'
  const activeTag = onLibrary ? params.get('tag') : null
  const all = onLibrary && !activeCat && !fav && !uncat && !activeTag
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [theme, setTheme] = useThemePref()

  const logout = async () => {
    await post('/api/auth/logout').catch(() => undefined)
    qc.clear()
    navigate('/', { replace: true })
  }
  const count = (n?: number) => (n === undefined ? null : <span className="ml-auto text-xs text-faint tnum">{n}</span>)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Logo size={30} />
        <span className="font-display text-lg font-extrabold tracking-tight text-brand-text">{config?.app_name ?? 'MyAudioBook'}</span>
      </div>
      <div className="px-3 pb-3">
        <Button className="w-full" icon={<Plus className="size-4" />} onClick={onNew}>
          {t('nav.new')}
        </Button>
      </div>
      <nav className="scroll-hide flex-1 space-y-5 overflow-y-auto px-3 pb-3" aria-label={t('nav.main')}>
        <div className="space-y-0.5">
          <NavLink to="/app" className={sideLink(all)}>
            <Library className="size-4" aria-hidden />
            {t('nav.all')}
            {count(cats.data?.total)}
          </NavLink>
          <NavLink to="/app?fav=1" className={sideLink(fav)}>
            <Star className="size-4" aria-hidden />
            {t('nav.favorites')}
            {count(cats.data?.favorites)}
          </NavLink>
          <NavLink to="/app?uncat=1" className={sideLink(uncat)}>
            <Inbox className="size-4" aria-hidden />
            {t('nav.uncategorized')}
            {count(cats.data?.uncategorized)}
          </NavLink>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-3">
            <h3 className="text-xs font-semibold tracking-wide text-faint uppercase">{t('nav.categories')}</h3>
            <NavLink to="/app/categories" className="text-xs text-faint hover:text-fg" aria-label={t('nav.manageCategories')}>
              {t('common.manage')}
            </NavLink>
          </div>
          <div className="space-y-0.5">
            {cats.isPending && <Skeleton className="mx-3 h-8" />}
            {cats.data?.items.map((c) => (
              <NavLink key={c.id} to={`/app?cat=${c.id}`} className={sideLink(activeCat === String(c.id))}>
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="truncate">{c.name}</span>
                {count(c.count)}
              </NavLink>
            ))}
          </div>
        </div>

        {!!tags.data?.items.length && (
          <div>
            <h3 className="mb-1 px-3 text-xs font-semibold tracking-wide text-faint uppercase">{t('nav.tags')}</h3>
            <div className="flex flex-wrap gap-1.5 px-2">
              {tags.data.items.slice(0, 10).map((tg) => (
                <NavLink
                  key={tg.name}
                  to={`/app?tag=${encodeURIComponent(tg.name)}`}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition',
                    activeTag === tg.name
                      ? 'border-transparent bg-brand-soft text-brand-text'
                      : 'border-line text-muted hover:bg-subtle',
                  )}
                >
                  #{tg.name}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-0.5 border-t border-line pt-3">
          <NavLink to="/app/search" className={({ isActive }) => sideLink(isActive)}>
            <Search className="size-4" aria-hidden />
            {t('nav.search')}
          </NavLink>
          <NavLink to="/app/chat" className={({ isActive }) => sideLink(isActive)}>
            <MessagesSquare className="size-4" aria-hidden />
            {t('nav.chat')}
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => sideLink(isActive)}>
            <Settings className="size-4" aria-hidden />
            {t('nav.settings')}
          </NavLink>
        </div>
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <QuotaMeter me={me} compact />
        <Menu
          up
          align="start"
          label={t('nav.userMenu')}
          trigger={
            <span className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 text-left transition hover:bg-subtle">
              <Avatar name={me.name || me.email} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{me.name || me.email}</span>
                {me.name && <span className="block truncate text-xs text-faint">{me.email}</span>}
              </span>
            </span>
          }
          items={[
            { label: t('nav.settings'), icon: <Settings className="size-4" />, onSelect: () => navigate('/app/settings') },
            {
              label: t('settings.theme'),
              icon: <Moon className="size-4" />,
              onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
            },
            { label: t('nav.logout'), icon: <LogOut className="size-4" />, onSelect: logout, danger: true, divider: true },
          ]}
        />
      </div>
    </aside>
  )
}

function MobileTopBar() {
  const me = useMe().data!
  const config = useConfig().data
  const navigate = useNavigate()
  const t = useT()
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <NavLink to="/app" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-display text-lg font-extrabold tracking-tight text-brand-text">{config?.app_name ?? 'MyAudioBook'}</span>
        </NavLink>
        <button
          type="button"
          aria-label={t('nav.settings')}
          className="flex size-11 items-center justify-center"
          onClick={() => navigate('/app/settings')}
        >
          <Avatar name={me.name || me.email} size={30} />
        </button>
      </div>
    </header>
  )
}

function TabBar({ onNew }: { onNew: () => void }) {
  const t = useT()
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-90',
      isActive ? 'text-brand-text' : 'text-faint',
    )
  return (
    <nav
      aria-label={t('nav.main')}
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center px-2">
        <NavLink to="/app" end className={tab}>
          <Library className="size-6" aria-hidden />
          {t('nav.library')}
        </NavLink>
        <NavLink to="/app/search" className={tab}>
          <Search className="size-6" aria-hidden />
          {t('nav.search')}
        </NavLink>
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label={t('nav.new')}
            onClick={onNew}
            className="bg-brand-gradient -mt-6 flex size-14 items-center justify-center rounded-full text-white shadow-pop ring-4 ring-surface transition active:scale-90"
          >
            <Plus className="size-7" />
          </button>
        </div>
        <NavLink to="/app/chat" className={tab}>
          <MessagesSquare className="size-6" aria-hidden />
          {t('nav.chatShort')}
        </NavLink>
        <NavLink to="/app/settings" className={tab}>
          <Settings className="size-6" aria-hidden />
          {t('nav.settings')}
        </NavLink>
      </div>
    </nav>
  )
}

