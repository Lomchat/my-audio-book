from __future__ import annotations

import re
import shutil
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field

from .. import notify
from ..audio import AudioError, probe_duration
from ..config import get_settings
from ..db import get_db, jdump, jload, now_iso
from ..pipeline import ensure_category, fmt_ts, recording_paths
from ..search import index_recording
from ..security import consume_ai_credit, current_user, quota_seconds

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

LIST_FIELDS = ("id, title, duration, language, status, stage, progress, error, summary_status, category_id, tags, "
               "is_favorite, num_speakers, source, created_at, recorded_at, processed_at, substr(summary, 1, 280) "
               "AS summary_preview")


def _list_item(r: sqlite3.Row | dict) -> dict[str, Any]:
    d = dict(r)
    d["tags"] = jload(d.get("tags"), [])
    d["is_favorite"] = bool(d.get("is_favorite"))
    return d


def _detail(r: dict) -> dict[str, Any]:
    d = _list_item(r)
    for key, default in (("key_points", []), ("action_items", []), ("speakers", {}), ("segments", [])):
        d[key] = jload(d.get(key), default)
    for key in ("password_hash", "audio_file", "playback_file", "transcript", "summary_preview"):
        d.pop(key, None)
    d["category_locked"] = bool(d.get("category_locked"))
    return d


def _get_owned(db: sqlite3.Connection, rec_id: int, user: dict) -> dict:
    r = db.execute("SELECT * FROM recordings WHERE id = ? AND user_id = ?", (rec_id, user["id"])).fetchone()
    if r is None:
        raise HTTPException(404, detail={"code": "not_found"})
    return dict(r)


def _queue_positions(db: sqlite3.Connection) -> dict[int, int]:
    rows = db.execute("SELECT recording_id FROM jobs WHERE status = 'pending' ORDER BY id").fetchall()
    return {r["recording_id"]: i + 1 for i, r in enumerate(rows)}


# --- Upload --------------------------------------------------------------------

_EXT = re.compile(r"\.([A-Za-z0-9]{1,5})$")


