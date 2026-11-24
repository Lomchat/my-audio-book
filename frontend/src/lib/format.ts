/** Formatting helpers (all locale-aware through Intl). */

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Compact human duration: "1 h 05", "12 min", "4 min 33 s", "45 s". Never rounds short durations up. */
export function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds)
  if (s < 60) return `${s} s`
  if (s < 600) return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function recDate(r: { recorded_at: string | null; created_at: string }): Date {
  return parseDate(r.recorded_at || r.created_at)
}

/** Backend timestamps are UTC; naive strings are treated as UTC. */
export function parseDate(value: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : value + 'Z')
}

export function fmtTime(d: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d)
}

export function fmtDate(d: Date, lang: string, withYear = true): string {
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) }).format(d)
}

export function fmtDateTime(d: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function dayLabel(d: Date, lang: string, labels: { today: string; yesterday: string }): string {
  const now = new Date()
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000)
  if (diff === 0) return labels.today
  if (diff === 1) return labels.yesterday
  if (diff < 7 && diff > 0) return new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(d)
  return new Intl.DateTimeFormat(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(d)
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function fmtNumber(n: number, lang: string, digits = 0): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n)
}

export const LANG_BADGE: Record<string, string> = { fr: 'FR', en: 'EN', he: 'HE' }

export function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`
}

export const AUDIO_ACCEPT =
  'audio/*,video/*,.m4a,.amr,.3gp,.opus,.ogg,.oga,.wav,.mp3,.aac,.webm,.flac,.caf'

/** Split a search snippet on the \u0002 \u0003 markers into plain and highlighted parts. */
export function splitHighlight(s: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = []
  let mark = false
  let cur = ''
  for (const ch of s) {
    if (ch === '\u0002' || ch === '\u0003') {
      if (cur) out.push({ text: cur, mark })
      cur = ''
      mark = ch === '\u0002'
    } else cur += ch
  }
  if (cur) out.push({ text: cur, mark })
  return out
}
