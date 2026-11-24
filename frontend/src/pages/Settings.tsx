import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, KeyRound, LogOut, MessageCircle, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { api, del, patch, post } from '../lib/api'
import { useConfig, useMe } from '../lib/queries'
import { useThemePref } from '../lib/theme'
import { fmtDate, parseDate } from '../lib/format'
import type { ApiToken, AudioLang, Lang, Me, ThemePref } from '../lib/types'
import { errorMessage, useLang, useSetLang, useT } from '../i18n'
import { QuotaMeter } from '../components/QuotaMeter'
import { AnchorButton, Button, IconButton } from '../components/ui/Button'
import { Field, Input, Segmented, Select } from '../components/ui/Form'
import { Card } from '../components/ui/Misc'
import { ConfirmDialog, Sheet } from '../components/ui/Sheet'
import { useToast } from '../components/ui/Toast'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  )
}

export function Settings() {
  const t = useT()
  const me = useMe().data!
  const config = useConfig().data
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.settings')}</h1>
      <ProfileSection me={me} />
      <PreferencesSection me={me} />
      <Section title={t('settings.usage')}>
        <QuotaMeter me={me} />
        {me.quota.limit_seconds >= 0 && config?.contact_url && (
          <AnchorButton href={config.contact_url} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">
            <MessageCircle className="size-4" aria-hidden />
            {t('quota.contact')}
          </AnchorButton>
        )}
        <p className="text-sm text-muted tnum">
          {t('settings.aiToday', {
            used: me.ai.used_today,
            limit: me.ai.limit < 0 ? '∞' : me.ai.limit,
          })}
        </p>
      </Section>
      <PasswordSection me={me} />
      <TokensSection />
      <AccountSection me={me} />
      <Link to="/app/categories" className="flex min-h-12 items-center rounded-2xl border border-line bg-surface px-5 text-sm font-medium shadow-card transition hover:bg-subtle lg:hidden">
        {t('nav.manageCategories')}
      </Link>
      <p className="pb-4 text-center text-xs text-faint">
        {config?.app_name} v{config?.version} ·{' '}
        <Link to="/privacy" className="underline">
          {t('legal.privacy')}
        </Link>{' '}
        ·{' '}
        <Link to="/terms" className="underline">
          {t('legal.terms')}
        </Link>
      </p>
    </div>
  )
}

function useMeUpdate() {
  const qc = useQueryClient()
  const toast = useToast()
  const t = useT()
  return useMutation({
    mutationFn: (body: Partial<Pick<Me, 'name' | 'ui_lang' | 'summary_lang'>>) => patch<Me>('/api/me', body),
    onSuccess: (data) => qc.setQueryData(['me'], data),
    onError: (e) => toast.error(errorMessage(e, t)),
  })
}

function ProfileSection({ me }: { me: Me }) {
  const t = useT()
  const toast = useToast()
  const [name, setName] = useState(me.name)
  const update = useMeUpdate()
  return (
    <Section title={t('settings.profile')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ name: name.trim() }, { onSuccess: () => toast.success(t('common.saved')) })
        }}
      >
        <Field label={t('auth.name')}>
          {(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('auth.email')}>{(id) => <Input id={id} value={me.email} readOnly disabled />}</Field>
        <Button type="submit" loading={update.isPending} disabled={name.trim() === me.name}>
          {t('common.save')}
        </Button>
      </form>
    </Section>
  )
}

function PreferencesSection({ me }: { me: Me }) {
  const t = useT()
  const lang = useLang()
  const setLang = useSetLang()
  const update = useMeUpdate()
  const [theme, setTheme] = useThemePref()
  return (
    <Section title={t('settings.preferences')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{t('settings.uiLang')}</span>
        <Segmented<Lang>
          label={t('settings.uiLang')}
          value={lang}
          onChange={(l) => {
            setLang(l)
            update.mutate({ ui_lang: l })
          }}
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
        />
      </div>
      <Field label={t('settings.summaryLang')} hint={t('settings.summaryLangHint')}>
        {(id) => (
          <Select id={id} value={me.summary_lang} onChange={(e) => update.mutate({ summary_lang: e.target.value as 'auto' | AudioLang })}>
            <option value="auto">{t('settings.sameAsAudio')}</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="he">עברית</option>
          </Select>
        )}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium">{t('settings.theme')}</span>
        <Segmented<ThemePref>
          label={t('settings.theme')}
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: t('theme.system') },
            { value: 'light', label: t('theme.light') },
            { value: 'dark', label: t('theme.dark') },
          ]}
        />
      </div>
    </Section>
  )
}

