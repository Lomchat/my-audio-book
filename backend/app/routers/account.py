from __future__ import annotations

import io
import sqlite3
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..config import get_settings
from ..db import get_db, jdump, jload, now_iso
from ..security import (
    SESSION_COOKIE, current_user, hash_password, new_token, quota_seconds, sha256, verify_password,
)
from .recordings import _safe_filename, render_export

router = APIRouter(prefix="/api/me", tags=["account"])


def public_user(db: sqlite3.Connection, user: dict) -> dict:
    s = get_settings()
    ai_used = db.execute("SELECT count FROM ai_usage WHERE user_id = ? AND day = ?",
                         (user["id"], now_iso()[:10])).fetchone()
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "has_password": bool(user["has_password"]),
        "google": bool(user["google_sub"]),
        "ui_lang": user["ui_lang"],
        "summary_lang": user["summary_lang"],
        "created_at": user["created_at"],
        "quota": {"limit_seconds": quota_seconds(user), "used_seconds": round(user["used_seconds"], 1)},
        "ai": {"limit": -1 if quota_seconds(user) < 0 else s.ai_daily_limit, "used_today": ai_used[0] if ai_used else 0},
    }


@router.get("")
def me(user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    return public_user(db, user)


class MePatch(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    ui_lang: str | None = Field(default=None, pattern="^(fr|en)$")
    summary_lang: str | None = Field(default=None, pattern="^(auto|fr|en|he)$")


@router.patch("")
def patch_me(body: MePatch, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    sets = {k: v for k, v in body.model_dump().items() if v is not None}
    if sets:
        cols = ", ".join(f"{k} = ?" for k in sets)
        db.execute(f"UPDATE users SET {cols} WHERE id = ?", (*sets.values(), user["id"]))
    return public_user(db, dict(db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()))


class PasswordIn(BaseModel):
    current: str = Field(default="", max_length=200)
    new: str = Field(min_length=8, max_length=200)


@router.post("/password")
def change_password(body: PasswordIn, request: Request, user: dict = Depends(current_user),
                    db: sqlite3.Connection = Depends(get_db)):
    if user["has_password"] and not verify_password(user["password_hash"], body.current):
        raise HTTPException(400, detail={"code": "wrong_password"})
    db.execute("UPDATE users SET password_hash = ?, has_password = 1 WHERE id = ?",
               (hash_password(body.new), user["id"]))
    # Sign out every other session.
    keep = sha256(request.cookies.get(SESSION_COOKIE, ""))
    db.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user["id"], keep))
    return {"ok": True}


class DeleteIn(BaseModel):
    password: str = Field(default="", max_length=200)
    confirm: str = Field(default="", max_length=20)  # accounts without password type "DELETE"


@router.post("/delete")
def delete_account(body: DeleteIn, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if user["has_password"]:
        if not verify_password(user["password_hash"], body.password):
            raise HTTPException(400, detail={"code": "wrong_password"})
    elif body.confirm != "DELETE":
        raise HTTPException(400, detail={"code": "confirmation_required"})
    from ..manage import delete_user
    delete_user(db, user)
    resp = Response(status_code=204)
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


# --- API tokens (iOS Shortcut, scripts) ----------------------------------------


class TokenIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@router.get("/tokens")
def list_tokens(user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? "
                      "ORDER BY id DESC", (user["id"],)).fetchall()
    return {"items": [dict(r) for r in rows]}


@router.post("/tokens", status_code=201)
def create_token(body: TokenIn, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    if db.execute("SELECT COUNT(*) FROM api_tokens WHERE user_id = ?", (user["id"],)).fetchone()[0] >= 20:
        raise HTTPException(409, detail={"code": "too_many_tokens"})
    token = new_token("mab_")
    cur = db.execute("INSERT INTO api_tokens(user_id, name, token_hash, prefix, created_at) VALUES (?,?,?,?,?)",
                     (user["id"], body.name.strip(), sha256(token), token[:8], now_iso()))
    return {"id": cur.lastrowid, "name": body.name.strip(), "token": token}


@router.delete("/tokens/{token_id}", status_code=204)
def delete_token(token_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM api_tokens WHERE id = ? AND user_id = ?", (token_id, user["id"]))
    return Response(status_code=204)


# --- Export everything -----------------------------------------------------------


@router.get("/export")
def export_all(user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    cats = {r["id"]: r["name"] for r in db.execute("SELECT id, name FROM categories WHERE user_id = ?", (user["id"],))}
    rows = db.execute("SELECT * FROM recordings WHERE user_id = ? AND status = 'done' ORDER BY id",
                      (user["id"],)).fetchall()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        index = []
        for r in rows:
            rec = dict(r)
            cat = cats.get(rec["category_id"])
            folder = _safe_filename(cat or "_", "x")[:-2]
            name = f"{folder}/{rec['id']:05d} - {_safe_filename(rec['title'] or 'recording', 'md')}"
            z.writestr(name, render_export(rec, "md", cat))
            index.append({"id": rec["id"], "title": rec["title"], "category": cat, "file": name,
                          "date": rec["recorded_at"] or rec["created_at"], "duration": rec["duration"],
                          "language": rec["language"], "tags": jload(rec["tags"], [])})
        z.writestr("index.json", jdump(index))
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="myaudiobook-export.zip"'})
