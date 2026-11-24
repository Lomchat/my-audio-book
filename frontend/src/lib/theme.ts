import { useEffect, useState } from 'react'
import type { ThemePref } from './types'

const KEY = 'mab.theme'
const dark = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const isDark = pref === 'dark' || (pref === 'system' && dark().matches)
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

export function setThemePref(pref: ThemePref) {
  if (pref === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, pref)
  applyTheme(pref)
}

/** Call once at startup: applies the theme and follows OS changes while on "system". */
export function initTheme() {
  applyTheme()
  dark().addEventListener('change', () => applyTheme())
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref)
  useEffect(() => applyTheme(pref), [pref])
  return [
    pref,
    (p) => {
      setThemePref(p)
      setPref(p)
    },
  ]
}
