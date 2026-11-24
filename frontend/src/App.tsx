import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RequireAuth } from './components/AppShell'
import { Landing } from './pages/Landing'
import { Forgot, Login, Reset, Signup } from './pages/Auth'
import { Privacy, Terms } from './pages/Legal'
import { Share } from './pages/Share'
import { Library } from './pages/Library'
import { RecordingPage } from './pages/RecordingPage'
import { Chat } from './pages/Chat'
import { Spinner } from './components/ui/Misc'
import { LinkButton } from './components/ui/Button'
import { useT } from './i18n'

// Heavier or rarely used screens are split into their own chunks.
const Record = lazy(() => import('./pages/Record').then((m) => ({ default: m.Record })))
const SearchPage = lazy(() => import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const Categories = lazy(() => import('./pages/Categories').then((m) => ({ default: m.Categories })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

function NotFound() {
  const t = useT()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold text-brand-gradient">404</p>
      <p className="text-muted">{t('notFound')}</p>
      <LinkButton to="/">{t('common.home')}</LinkButton>
    </div>
  )
}

export function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner className="size-6" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/share" element={<Share />} />
        <Route path="/app" element={<RequireAuth />}>
          <Route index element={<Library />} />
          <Route path="r/:id" element={<RecordingPage />} />
          <Route path="record" element={<Record />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="chat" element={<Chat />} />
          <Route path="categories" element={<Categories />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
