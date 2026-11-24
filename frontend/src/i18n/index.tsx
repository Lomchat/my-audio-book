import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, type Key } from './en'
import { fr } from './fr'
import { useMe } from '../lib/queries'
import type { Lang } from '../lib/types'
import { ApiError } from '../lib/api'

export type { Key }
const dictionaries: Record<Lang, Record<Key, string>> = { en, fr }
const STORAGE = 'mab.lang'

function detect(): Lang {
  const stored = localStorage.getItem(STORAGE)
  if (stored === 'fr' || stored === 'en') return stored
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export type TFn = (key: Key, params?: Record<string, string | number>) => string

interface I18nValue {
  lang: Lang
  t: TFn
  setLang: (l: Lang) => void
}

const Ctx = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const me = useMe()
  const [local, setLocal] = useState<Lang>(detect)
  const lang: Lang = me.data?.ui_lang ?? local

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE, l)
    setLocal(l)
  }, [])

  const value = useMemo<I18nValue>(() => {
    const dict = dictionaries[lang]
    const t: TFn = (key, params) => {
      let s = dict[key] ?? en[key] ?? key
      if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    }
    return { lang, t, setLang }
  }, [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('I18nProvider missing')
  return v
}
export const useT = () => useI18n().t
export const useLang = () => useI18n().lang
export const useSetLang = () => useI18n().setLang

/** Translate an API/network error into a user-facing message. */
export function errorMessage(err: unknown, t: TFn): string {
  if (!(err instanceof ApiError)) return t('err.unknown')
  const d = err.detail
  const key = `err.${err.code}` as Key
  if (!(key in en)) return t('err.unknown')
  return t(key, {
    max_mb: Number(d.max_mb ?? 0),
    max_minutes: Number(d.max_minutes ?? 0),
    retry: Number(d.retry_after ?? 0),
    limit: Number(d.limit ?? 0),
  })
}
