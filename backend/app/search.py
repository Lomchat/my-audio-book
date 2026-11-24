"""Full-text search (SQLite FTS5) over recordings and transcript chunks."""

from __future__ import annotations

import re
import sqlite3
from typing import Any

from .db import jload

# Marks around matches in snippets; the frontend turns them into <mark> safely.
HL_START, HL_END = "\u0002", "\u0003"

_WORD = re.compile(r"[\w֐-׿]+", re.UNICODE)
STOPWORDS = set(
    "le la les un une des du de et ou en au aux ce ces cet cette que qui quoi dans pour par sur avec sans est sont "
    "pas plus mais donc car je tu il elle on nous vous ils elles mon ma mes ton ta tes son sa ses leur leurs "
    "a à y ne se sa été être avoir fait faire quand comment pourquoi quel quelle quels quelles "
    "the a an and or of to in on at for with by from is are was were be been it this that these those what "
    "which who how why when where do does did i you he she we they my your his her our their about "
    "של את על עם זה זו הוא היא אני אתה מה לא כן גם אם כי או".split()
)


def terms(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if len(w) > 1]


def match_query(text: str, mode: str = "and") -> str | None:
    """Builds a safe FTS5 query: each term quoted, prefix-matched."""
    words = terms(text)
    if mode == "or":
        words = [w for w in words if w not in STOPWORDS and len(w) > 2] or words
    words = list(dict.fromkeys(words))[:12]
    if not words:
        return None
    joiner = " OR " if mode == "or" else " AND "
    return joiner.join(f'"{w}"*' for w in words)


def index_recording(db: sqlite3.Connection, rec_id: int) -> None:
    r = db.execute("SELECT id, user_id, title, summary, transcript, tags, segments FROM recordings WHERE id = ?",
                   (rec_id,)).fetchone()
    db.execute("DELETE FROM recordings_fts WHERE rowid = ?", (rec_id,))
    db.execute("DELETE FROM chunks_fts WHERE recording_id = ?", (rec_id,))
    if r is None:
        return
    db.execute(
        "INSERT INTO recordings_fts(rowid, title, summary, transcript, tags) VALUES (?,?,?,?,?)",
        (rec_id, r["title"] or "", r["summary"] or "", r["transcript"] or "", " ".join(jload(r["tags"], []))),
    )
    for start, text in _chunks(jload(r["segments"], [])):
        db.execute("INSERT INTO chunks_fts(text, recording_id, user_id, start) VALUES (?,?,?,?)",
                   (text, rec_id, r["user_id"], start))


def _ts(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def _chunks(segments: list[dict[str, Any]], seconds: float = 60.0) -> list[tuple[float, str]]:
    """~1-minute chunks; each sentence keeps its timestamp so answers can cite the exact moment."""
    out: list[tuple[float, str]] = []
    cur: list[str] = []
    cur_start: float | None = None
    for seg in segments:
        if cur_start is None:
            cur_start = seg["s"]
        cur.append(f"[@{_ts(seg['s'])}] {seg['t']}")
        if seg["e"] - cur_start >= seconds:
            out.append((cur_start, " ".join(cur)))
            cur, cur_start = [], None
    if cur and cur_start is not None:
        out.append((cur_start, " ".join(cur)))
    return out


def search_recordings(db: sqlite3.Connection, user_id: int, q: str, limit: int = 30) -> list[dict[str, Any]]:
    mq = match_query(q)
    if not mq:
        return []
    rows = db.execute(
        f"""
        SELECT r.id, r.title, r.duration, r.created_at, r.recorded_at, r.language, r.category_id, r.tags, r.status,
               snippet(recordings_fts, 2, '{HL_START}', '{HL_END}', '…', 18) AS snip_transcript,
               snippet(recordings_fts, 1, '{HL_START}', '{HL_END}', '…', 18) AS snip_summary,
               bm25(recordings_fts, 8.0, 3.0, 1.0, 4.0) AS rank
        FROM recordings_fts JOIN recordings r ON r.id = recordings_fts.rowid
        WHERE recordings_fts MATCH ? AND r.user_id = ?
        ORDER BY rank LIMIT ?
        """,
        (mq, user_id, limit),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["tags"] = jload(d["tags"], [])
        snip = d.pop("snip_transcript")
        alt = d.pop("snip_summary")
        d["snippet"] = snip if HL_START in snip else (alt if HL_START in alt else snip)
        d.pop("rank")
        out.append(d)
    return out


def search_chunks(db: sqlite3.Connection, user_id: int, q: str, limit: int = 12,
                  recording_id: int | None = None) -> list[dict[str, Any]]:
    mq = match_query(q, mode="or")
    if not mq:
        return []
    sql = ("SELECT recording_id, start, text FROM chunks_fts WHERE chunks_fts MATCH ? AND user_id = ?"
           + (" AND recording_id = ?" if recording_id else "") + " ORDER BY bm25(chunks_fts) LIMIT ?")
    params: list[Any] = [mq, user_id] + ([recording_id] if recording_id else []) + [limit]
    return [dict(r) for r in db.execute(sql, params).fetchall()]