@router.post("", status_code=201)
def upload(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    source: str = Form("upload"),
    recorded_at: str | None = Form(None),
    title: str | None = Form(None),
    user: dict = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    s = get_settings()
    language = language.lower()
    if language != "auto" and language not in s.language_list:
        raise HTTPException(422, detail={"code": "invalid_language"})
    if source not in ("upload", "record", "share", "api"):
        source = "upload"

    original_name = Path(file.filename or "audio").name[:200]
    m = _EXT.search(original_name)
    ext = m.group(1).lower() if m else "bin"
    now = now_iso()
    cur = db.execute(
        "INSERT INTO recordings(user_id, title, original_name, source, mime, language_hint, status, audio_file, "
        "recorded_at, created_at, updated_at) VALUES (?,?,?,?,?,?, 'uploading', ?,?,?,?)",
        (user["id"], (title or "").strip()[:200], original_name, source, (file.content_type or "")[:100],
         None if language == "auto" else language, f"original.{ext}", _valid_date(recorded_at), now, now),
    )
    rec_id = cur.lastrowid
    rec = {"id": rec_id, "user_id": user["id"], "audio_file": f"original.{ext}"}
    original, _ = recording_paths(rec)
    original.parent.mkdir(parents=True, exist_ok=True)

    def fail(status: int, detail: dict) -> HTTPException:
        db.execute("DELETE FROM recordings WHERE id = ?", (rec_id,))
        shutil.rmtree(original.parent, ignore_errors=True)
        return HTTPException(status, detail=detail)

    max_bytes = s.max_upload_mb * 1024 * 1024
    size = 0
    with original.open("wb") as out:
        while chunk := file.file.read(1 << 20):
            size += len(chunk)
            if size > max_bytes:
                out.close()
                raise fail(413, {"code": "file_too_large", "max_mb": s.max_upload_mb})
            out.write(chunk)
    try:
        duration = probe_duration(original)
    except AudioError:
        raise fail(415, {"code": "audio_unreadable"}) from None
    if duration > s.max_audio_minutes * 60:
        raise fail(413, {"code": "audio_too_long", "max_minutes": s.max_audio_minutes})

    quota = quota_seconds(user)
    if quota >= 0:
        ok = db.execute(
            "UPDATE users SET used_seconds = used_seconds + ? WHERE id = ? AND used_seconds + ? <= ? + 2",
            (duration, user["id"], duration, quota),
        ).rowcount
        if not ok:
            used = db.execute("SELECT used_seconds FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
            raise fail(402, {"code": "quota_exceeded", "remaining_seconds": max(0, quota - used),
                             "duration": duration, "contact_url": s.contact_url})
    else:
        db.execute("UPDATE users SET used_seconds = used_seconds + ? WHERE id = ?", (duration, user["id"]))

    db.execute("UPDATE recordings SET status = 'queued', size_bytes = ?, duration = ? WHERE id = ?",
               (size, duration, rec_id))
    db.execute("INSERT INTO jobs(recording_id, kind, created_at) VALUES (?, 'process', ?)", (rec_id, now_iso()))
    used = db.execute("SELECT used_seconds FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
    notify.recording(user, original_name, duration, source, used, quota)
    return _list_item(db.execute(f"SELECT {LIST_FIELDS} FROM recordings WHERE id = ?", (rec_id,)).fetchone())


def _valid_date(value: str | None) -> str | None:
    if value and re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", value):
        return value[:30]
    return None


# --- Listing -------------------------------------------------------------------


@router.get("")
def list_recordings(
    category_id: int | None = None,
    uncategorized: bool = False,
    tag: str | None = None,
    favorite: bool = False,
    limit: int = Query(50, ge=1, le=200),
    before_id: int | None = None,
    user: dict = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    where = ["user_id = ?", "status != 'uploading'"]
    params: list[Any] = [user["id"]]
    if category_id is not None:
        where.append("category_id = ?")
        params.append(category_id)
    if uncategorized:
        where.append("category_id IS NULL")
    if tag:
        where.append("EXISTS (SELECT 1 FROM json_each(recordings.tags) WHERE value = ?)")
        params.append(tag)
    if favorite:
        where.append("is_favorite = 1")
    if before_id:
        where.append("id < ?")
        params.append(before_id)
    rows = db.execute(
        f"SELECT {LIST_FIELDS} FROM recordings WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT ?",
        (*params, limit + 1),
    ).fetchall()
    items = [_list_item(r) for r in rows[:limit]]
    positions = _queue_positions(db) if any(i["status"] == "queued" for i in items) else {}
    for i in items:
        i["queue_position"] = positions.get(i["id"])
    return {"items": items, "has_more": len(rows) > limit}


@router.get("/status")
def statuses(ids: str = Query(..., max_length=2000), user: dict = Depends(current_user),
             db: sqlite3.Connection = Depends(get_db)):
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()][:100]
    if not id_list:
        return {"items": []}
    marks = ",".join("?" * len(id_list))
    rows = db.execute(
        f"SELECT {LIST_FIELDS} FROM recordings WHERE user_id = ? AND id IN ({marks})", (user["id"], *id_list)
    ).fetchall()
    positions = _queue_positions(db)
    items = [_list_item(r) | {"queue_position": positions.get(r["id"])} for r in rows]
    return {"items": items}


@router.get("/{rec_id}")
def get_recording(rec_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    d = _detail(_get_owned(db, rec_id, user))
    d["queue_position"] = _queue_positions(db).get(rec_id) if d["status"] == "queued" else None
    return d


class RecordingPatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    category_id: int | None = None
    category_name: str | None = Field(default=None, max_length=40)  # create-or-use by name
    clear_category: bool = False
    tags: list[str] | None = Field(default=None, max_length=20)
    is_favorite: bool | None = None
    speakers: dict[str, str] | None = None
    summary: str | None = Field(default=None, max_length=20000)


@router.patch("/{rec_id}")
def patch_recording(rec_id: int, body: RecordingPatch, user: dict = Depends(current_user),
                    db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    sets: dict[str, Any] = {}
    if body.title is not None:
        sets["title"] = body.title.strip()
    if body.clear_category:
        sets["category_id"] = None
        sets["category_locked"] = 1
    elif body.category_name:
        sets["category_id"] = ensure_category(db, user["id"], body.category_name)
        sets["category_locked"] = 1
    elif body.category_id is not None:
        if not db.execute("SELECT 1 FROM categories WHERE id = ? AND user_id = ?",
                          (body.category_id, user["id"])).fetchone():
            raise HTTPException(404, detail={"code": "category_not_found"})
        sets["category_id"] = body.category_id
        sets["category_locked"] = 1
    if body.tags is not None:
        tags: list[str] = []
        for t in body.tags:
            t = t.strip().lower().lstrip("#")[:40]
            if t and t not in tags:
                tags.append(t)
        sets["tags"] = jdump(tags)
    if body.is_favorite is not None:
        sets["is_favorite"] = int(body.is_favorite)
    if body.speakers is not None:
        current = jload(rec["speakers"], {})
        for k, v in body.speakers.items():
            if k in current:
                current[k] = v.strip()[:60]
        sets["speakers"] = jdump(current)
    if body.summary is not None:
        sets["summary"] = body.summary
    if sets:
        sets["updated_at"] = now_iso()
        cols = ", ".join(f"{k} = ?" for k in sets)
        db.execute(f"UPDATE recordings SET {cols} WHERE id = ?", (*sets.values(), rec_id))
        if rec["status"] == "done" and ({"title", "tags", "summary"} & sets.keys()):
            index_recording(db, rec_id)
    return get_recording(rec_id, user, db)


@router.delete("/{rec_id}", status_code=204)
def delete_recording(rec_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    if rec["status"] == "processing":
        raise HTTPException(409, detail={"code": "processing"})
    db.execute("DELETE FROM recordings WHERE id = ?", (rec_id,))
    db.execute("DELETE FROM recordings_fts WHERE rowid = ?", (rec_id,))
    db.execute("DELETE FROM chunks_fts WHERE recording_id = ?", (rec_id,))
    original, _ = recording_paths(rec)
    shutil.rmtree(original.parent, ignore_errors=True)
    return Response(status_code=204)


@router.post("/{rec_id}/resummarize")
def resummarize(rec_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    if rec["status"] != "done":
        raise HTTPException(409, detail={"code": "not_ready"})
    if not get_settings().llm_enabled:
        raise HTTPException(501, detail={"code": "llm_disabled"})
    if db.execute("SELECT 1 FROM jobs WHERE recording_id = ? AND status IN ('pending','running')",
                  (rec_id,)).fetchone():
        raise HTTPException(409, detail={"code": "already_queued"})
    consume_ai_credit(db, user)
    db.execute("UPDATE recordings SET stage = 'summarizing', updated_at = ? WHERE id = ?", (now_iso(), rec_id))
    db.execute("INSERT INTO jobs(recording_id, kind, created_at) VALUES (?, 'summarize', ?)", (rec_id, now_iso()))
    return get_recording(rec_id, user, db)


@router.post("/{rec_id}/retry")
def retry(rec_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    if rec["status"] != "error":
        raise HTTPException(409, detail={"code": "not_failed"})
    quota = quota_seconds(user)
    if quota >= 0:  # the failed attempt was refunded: reserve again
        ok = db.execute("UPDATE users SET used_seconds = used_seconds + ? WHERE id = ? AND used_seconds + ? <= ? + 2",
                        (rec["duration"], user["id"], rec["duration"], quota)).rowcount
        if not ok:
            raise HTTPException(402, detail={"code": "quota_exceeded", "contact_url": get_settings().contact_url})
    else:
        db.execute("UPDATE users SET used_seconds = used_seconds + ? WHERE id = ?", (rec["duration"], user["id"]))
    db.execute("UPDATE recordings SET status = 'queued', error = NULL, progress = 0, stage = NULL WHERE id = ?",
               (rec_id,))
    db.execute("INSERT INTO jobs(recording_id, kind, created_at) VALUES (?, 'process', ?)", (rec_id, now_iso()))
    return get_recording(rec_id, user, db)


# --- Files & exports -----------------------------------------------------------


def _safe_filename(title: str, ext: str) -> str:
    base = re.sub(r"[\\/:*?\"<>|\r\n]+", " ", title).strip()[:80] or "recording"
    return f"{base}.{ext}"


def _disposition(filename: str, inline: bool = False) -> str:
    ascii_name = filename.encode("ascii", "ignore").decode() or "recording"
    kind = "inline" if inline else "attachment"
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


@router.get("/{rec_id}/audio")
def audio(rec_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    original, playback = recording_paths(rec)
    if playback.exists():
        # no-cache: the browser revalidates (ETag), so access is re-checked on every play.
        return FileResponse(playback, media_type="audio/mp4", headers={"Cache-Control": "private, no-cache"})
    if original.exists():  # not converted yet: the browser may still be able to play the original
        return FileResponse(original, media_type=rec["mime"] or "application/octet-stream")
    raise HTTPException(404, detail={"code": "not_found"})


@router.get("/{rec_id}/download")
def download(rec_id: int, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    original, _ = recording_paths(rec)
    if not original.exists():
        raise HTTPException(404, detail={"code": "not_found"})
    ext = original.suffix.lstrip(".")
    return FileResponse(original, media_type=rec["mime"] or "application/octet-stream",
                        headers={"Content-Disposition": _disposition(_safe_filename(rec["title"] or "recording", ext))})


def _speaker_name(seg: dict, speakers: dict[str, str]) -> str:
    if not seg.get("sp"):
        return ""
    return speakers.get(str(seg["sp"])) or f"Speaker {seg['sp']}"


def _srt_time(t: float, sep: str) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def render_export(rec: dict, fmt: str, category: str | None) -> str:
    segments = jload(rec["segments"], [])
    speakers = jload(rec["speakers"], {})
    title = rec["title"] or "Recording"
    if fmt in ("srt", "vtt"):
        sep = "," if fmt == "srt" else "."
        blocks = []
        for i, seg in enumerate(segments, 1):
            who = _speaker_name(seg, speakers)
            text = f"{who}: {seg['t']}" if who else seg["t"]
            timing = f"{_srt_time(seg['s'], sep)} --> {_srt_time(seg['e'], sep)}"
            blocks.append(f"{i}\n{timing}\n{text}" if fmt == "srt" else f"{timing}\n{text}")
        body = "\n\n".join(blocks) + "\n"
        return ("WEBVTT\n\n" + body) if fmt == "vtt" else body

    lines_tr = []
    for seg in segments:
        who = _speaker_name(seg, speakers)
        lines_tr.append(f"[{fmt_ts(seg['s'])}] " + (f"{who}: " if who else "") + seg["t"])
    date = (rec["recorded_at"] or rec["created_at"])[:16].replace("T", " ")
    key_points = jload(rec["key_points"], [])
    actions = jload(rec["action_items"], [])
    tags = jload(rec["tags"], [])
    if fmt == "md":
        out = [f"# {title}", "", f"- **Date:** {date}", f"- **Duration:** {fmt_ts(rec['duration'])}"]
        if category:
            out.append(f"- **Category:** {category}")
        if tags:
            out.append("- **Tags:** " + ", ".join(f"#{t}" for t in tags))
        if rec["summary"]:
            out += ["", "## Summary", "", rec["summary"]]
        if key_points:
            out += ["", "## Key points", ""] + [f"- {p}" for p in key_points]
        if actions:
            out += ["", "## Action items", ""] + [f"- [ ] {a}" for a in actions]
        out += ["", "## Transcript", ""] + [line + "  " for line in lines_tr]
        return "\n".join(out) + "\n"
    out = [title, "=" * len(title), date]
    if rec["summary"]:
        out += ["", rec["summary"]]
    if key_points:
        out += [""] + [f"• {p}" for p in key_points]
    if actions:
        out += [""] + [f"☐ {a}" for a in actions]
    out += ["", "-" * 20, ""] + lines_tr
    return "\n".join(out) + "\n"


@router.get("/{rec_id}/export")
def export(rec_id: int, format: str = Query("md", pattern="^(md|txt|srt|vtt|json)$"),
           user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    rec = _get_owned(db, rec_id, user)
    cat = db.execute("SELECT name FROM categories WHERE id = ?", (rec["category_id"],)).fetchone() \
        if rec["category_id"] else None
    filename = _safe_filename(rec["title"] or "recording", format)
    headers = {"Content-Disposition": _disposition(filename)}
    if format == "json":
        d = _detail(rec)
        d["category"] = cat["name"] if cat else None
        return Response(jdump(d), media_type="application/json", headers=headers)
    media = {"md": "text/markdown", "txt": "text/plain", "srt": "application/x-subrip", "vtt": "text/vtt"}[format]
    return PlainTextResponse(render_export(rec, format, cat["name"] if cat else None),
                             media_type=f"{media}; charset=utf-8", headers=headers)