function PasswordSection({ me }: { me: Me }) {
  const t = useT()
  const toast = useToast()
  const qc = useQueryClient()
  const hasPassword = me.has_password !== false
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const change = useMutation({
    mutationFn: () => post('/api/me/password', hasPassword ? { current, new: next } : { new: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setError('')
      toast.success(t('common.saved'))
      void qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => setError(errorMessage(e, t)),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    change.mutate()
  }
  return (
    <Section title={hasPassword ? t('settings.password') : t('settings.setPassword')}>
      {me.google && (
        <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          {t('settings.google')}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        {hasPassword && (
          <Field label={t('settings.currentPassword')}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
        )}
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')} error={error}>
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Button type="submit" loading={change.isPending}>
          {hasPassword ? t('settings.changePassword') : t('settings.setPassword')}
        </Button>
      </form>
    </Section>
  )
}

function Code({ children }: { children: string }) {
  return <code className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[0.85em] break-all">{children}</code>
}

function TokensSection() {
  const t = useT()
  const lang = useLang()
  const toast = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => api<{ items: ApiToken[] }>('/api/me/tokens') })
  const create = useMutation({
    mutationFn: () => post<{ token: string }>('/api/me/tokens', { name: name.trim() }),
    onSuccess: (res) => {
      setCreated(res.token)
      setName('')
      void qc.invalidateQueries({ queryKey: ['tokens'] })
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => del(`/api/me/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tokens'] }),
  })
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('common.copied'))
    } catch {
      toast.error(t('err.unknown'))
    }
  }

  return (
    <Section title={t('tokens.title')} hint={t('tokens.hint')}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t('tokens.namePlaceholder')} aria-label={t('tokens.namePlaceholder')} />
        <Button type="submit" loading={create.isPending} disabled={!name.trim()} icon={<KeyRound className="size-4" />}>
          {t('common.create')}
        </Button>
      </form>

      {!!tokens.data?.items.length && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {tokens.data.items.map((tk) => (
            <li key={tk.id} className="flex items-center gap-3 py-1 ps-4 pe-1">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tk.name}</p>
                <p className="text-xs text-muted tnum">
                  {tk.prefix}… · {tk.last_used_at ? t('tokens.lastUsed', { date: fmtDate(parseDate(tk.last_used_at), lang) }) : t('tokens.neverUsed')}
                </p>
              </div>
              <IconButton label={t('common.delete')} onClick={() => remove.mutate(tk.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <details className="group rounded-xl border border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <Smartphone className="size-4 text-brand-text" aria-hidden />
          {t('shortcut.title')}
        </summary>
        <div className="space-y-3 border-t border-line px-4 py-4 text-sm text-muted">
          <p>{t('shortcut.intro')}</p>
          <ol className="list-decimal space-y-2 ps-5">
            <li>{t('shortcut.s1')}</li>
            <li>{t('shortcut.s2')}</li>
            <li>
              {t('shortcut.s3')} <Code>{`${window.location.origin}/api/recordings`}</Code>
            </li>
            <li>
              {t('shortcut.s4')} <Code>file</Code> ({t('shortcut.s4b')})
            </li>
            <li>
              {t('shortcut.s5')} <Code>Authorization</Code> = <Code>Bearer &lt;token&gt;</Code>
            </li>
            <li>{t('shortcut.s6')}</li>
          </ol>
          <p className="rounded-xl bg-subtle px-3.5 py-2.5">{t('shortcut.android')}</p>
        </div>
      </details>

      <Sheet open={!!created} onClose={() => setCreated(null)} title={t('tokens.createdTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('tokens.createdText')}</p>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-bg p-3">
            <code className="min-w-0 flex-1 font-mono text-sm break-all select-all">{created}</code>
            <IconButton label={t('common.copy')} onClick={() => created && void copy(created)}>
              <Copy className="size-4" />
            </IconButton>
          </div>
          <Button className="w-full" onClick={() => setCreated(null)}>
            {t('common.done')}
          </Button>
        </div>
      </Sheet>
    </Section>
  )
}

function AccountSection({ me }: { me: Me }) {
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const hasPassword = me.has_password !== false

  const logout = async () => {
    await post('/api/auth/logout').catch(() => undefined)
    qc.clear()
    navigate('/', { replace: true })
  }
  const remove = useMutation({
    mutationFn: () => post('/api/me/delete', hasPassword ? { password } : { confirm: 'DELETE' }),
    onSuccess: () => {
      qc.clear()
      navigate('/', { replace: true })
    },
    onError: (e) => setError(errorMessage(e, t)),
  })

  return (
    <Section title={t('settings.account')}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <AnchorButton href="/api/me/export" download variant="secondary">
          <Download className="size-4" aria-hidden />
          {t('settings.exportAll')}
        </AnchorButton>
        <Button variant="secondary" icon={<LogOut className="size-4" />} onClick={logout}>
          {t('nav.logout')}
        </Button>
      </div>
      <div className="border-t border-line pt-4">
        <p className="mb-3 text-sm text-muted">{t('settings.deleteHint')}</p>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>
          {t('settings.deleteAccount')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => {
          setConfirm(false)
          setError('')
          setPassword('')
          setPhrase('')
        }}
        title={t('settings.deleteAccount')}
        text={t('settings.deleteText')}
        confirmLabel={t('settings.deleteConfirm')}
        danger
        loading={remove.isPending}
        onConfirm={() => {
          if (hasPassword ? password : phrase === 'DELETE') remove.mutate()
        }}
      >
        <div className="mt-4">
          {hasPassword ? (
            <Field label={t('auth.password')} error={error}>
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
          ) : (
            <Field label={t('settings.typeDelete')} error={error}>
              {(id) => <Input id={id} value={phrase} placeholder="DELETE" autoCapitalize="characters" onChange={(e) => setPhrase(e.target.value)} />}
            </Field>
          )}
        </div>
      </ConfirmDialog>
    </Section>
  )
}
