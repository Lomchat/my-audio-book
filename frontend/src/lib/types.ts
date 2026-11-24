export type Lang = 'fr' | 'en'
export type AudioLang = 'fr' | 'en' | 'he'
export type ThemePref = 'system' | 'light' | 'dark'

export interface AppConfig {
  app_name: string
  version: string
  allow_signup: boolean
  free_quota_minutes: number
  contact_url: string
  languages: string[]
  max_upload_mb: number
  max_audio_minutes: number
  password_reset: boolean
  llm_enabled: boolean
  diarization: boolean
  github_url: string
  google_auth?: boolean
  transcript_review?: boolean
}

export interface Me {
  id: number
  email: string
  name: string
  ui_lang: Lang | null
  summary_lang: 'auto' | AudioLang
  created_at: string
  quota: { limit_seconds: number; used_seconds: number }
  ai: { limit: number; used_today: number }
  has_password?: boolean
  google?: boolean
}

export type RecStatus = 'uploading' | 'queued' | 'processing' | 'done' | 'error'
export type RecStage = 'preparing' | 'detecting' | 'transcribing' | 'diarizing' | 'summarizing'

export interface Recording {
  id: number
  title: string
  duration: number
  language: string | null
  status: RecStatus
  stage: RecStage | null
  progress: number
  error: 'audio_unreadable' | 'processing_failed' | null
  summary_status: 'ok' | 'error' | 'disabled' | 'empty' | null
  category_id: number | null
  tags: string[]
  is_favorite: boolean
  num_speakers: number
  source: string
  created_at: string
  recorded_at: string | null
  processed_at: string | null
  summary_preview: string | null
  queue_position?: number | null
}

export interface Segment {
  s: number
  e: number
  t: string
  sp: number | null
  w?: [number, number, string][]
}

export interface RecordingDetail extends Recording {
  summary: string
  key_points: string[]
  action_items: string[]
  speakers: Record<string, string>
  segments: Segment[]
  category_locked: boolean
}

export interface Category {
  id: number
  name: string
  color: string
  icon: string | null
  count: number
}

export interface CategoriesResponse {
  items: Category[]
  total: number
  uncategorized: number
  favorites: number
}

export interface SearchHit {
  id: number
  title: string
  duration: number
  created_at: string
  recorded_at: string | null
  language: string | null
  category_id: number | null
  tags: string[]
  status: RecStatus
  snippet: string
}

export interface WorkerStatus {
  worker: { state: string; online: boolean }
  queue: number
}

export interface ApiToken {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}



export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: { id: number; title: string }[]
  error?: string
}
