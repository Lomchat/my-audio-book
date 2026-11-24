import { Navigate } from 'react-router'
import {
  ArrowRight,
  Code2,
  Globe2,
  ListChecks,
  Lock,
  MessageSquareText,
  Mic,
  Search,
  Share2,
  AudioLines,
  Tags,
  Users,
  Cog,
  Languages,
} from 'lucide-react'
import { useConfig, useMe } from '../lib/queries'
import { useT, type Key } from '../i18n'
import { Brand, LangToggle, PublicFooter } from '../components/PublicLayout'
import { AnchorButton, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Misc'

const FEATURES: { icon: typeof Mic; title: Key; text: Key }[] = [
  { icon: Languages, title: 'landing.f1.title', text: 'landing.f1.text' },
  { icon: ListChecks, title: 'landing.f2.title', text: 'landing.f2.text' },
  { icon: Tags, title: 'landing.f3.title', text: 'landing.f3.text' },
  { icon: Users, title: 'landing.f4.title', text: 'landing.f4.text' },
  { icon: Search, title: 'landing.f5.title', text: 'landing.f5.text' },
  { icon: Share2, title: 'landing.f6.title', text: 'landing.f6.text' },
  { icon: Code2, title: 'landing.f7.title', text: 'landing.f7.text' },
  { icon: Lock, title: 'landing.f8.title', text: 'landing.f8.text' },
]

const BARS = [30, 55, 40, 80, 60, 95, 45, 70, 100, 65, 85, 50, 75, 40, 90, 55, 35, 70, 45, 25]

function WaveVisual() {
  return (
    <div className="flex h-24 items-center justify-center gap-1.5" aria-hidden>
      {BARS.map((h, i) => (
        <span
          key={i}
          className="bg-brand-gradient w-1.5 origin-center animate-wave rounded-full sm:w-2"
          style={{ height: `${h}%`, animationDelay: `${(i * 97) % 900}ms`, animationDuration: `${900 + ((i * 131) % 700)}ms` }}
        />
      ))}
    </div>
  )
}

function ProductPreview() {
  const t = useT()
  return (
    <Card className="mx-auto w-full max-w-xl animate-float p-5 text-left shadow-pop sm:p-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-medium text-brand-text">{t('landing.demo.cat')}</span>
        <span className="tnum">12:41</span>
        <span>·</span>
        <span>FR</span>
        <span className="ml-auto flex items-center gap-1">
          <Users className="size-3.5" aria-hidden /> 2
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">{t('landing.demo.title')}</h3>
      <p className="mt-1.5 text-sm text-muted">{t('landing.demo.summary')}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {(['landing.demo.todo1', 'landing.demo.todo2'] as Key[]).map((k) => (
          <li key={k} className="flex items-center gap-2.5">
            <span className="size-4 shrink-0 rounded-md border-2 border-brand/60" aria-hidden />
            {t(k)}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-1.5 text-xs text-muted">
        {['#produit', '#roadmap', '#équipe'].map((x) => (
          <span key={x} className="rounded-full border border-line px-2.5 py-0.5">
            {x}
          </span>
        ))}
      </div>
    </Card>
  )
}

export function Landing() {
  const t = useT()
  const me = useMe()
  const config = useConfig().data
  if (me.data) return <Navigate to="/app" replace />
  const name = config?.app_name ?? 'MyAudioBook'
  const signupOpen = config?.allow_signup !== false

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="pt-safe sticky top-0 z-30 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Brand />
          <nav className="flex items-center gap-1" aria-label="Main">
            <a href="#features" className="hidden rounded-xl px-3 py-2 text-sm text-muted hover:text-fg sm:block">
              {t('landing.nav.features')}
            </a>
            <a href="#pricing" className="hidden rounded-xl px-3 py-2 text-sm text-muted hover:text-fg sm:block">
              {t('landing.nav.pricing')}
            </a>
            <LangToggle />
            <LinkButton to="/login" variant="ghost" size="sm">
              {t('auth.login')}
            </LinkButton>
            {signupOpen && (
              <LinkButton to="/signup" size="sm" className="max-sm:hidden">
                {t('landing.cta')}
              </LinkButton>
            )}
          </nav>
        </div>
      </header>

      <section className="relative px-5 pt-16 pb-20 text-center sm:pt-24">
        <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-muted shadow-card">
          <AudioLines className="size-3.5 text-brand-text" aria-hidden />
          {t('landing.badge')}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-6xl">
          <span className="text-brand-gradient">{name}</span>
          <span className="sr-only">. </span>
          <br />
          {t('landing.tagline')}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-balance text-muted">{t('landing.sub')}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton to={signupOpen ? '/signup' : '/login'} size="lg" className="w-full sm:w-auto">
            {signupOpen ? t('landing.cta') : t('auth.login')}
            <ArrowRight className="size-5" aria-hidden />
          </LinkButton>
          {signupOpen && (
            <p className="text-sm text-muted">{t('landing.ctaNote', { minutes: config?.free_quota_minutes ?? 0 })}</p>
          )}
        </div>
        <div className="mx-auto mt-14 max-w-xl">
          <WaveVisual />
        </div>
        <div className="mt-6 px-1">
          <ProductPreview />
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">{t('landing.featuresTitle')}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="p-5 transition hover:-translate-y-0.5 hover:border-brand/40">
              <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-semibold">{t(title)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(text)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">{t('landing.howTitle')}</h2>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { icon: Mic, k: 1 },
            { icon: Cog, k: 2 },
            { icon: MessageSquareText, k: 3 },
          ].map(({ icon: Icon, k }) => (
            <li key={k} className="relative rounded-2xl border border-line bg-surface p-6 shadow-card">
              <span className="bg-brand-gradient mb-4 flex size-9 items-center justify-center rounded-full text-sm font-bold text-white">
                {k}
              </span>
              <Icon className="absolute top-6 right-6 size-6 text-faint" aria-hidden />
              <h3 className="font-semibold">{t(`landing.step${k}.title` as Key)}</h3>
              <p className="mt-1.5 text-sm text-muted">{t(`landing.step${k}.text` as Key)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">{t('landing.pricingTitle')}</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Card className="border-brand/40 p-6 ring-4 ring-brand/10">
            <p className="text-sm font-semibold text-brand-text">{t('landing.free')}</p>
            <p className="mt-2 text-4xl font-bold tracking-tight tnum">
              {config?.free_quota_minutes ?? 0} <span className="text-lg font-medium text-muted">min</span>
            </p>
            <p className="mt-2 text-sm text-muted">{t('landing.freeText')}</p>
            <LinkButton to={signupOpen ? '/signup' : '/login'} className="mt-6 w-full">
              {t('landing.cta')}
            </LinkButton>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-semibold text-muted">{t('landing.more')}</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">{t('landing.moreTitle')}</p>
            <p className="mt-2 text-sm text-muted">{t('landing.moreText')}</p>
            <AnchorButton
              href={config?.contact_url}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              className="mt-6 w-full"
            >
              {t('landing.contact')}
            </AnchorButton>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <Globe2 className="size-9 text-brand-text" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight">{t('landing.ossTitle')}</h2>
          <p className="max-w-lg text-muted">{t('landing.ossText')}</p>
          {config?.github_url && (
            <AnchorButton href={config.github_url} target="_blank" rel="noopener noreferrer" variant="secondary">
              <Code2 className="size-4" aria-hidden />
              {t('landing.ossCta')}
            </AnchorButton>
          )}
        </Card>
      </section>

      <PublicFooter />
    </div>
  )
}
