"""SQLite access: connections, schema migrations and small helpers.

We deliberately use the standard library ``sqlite3`` module: one file, no server,
full-text search with FTS5, and nothing to administer for self-hosters.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

from .config import get_settings

MIGRATIONS: list[str] = [
    # v1: initial schema
    """
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        has_password INTEGER NOT NULL DEFAULT 1,  -- 0 for accounts created with Google
        google_sub TEXT UNIQUE,
        is_disabled INTEGER NOT NULL DEFAULT 0,
        quota_seconds REAL,                 -- NULL = default free quota, -1 = unlimited
        used_seconds REAL NOT NULL DEFAULT 0,
        ui_lang TEXT,
        summary_lang TEXT NOT NULL DEFAULT 'auto',
        created_at TEXT NOT NULL,
        last_seen_at TEXT
    );

    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        user_agent TEXT
    );
    CREATE INDEX sessions_user ON sessions(user_id);

    CREATE TABLE api_tokens (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT
    );

    CREATE TABLE password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE categories (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        color TEXT NOT NULL,
        icon TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, name)
    );

    CREATE TABLE recordings (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        original_name TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'upload',
        mime TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        duration REAL NOT NULL DEFAULT 0,
        language TEXT,
        language_hint TEXT,
        status TEXT NOT NULL DEFAULT 'queued',   -- queued | processing | done | error
        stage TEXT,                               -- preparing | transcribing | diarizing | summarizing
        progress REAL NOT NULL DEFAULT 0,
        error TEXT,
        summary_status TEXT,                      -- NULL | ok | error | disabled
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        category_locked INTEGER NOT NULL DEFAULT 0,  -- 1 once the user picked the category by hand
        summary TEXT,
        key_points TEXT NOT NULL DEFAULT '[]',
        action_items TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        speakers TEXT NOT NULL DEFAULT '{}',
        num_speakers INTEGER NOT NULL DEFAULT 0,
        transcript TEXT,
        segments TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        audio_file TEXT,
        playback_file TEXT,
        recorded_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        processed_at TEXT
    );
    CREATE INDEX recordings_user_date ON recordings(user_id, created_at DESC);
    CREATE INDEX recordings_user_category ON recordings(user_id, category_id);

    CREATE TABLE jobs (
        id INTEGER PRIMARY KEY,
        recording_id INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,                       -- process | summarize
        status TEXT NOT NULL DEFAULT 'pending',   -- pending | running | done | error
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
    );
    CREATE INDEX jobs_status ON jobs(status, id);

    CREATE TABLE ai_usage (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
    );

    CREATE TABLE worker_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state TEXT NOT NULL,
        message TEXT,
        heartbeat_at TEXT NOT NULL
    );

    -- Full-text search. rowid = recordings.id
    CREATE VIRTUAL TABLE recordings_fts USING fts5(
        title, summary, transcript, tags,
        tokenize = 'unicode61 remove_diacritics 2'
    );
    -- Transcript chunks (~1 min each), used to ground the chat in the right passages.
    CREATE VIRTUAL TABLE chunks_fts USING fts5(
        text, recording_id UNINDEXED, user_id UNINDEXED, start UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
    );
    """,
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect() -> sqlite3.Connection:
    s = get_settings()
    conn = sqlite3.connect(s.db_path, timeout=30, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def migrate() -> None:
    conn = connect()
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for i, sql in enumerate(MIGRATIONS[version:], start=version + 1):
            conn.executescript("BEGIN;" + sql + f"; PRAGMA user_version={i}; COMMIT;")
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: one connection per request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def row(r: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(r) if r is not None else None


def jload(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def jdump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
