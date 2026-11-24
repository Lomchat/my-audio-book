from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..config import VERSION, get_settings
from ..db import get_db
from ..security import current_user

router = APIRouter(prefix="/api", tags=["meta"])


def worker_status(db: sqlite3.Connection) -> dict:
    r = db.execute("SELECT state, message, heartbeat_at FROM worker_state WHERE id = 1").fetchone()
    if r is None:
        return {"state": "offline", "online": False}
    beat = datetime.strptime(r["heartbeat_at"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    online = (datetime.now(timezone.utc) - beat).total_seconds() < 60 and r["state"] not in ("stopped", "error")
    return {"state": r["state"] if online else "offline", "online": online}


@router.get("/config")
def public_config():
    s = get_settings()
    return {
        "app_name": s.app_name,
        "version": VERSION,
        "allow_signup": s.allow_signup,
        "free_quota_minutes": s.free_quota_minutes,
        "contact_url": s.contact_url,
        "languages": s.language_list,
        "max_upload_mb": s.max_upload_mb,
        "max_audio_minutes": s.max_audio_minutes,
        "password_reset": s.mail_enabled,
        "google_auth": s.google_enabled,
        "llm_enabled": s.llm_enabled,
        "diarization": s.diarization,
        "github_url": s.github_url,
    }


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/status")
def status(_: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    queue = db.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('pending','running')").fetchone()[0]
    return {"worker": worker_status(db), "queue": queue}
