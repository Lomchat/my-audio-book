from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import mailer
from ..config import get_settings
from ..db import get_db, now_iso
from ..security import (
    burn_password_check, client_ip, create_session, destroy_session, hash_password, login_limiter,
    new_token, request_origin, require_csrf, reset_limiter, sha256, signup_limiter, verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"], dependencies=[Depends(require_csrf)])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(default="", max_length=80)
    ui_lang: str | None = Field(default=None, pattern="^(fr|en)$")


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class ForgotIn(BaseModel):
    email: str = Field(max_length=254)


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=200)


@router.post("/signup")
def signup(body: SignupIn, request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    s = get_settings()
    first_user = db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
    if not s.allow_signup and not first_user:  # a closed instance still lets its owner create the first account
        raise HTTPException(403, detail={"code": "signup_closed"})
    signup_limiter.check(client_ip(request))
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, detail={"code": "invalid_email"})
    if db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(409, detail={"code": "email_taken"})
    cur = db.execute(
        "INSERT INTO users(email, name, password_hash, ui_lang, created_at) VALUES (?,?,?,?,?)",
        (email, body.name.strip(), hash_password(body.password), body.ui_lang, now_iso()),
    )
    create_session(db, response, cur.lastrowid, request.headers.get("user-agent"))
    return {"ok": True}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    email = body.email.strip().lower()
    login_limiter.check(f"{client_ip(request)}|{email}")
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None:
        burn_password_check(body.password)
        raise HTTPException(401, detail={"code": "invalid_credentials"})
    if not user["has_password"] or not verify_password(user["password_hash"], body.password):
        raise HTTPException(401, detail={"code": "invalid_credentials"})
    if user["is_disabled"]:
        raise HTTPException(403, detail={"code": "account_disabled"})
    create_session(db, response, user["id"], request.headers.get("user-agent"))
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    destroy_session(db, request, response)
    return {"ok": True}


@router.post("/forgot")
def forgot(body: ForgotIn, request: Request, tasks: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)):
    s = get_settings()
    if not s.mail_enabled:
        raise HTTPException(501, detail={"code": "mail_disabled"})
    reset_limiter.check(client_ip(request))
    user = db.execute("SELECT id, email, ui_lang FROM users WHERE email = ?", (body.email.strip().lower(),)).fetchone()
    if user:
        token = new_token()
        expires = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        db.execute("INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES (?,?,?)",
                   (sha256(token), user["id"], expires))
        link = f"{request_origin(request)}/reset?token={token}"
        if user["ui_lang"] == "fr":
            subject = f"{s.app_name} : réinitialiser votre mot de passe"
            text = (f"Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n{link}\n\n"
                    "Si vous n'avez rien demandé, ignorez ce message.")
        else:
            subject = f"{s.app_name}: reset your password"
            text = (f"Hello,\n\nTo choose a new password, open this link (valid for 1 hour):\n{link}\n\n"
                    "If you did not ask for this, ignore this message.")
        tasks.add_task(mailer.send, user["email"], subject, text)
    return {"ok": True}  # same answer whether the account exists or not


@router.post("/reset")
def reset(body: ResetIn, request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    reset_limiter.check(client_ip(request))
    r = db.execute("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ?",
                   (sha256(body.token), now_iso())).fetchone()
    if r is None:
        raise HTTPException(400, detail={"code": "invalid_token"})
    db.execute("UPDATE password_resets SET used = 1 WHERE token_hash = ?", (r["token_hash"],))
    db.execute("UPDATE users SET password_hash = ?, has_password = 1 WHERE id = ?",
               (hash_password(body.password), r["user_id"]))
    db.execute("DELETE FROM sessions WHERE user_id = ?", (r["user_id"],))
    create_session(db, response, r["user_id"], request.headers.get("user-agent"))
    return {"ok": True}
