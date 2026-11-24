"""Authentication: password hashing, session cookies, API tokens, CSRF guard, rate limits."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response

from .config import get_settings
from .db import get_db, now_iso

SESSION_COOKIE = "mab_session"
CSRF_HEADER = "x-requested-with"
_hasher = PasswordHasher()
# Used to keep login timing identical whether the email exists or not.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    try:
        return _hasher.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def burn_password_check(password: str) -> None:
    verify_password(_DUMMY_HASH, password)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_token(prefix: str = "") -> str:
    return prefix + secrets.token_urlsafe(32)


# --- Sessions ----------------------------------------------------------------


def create_session(db: sqlite3.Connection, response: Response, user_id: int, user_agent: str | None) -> None:
    s = get_settings()
    token = new_token()
    expires = datetime.now(timezone.utc) + timedelta(days=s.session_days)
    db.execute(
        "INSERT INTO sessions(token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
        (sha256(token), user_id, now_iso(), expires.strftime("%Y-%m-%dT%H:%M:%S.%fZ"), (user_agent or "")[:300]),
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=s.session_days * 86400,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        path="/",
    )


def destroy_session(db: sqlite3.Connection, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (sha256(token),))
    response.delete_cookie(SESSION_COOKIE, path="/")


def _user_from_request(request: Request, db: sqlite3.Connection) -> tuple[dict | None, bool]:
    """Returns (user, via_bearer_token)."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        r = db.execute(
            "SELECT u.*, t.id AS token_id FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
            (sha256(token),),
        ).fetchone()
        if r is None:
            return None, True
        db.execute("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", (now_iso(), r["token_id"]))
        return dict(r), True

    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None, False
    r = db.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        (sha256(token), now_iso()),
    ).fetchone()
    return (dict(r) if r else None), False


def current_user(request: Request, db: sqlite3.Connection = Depends(get_db)) -> dict:
    user, via_bearer = _user_from_request(request, db)
    if user is None:
        raise HTTPException(401, detail={"code": "unauthenticated"})
    if user["is_disabled"]:
        raise HTTPException(403, detail={"code": "account_disabled"})
    # CSRF: cookie-authenticated state-changing requests must carry a custom header,
    # which browsers never send cross-site without a CORS preflight (that we never allow).
    if not via_bearer and request.method not in ("GET", "HEAD", "OPTIONS"):
        if request.headers.get(CSRF_HEADER) != "mab":
            raise HTTPException(403, detail={"code": "csrf"})
    if not user.get("last_seen_at") or user["last_seen_at"][:13] != now_iso()[:13]:
        db.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now_iso(), user["id"]))
    return user


def require_csrf(request: Request) -> None:
    """For unauthenticated JSON endpoints (login, signup...)."""
    if request.headers.get(CSRF_HEADER) != "mab":
        raise HTTPException(403, detail={"code": "csrf"})


# --- Rate limiting (in memory, per process) ----------------------------------


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and q[0] < now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                raise HTTPException(429, detail={"code": "rate_limited", "retry_after": int(self.window - (now - q[0]))})
            q.append(now)


login_limiter = RateLimiter(10, 600)
signup_limiter = RateLimiter(5, 3600)
reset_limiter = RateLimiter(5, 3600)


def request_origin(request: Request) -> str:
    """The public origin the visitor is using, if it is one we serve (PUBLIC_URL or EXTRA_ORIGINS)."""
    allowed = get_settings().allowed_origins
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    for candidate in (f"{proto}://{host}", f"https://{host}"):
        if candidate in allowed:
            return candidate
    return allowed[0]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# --- Quotas ------------------------------------------------------------------


def quota_seconds(user: dict) -> float:
    """-1 means unlimited. Per-user quotas are set with `python -m app.manage quota`."""
    if user["quota_seconds"] is not None:
        return user["quota_seconds"]
    return get_settings().free_quota_seconds


def consume_ai_credit(db: sqlite3.Connection, user: dict) -> None:
    """Counts chat messages / re-summaries; raises 429 above the daily limit."""
    limit = get_settings().ai_daily_limit
    if limit < 0 or quota_seconds(user) < 0:  # unlimited accounts have no AI limit either
        return
    day = now_iso()[:10]
    db.execute(
        "INSERT INTO ai_usage(user_id, day, count) VALUES (?,?,1) "
        "ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1",
        (user["id"], day),
    )
    used = db.execute("SELECT count FROM ai_usage WHERE user_id = ? AND day = ?", (user["id"], day)).fetchone()[0]
    if used > limit:
        raise HTTPException(429, detail={"code": "ai_limit", "limit": limit})
