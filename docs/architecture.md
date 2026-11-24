# Architecture

## Components

| Component | Description |
| --- | --- |
| Web API | FastAPI application (`uvicorn app.main:app`). Serves the JSON API under `/api`, interactive docs at `/api/docs`, and the built React PWA (`frontend/dist`). |
| Worker | A separate process (`python -m app.worker`) running the processing pipeline, one job at a time. Same Docker image as the web API. |
| SQLite | A single database in WAL mode with FTS5 full-text indexes. Shared by the API and the worker. |
| Models | Whisper, speaker segmentation and speaker embedding models, downloaded to the data volume. |
| LLM | Any OpenAI-compatible API, called by the API (chat, re-summaries) and the worker (notes). |

## Data volume

```
/data
  myaudiobook.db                 SQLite database (plus -wal / -shm files)
  audio/<user>/<recording>/
    original.<ext>               the uploaded file, untouched
    playback.m4a                 compressed version used for playback
  models/                        downloaded models (whisper/, diarization/)
  tmp/                           temporary files
```

Back up `/data/myaudiobook.db` (with its WAL file, or via SQLite's backup mechanism) and `/data/audio`. `models/` can be re-downloaded.

## Pipeline

For each recording the worker runs:

1. **Prepare**: ffmpeg decodes the file, and a playback copy is created.
2. **Transcribe**: faster-whisper (Whisper large-v3-turbo, int8, CPU) with language auto-detection among `LANGUAGES`, unless the user forced a language.
3. **Diarize**: sherpa-onnx (pyannote segmentation 3.0 plus WeSpeaker embeddings) labels who spoke when (skipped when `DIARIZATION=false`).
4. **Summarize**: the transcript is sent to the LLM, which returns a title, summary, key points, action items, a category and tags.
5. **Index**: the transcript is chunked and added to the FTS5 indexes used for search and chat retrieval.

Progress is reported per stage and shown in the UI. If summarization fails (for example no LLM key), the transcript is kept and the summary can be regenerated later. Failed jobs can be retried from the app; the audio minutes consumed are refunded when processing fails.

## Job queue

The queue is a `jobs` table in SQLite. The API inserts a job when an upload is accepted. The worker atomically claims the oldest pending job (`UPDATE ... RETURNING`), and writes a heartbeat to `worker_state`, which the API uses to show whether the worker is online. No broker is needed. Models are loaded lazily and kept in memory between jobs.

## Quotas and limits

- **Audio minutes**: each account has a lifetime quota (`FREE_QUOTA_MINUTES`, overridable per user with `python -m app.manage quota`). The duration is added to the account's usage when an upload is accepted; uploads that would exceed the quota are rejected with HTTP 402.
- **Per-file limits**: `MAX_UPLOAD_MB` (checked from `Content-Length` before reading the body, then while streaming) and `MAX_AUDIO_MINUTES`.
- **AI limit**: chat messages and re-summaries count against `AI_DAILY_LIMIT` per user per day. Accounts with an unlimited quota are not limited.

## Authentication and security

- **Sessions**: a random token stored hashed (SHA-256) server side, sent as the `mab_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` when `PUBLIC_URL` is https). Lifetime `SESSION_DAYS`.
- **Passwords**: hashed with argon2. Login timing does not reveal whether an email exists. Sensitive endpoints are rate limited in memory per process.
- **CSRF**: state-changing requests authenticated by cookie must include the header `X-Requested-With: mab`. The unauthenticated auth endpoints (login, sign-up, reset) require it too.
- **API tokens**: `Authorization: Bearer mab_...`, stored hashed, revocable, up to 20 per user. Bearer requests do not need the CSRF header.
- **Google sign-in**: OpenID Connect authorization code flow with PKCE and a state cookie.
- **Security headers**: every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that only allows the microphone for the app itself. The Content-Security-Policy restricts everything to the same origin (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`; inline styles are allowed, images and media may use `data:` / `blob:`). The CSP is not applied to `/api/docs`.
- **Containers**: the image runs as an unprivileged user (uid 10001).
