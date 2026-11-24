import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, post } from '../lib/api'
import { useConfig, useMe } from '../lib/queries'
import { errorMessage, useLang, useT } from '../i18n'
import { Brand, LangToggle } from '../components/PublicLayout'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Form'
import { Card } from '../components/ui/Misc'

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app'
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center px-4 pt-safe pb-safe">
      <div className="flex w-full max-w-md items-center justify-between py-4">
        <Brand />
        <LangToggle />
      </div>
      <div className="flex w-full max-w-md flex-1 flex-col justify-center pb-16">
        <Card className="animate-pop p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </div>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function GoogleButton({ next }: { next: string }) {
  const t = useT()
  const config = useConfig().data
  if (!config?.google_auth) return null
  return (
    <>
      <a
        href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface px-4 text-sm font-medium shadow-card transition hover:bg-subtle active:scale-[0.98]"
      >
        <GoogleG />
        {t('auth.google')}
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-faint">
        <span className="h-px flex-1 bg-line" />
        {t('auth.or')}
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  )
}

function useAuthSubmit(path: string, build: () => unknown, next: string) {
  const t = useT()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await post(path, build())
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err, t))
      if (err instanceof ApiError && err.status === 0) setError(t('err.network_error'))
    } finally {
      setBusy(false)
    }
  }
  return { submit, error, busy }
}

function ErrorBox({ text }: { text: string }) {
  if (!text) return null
  return (
    <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {text}
    </p>
  )
}

function useRedirectIfLoggedIn(next: string) {
  const me = useMe()
  return me.data ? <Navigate to={next} replace /> : null
}

export function Login() {
  const t = useT()
  const config = useConfig().data
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useAuthSubmit('/api/auth/login', () => ({ email, password }), next)
  const urlError = params.get('error')
  const redirect = useRedirectIfLoggedIn(next)
  if (redirect) return redirect
  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <ErrorBox text={error || (urlError ? errorMessage(new ApiError(400, { code: urlError }), t) : '')} />
      <GoogleButton next={next} />
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.email')}>
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t('auth.password')}>
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {config?.password_reset && (
          <div className="text-right text-sm">
            <Link to="/forgot" className="text-brand-text hover:underline">
              {t('auth.forgotLink')}
            </Link>
          </div>
        )}
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.login')}
        </Button>
      </form>
      {config?.allow_signup !== false && (
        <p className="mt-6 text-center text-sm text-muted">
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-medium text-brand-text hover:underline">
            {t('auth.signup')}
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}

export function Signup() {
  const t = useT()
  const lang = useLang()
  const config = useConfig().data
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useAuthSubmit(
    '/api/auth/signup',
    () => ({ name, email, password, ui_lang: lang }),
    next,
  )
  const redirect = useRedirectIfLoggedIn(next)
  if (redirect) return redirect
  if (config && !config.allow_signup) {
    return (
      <AuthLayout title={t('auth.signupClosedTitle')} subtitle={t('err.signup_closed')}>
        <Link to="/login" className="text-sm font-medium text-brand-text hover:underline">
          {t('auth.login')}
        </Link>
      </AuthLayout>
    )
  }
  const urlError = params.get('error')
  return (
    <AuthLayout
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupSubtitle', { minutes: config?.free_quota_minutes ?? 0 })}
    >
      <ErrorBox text={error || (urlError ? errorMessage(new ApiError(400, { code: urlError }), t) : '')} />
      <GoogleButton next={next} />
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.name')}>
          {(id) => <Input id={id} autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('auth.email')}>
          {(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          {t('auth.signupCta')}
        </Button>
        <p className="text-center text-xs text-muted">
          {t('auth.agree')}{' '}
          <Link to="/terms" className="underline">
            {t('legal.terms')}
          </Link>{' '}
          &amp;{' '}
          <Link to="/privacy" className="underline">
            {t('legal.privacy')}
          </Link>
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-brand-text hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthLayout>
  )
}

export function Forgot() {
  const t = useT()
  const config = useConfig()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (config.data && !config.data.password_reset) return <Navigate to="/login" replace />
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await post('/api/auth/forgot', { email })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={sent ? undefined : t('auth.forgotSubtitle')}>
      {sent ? (
        <p role="status" className="rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">
          {t('auth.forgotSent')}
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorBox text={error} />
          <Field label={t('auth.email')}>
            {(id) => <Input id={id} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}>
            {t('auth.forgotCta')}
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-medium text-brand-text hover:underline">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </AuthLayout>
  )
}

export function Reset() {
  const t = useT()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const { submit, error, busy } = useAuthSubmit('/api/auth/reset', () => ({ token, password }), '/app')
  return (
    <AuthLayout title={t('auth.resetTitle')}>
      <ErrorBox text={error} />
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
          {(id) => (
            <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!token}>
          {t('auth.resetCta')}
        </Button>
      </form>
    </AuthLayout>
  )
}

