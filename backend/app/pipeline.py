"""Processing pipeline for one recording: prepare → transcribe → diarize → summarize → index."""

from __future__ import annotations

import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

from .audio import AudioError, load_wav16k, to_playback, to_wav16k
from .config import get_settings
from .db import jdump, jload, now_iso
from .search import index_recording

log = logging.getLogger("pipeline")

PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899",
           "#8b5cf6", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#a855f7"]


class Engines:
    """Lazily-loaded models, kept in memory by the worker between jobs."""

    def __init__(self) -> None:
        self._stt = None
        self._diar = None

    @property
    def stt(self):
        if self._stt is None:
            from .stt import Transcriber
            self._stt = Transcriber()
        return self._stt

    @property
    def diarizer(self):
        if self._diar is None:
            from .diarize import Diarizer
            self._diar = Diarizer()
        return self._diar


def fmt_ts(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def transcript_for_llm(segments: list[dict[str, Any]], speakers: dict[str, str]) -> str:
    lines = []
    for seg in segments:
        who = ""
        if seg.get("sp"):
            who = (speakers.get(str(seg["sp"])) or f"Speaker {seg['sp']}") + ": "
        lines.append(f"[{fmt_ts(seg['s'])}] {who}{seg['t']}")
    return "\n".join(lines)


def recording_paths(rec: dict[str, Any]) -> tuple[Path, Path]:
    s = get_settings()
    folder = s.audio_dir / str(rec["user_id"]) / str(rec["id"])
    return folder / rec["audio_file"], folder / "playback.m4a"


def ensure_category(db: sqlite3.Connection, user_id: int, name: str) -> int | None:
    name = name.strip()
    if not name:
        return None
    r = db.execute("SELECT id FROM categories WHERE user_id = ? AND name = ?", (user_id, name)).fetchone()
    if r:
        return r["id"]
    n = db.execute("SELECT COUNT(*) FROM categories WHERE user_id = ?", (user_id,)).fetchone()[0]
    cur = db.execute("INSERT INTO categories(user_id, name, color, created_at) VALUES (?,?,?,?)",
                     (user_id, name, PALETTE[n % len(PALETTE)], now_iso()))
    return cur.lastrowid


class _Progress:
    def __init__(self, db: sqlite3.Connection, rec_id: int):
        self.db, self.rec_id, self.last = db, rec_id, 0.0

    def set(self, stage: str, value: float, force: bool = False) -> None:
        now = time.monotonic()
        if force or now - self.last > 1.5:
            self.last = now
            self.db.execute("UPDATE recordings SET stage = ?, progress = ?, updated_at = ? WHERE id = ?",
                            (stage, round(value, 4), now_iso(), self.rec_id))


def process(db: sqlite3.Connection, engines: Engines, rec_id: int) -> None:
    s = get_settings()
    rec = dict(db.execute("SELECT * FROM recordings WHERE id = ?", (rec_id,)).fetchone())
    original, playback = recording_paths(rec)
    progress = _Progress(db, rec_id)
    db.execute("UPDATE recordings SET status = 'processing', error = NULL WHERE id = ?", (rec_id,))
    progress.set("preparing", 0.01, force=True)

    wav = s.tmp_dir / f"{rec_id}.wav"
    try:
        to_wav16k(original, wav)
        if not playback.exists():
            to_playback(original, playback)
            db.execute("UPDATE recordings SET playback_file = ? WHERE id = ?", (playback.name, rec_id))
        audio = load_wav16k(wav)
    finally:
        wav.unlink(missing_ok=True)

    language = rec["language_hint"]
    if not language:
        progress.set("detecting", 0.03, force=True)
        language = engines.stt.detect_language(audio, s.language_list)
    db.execute("UPDATE recordings SET language = ? WHERE id = ?", (language, rec_id))

    progress.set("transcribing", 0.05, force=True)
    segments = engines.stt.transcribe(audio, language, lambda p: progress.set("transcribing", 0.05 + 0.75 * p))

    num_speakers = 0
    if s.diarization and segments and len(audio) / 16000 >= 5:
        progress.set("diarizing", 0.8, force=True)
        from .diarize import assign_speakers
        try:
            turns = engines.diarizer.run(audio, lambda p: progress.set("diarizing", 0.8 + 0.1 * p))
            segments, num_speakers = assign_speakers(segments, turns)
        except Exception:  # diarization is a bonus: never lose the transcript because of it
            log.exception("diarization failed for recording %s", rec_id)

    seg_json = [
        {"s": sg.start, "e": sg.end, "t": sg.text, "sp": sg.speaker,
         "w": [[w.start, w.end, w.text] for w in sg.words]}
        for sg in segments
    ]
    transcript = "\n".join(sg.text for sg in segments)
    speakers = {str(i): "" for i in range(1, num_speakers + 1)} if num_speakers > 1 else {}
    db.execute(
        "UPDATE recordings SET transcript = ?, segments = ?, num_speakers = ?, speakers = ?, updated_at = ? WHERE id = ?",
        (transcript, jdump(seg_json), num_speakers if num_speakers > 1 else 0, jdump(speakers), now_iso(), rec_id),
    )

    summarize(db, rec_id, progress)
    db.execute("UPDATE recordings SET status = 'done', stage = NULL, progress = 1, processed_at = ?, updated_at = ? "
               "WHERE id = ?", (now_iso(), now_iso(), rec_id))
    index_recording(db, rec_id)


def summarize(db: sqlite3.Connection, rec_id: int, progress: _Progress | None = None) -> None:
    from . import llm

    s = get_settings()
    rec = dict(db.execute("SELECT * FROM recordings WHERE id = ?", (rec_id,)).fetchone())
    user = dict(db.execute("SELECT * FROM users WHERE id = ?", (rec["user_id"],)).fetchone())
    segments = jload(rec["segments"], [])
    fallback_title = rec["title"] or _fallback_title(rec)

    if not segments:
        db.execute("UPDATE recordings SET summary_status = 'empty', title = ? WHERE id = ?", (fallback_title, rec_id))
        return
    if not s.llm_enabled:
        db.execute("UPDATE recordings SET summary_status = 'disabled', title = ? WHERE id = ?", (fallback_title, rec_id))
        return

    if progress:
        progress.set("summarizing", 0.92, force=True)
    else:
        db.execute("UPDATE recordings SET stage = 'summarizing', updated_at = ? WHERE id = ?", (now_iso(), rec_id))

    content_lang = rec["language"] if user["summary_lang"] == "auto" else user["summary_lang"]
    org_lang = user["ui_lang"] or "en"
    categories = [r["name"] for r in db.execute(
        "SELECT name FROM categories WHERE user_id = ? ORDER BY name", (user["id"],))]
    try:
        result = llm.analyze(transcript_for_llm(segments, jload(rec["speakers"], {})), categories,
                             content_lang, org_lang)
    except llm.LLMError as e:
        log.warning("summary failed for recording %s: %s", rec_id, e)
        db.execute("UPDATE recordings SET summary_status = 'error', title = ? WHERE id = ?", (fallback_title, rec_id))
        return

    # Keep a category chosen by hand; otherwise use the AI's choice.
    category_id = rec["category_id"] if rec.get("category_locked") else ensure_category(db, user["id"], result["category"])
    db.execute(
        """UPDATE recordings SET title = ?, summary = ?, key_points = ?, action_items = ?, tags = ?,
           category_id = COALESCE(?, category_id), summary_status = 'ok', updated_at = ? WHERE id = ?""",
        (result["title"] or fallback_title, result["summary"], jdump(result["key_points"]),
         jdump(result["action_items"]), jdump(result["tags"]), category_id, now_iso(), rec_id),
    )


def _fallback_title(rec: dict[str, Any]) -> str:
    words = (rec.get("transcript") or "").split()
    if words:
        return " ".join(words[:8]) + ("…" if len(words) > 8 else "")
    name = rec.get("original_name") or ""
    return name.rsplit(".", 1)[0] if name else "Recording"


def refund(db: sqlite3.Connection, rec_id: int) -> None:
    r = db.execute("SELECT user_id, duration FROM recordings WHERE id = ?", (rec_id,)).fetchone()
    if r:
        db.execute("UPDATE users SET used_seconds = MAX(0, used_seconds - ?) WHERE id = ?", (r["duration"], r["user_id"]))


def friendly_error(exc: Exception) -> str:
    if isinstance(exc, AudioError):
        return "audio_unreadable"
    return "processing_failed"
