import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Globe } from 'lucide-react'
import { useLang, useSetLang, useT } from '../i18n'
import { useConfig } from '../lib/queries'
import { Logo } from './ui/Misc'

export function LangToggle() {
  const lang = useLang()
  const setLang = useSetLang()
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-subtle hover:text-fg"
      aria-label={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      <Globe className="size-4" aria-hidden />
      {lang === 'fr' ? 'EN' : 'FR'}
    </button>
  )
}

export function Brand({ to = '/' }: { to?: string }) {
  const config = useConfig().data
  return (
    <Link to={to} className="flex items-center gap-2.5 font-semibold tracking-tight">
      <Logo size={30} />
      {config?.app_name ?? 'MyAudioBook'}
    </Link>
  )
}

export function PublicFooter() {
  const t = useT()
  const config = useConfig().data
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted sm:flex-row">
        <p>
          © {new Date().getFullYear()} {config?.app_name ?? 'MyAudioBook'} · Apache-2.0
        </p>
        <nav className="flex gap-5" aria-label="Footer">
          <Link to="/privacy" className="hover:text-fg">
            {t('legal.privacy')}
          </Link>
          <Link to="/terms" className="hover:text-fg">
            {t('legal.terms')}
          </Link>
          {config?.github_url && (
            <a href={config.github_url} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
              GitHub
            </a>
          )}
        </nav>
      </div>
    </footer>
  )
}

/** Simple page frame for legal pages. */
export function DocPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
      <PublicFooter />
    </div>
  )
}
