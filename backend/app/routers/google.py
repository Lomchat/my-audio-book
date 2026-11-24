"""Sign in with Google (OpenID Connect, authorization code flow with PKCE)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import sqlite3
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse

from ..config import get_settings
from ..db import get_db, now_iso
from ..security import create_session, hash_password, request_origin

log = logging.getLogger("google")
router = APIRouter(prefix="/api/auth/google", tags=["auth"])

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
COOKIE = "mab_oauth"
COOKIE_PATH = "/api/auth/google"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _safe_next(value: str | None) -> str:
    if value and value.startswith("/") and not value.startswith("//") and "\\" not in value:
        return value[:300]
    return "/app"


def _fail(code: str = "google_failed") -> RedirectResponse:
    resp = RedirectResponse(f"/login?error={code}", status_code=303)
    resp.delete_cookie(COOKIE, path=COOKIE_PATH)
    return resp


@router.get("/start")
def start(request: Request, next: str | None = None):
    s = get_settings()
    if not s.google_enabled:
        return _fail("google_disabled")
    state, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": f"{request_origin(request)}/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    resp = RedirectResponse(f"{AUTH_URL}?{urlencode(params)}", status_code=303)
    payload = _b64url(json.dumps({"s": state, "v": verifier, "n": _safe_next(next)}).encode())
    resp.set_cookie(COOKIE, payload, max_age=600, httponly=True, secure=s.cookie_secure, samesite="lax",
                    path=COOKIE_PATH)
    return resp


def _decode_id_token(id_token: str) -> dict:
    # The token comes straight from Google's token endpoint over TLS, so per OpenID Connect
    # (section 3.1.3.7) the claims can be trusted without verifying the signature.
    part = id_token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


@router.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None,
             db: sqlite3.Connection = Depends(get_db)):
    s = get_settings()
    raw = request.cookies.get(COOKIE)
    if error or not code or not state or not raw or not s.google_enabled:
        return _fail()
    try:
        saved = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    except ValueError:
        return _fail()
    if not hmac.compare_digest(str(saved.get("s", "")), state):
        return _fail()

    try:
        r = httpx.post(TOKEN_URL, timeout=20, data={
            "code": code,
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "redirect_uri": f"{request_origin(request)}/api/auth/google/callback",
            "grant_type": "authorization_code",
            "code_verifier": saved.get("v", ""),
        })
        r.raise_for_status()
        claims = _decode_id_token(r.json()["id_token"])
    except Exception:
        log.exception("Google token exchange failed")
        return _fail()

    if (claims.get("iss") not in ("https://accounts.google.com", "accounts.google.com")
            or claims.get("aud") != s.google_client_id or claims.get("exp", 0) < time.time()
            or not claims.get("email_verified") or not claims.get("sub") or not claims.get("email")):
        return _fail()

    sub, email = str(claims["sub"]), str(claims["email"]).lower()
    user = db.execute("SELECT * FROM users WHERE google_sub = ?", (sub,)).fetchone()
    if user is None:
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if user is not None:  # same verified email: link the Google identity to the existing account
            db.execute("UPDATE users SET google_sub = ? WHERE id = ?", (sub, user["id"]))
    if user is None:
        first_user = db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        if not s.allow_signup and not first_user:
            return _fail("signup_closed")
        locale = str(claims.get("locale") or "")
        cur = db.execute(
            "INSERT INTO users(email, name, password_hash, has_password, google_sub, ui_lang, created_at) "
            "VALUES (?,?,?,0,?,?,?)",
            (email, str(claims.get("name") or "")[:80], hash_password(secrets.token_urlsafe(32)), sub,
             "fr" if locale.startswith("fr") else None,
             now_iso()),
        )
        user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    if user["is_disabled"]:
        return _fail("account_disabled")

    resp = RedirectResponse(_safe_next(saved.get("n")), status_code=303)
    resp.delete_cookie(COOKIE, path=COOKIE_PATH)
    create_session(db, resp, user["id"], request.headers.get("user-agent"))
    return resp
