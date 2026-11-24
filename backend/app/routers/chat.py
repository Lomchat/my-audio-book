"""Chat with your recordings: grounded answers, streamed, with citations [#id @mm:ss]."""

from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Iterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import llm
from ..config import get_settings
from ..db import get_db, jload, now_iso
from ..pipeline import fmt_ts, transcript_for_llm
from ..search import search_chunks
from ..security import consume_ai_credit, current_user

router = APIRouter(prefix="/api", tags=["chat"])

MAX_FULL_TRANSCRIPT_CHARS = 400_000
MAX_CATALOG_CHARS = 120_000


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    recording_id: int | None = None


SYSTEM = """You are the assistant of {app}, an app where the user keeps their voice recordings (memos, meetings, calls, ideas), transcribed automatically.
Answer the user's question using ONLY the recordings material below. If the answer is not in it, say so plainly.
- Answer in the language of the user's question. Be concise and concrete; use short paragraphs or bullet lists.
- Cite your sources inline with the exact form [#ID] or [#ID @MM:SS] (ID = recording number, time = moment in the recording), right after the statement they support.
- Transcripts come from speech recognition and may contain errors.
Today is {today}.

{material}"""


def _catalog(db: sqlite3.Connection, user_id: int) -> str:
    rows = db.execute(
        """SELECT r.id, r.title, r.summary, r.tags, r.duration, COALESCE(r.recorded_at, r.created_at) AS date,
                  c.name AS category
           FROM recordings r LEFT JOIN categories c ON c.id = r.category_id
           WHERE r.user_id = ? AND r.status = 'done' ORDER BY r.id DESC LIMIT 500""",
        (user_id,),
    ).fetchall()
    parts, total = [], 0
    for r in rows:
        tags = ", ".join(jload(r["tags"], []))
        entry = (f"[#{r['id']}] {r['date'][:10]} · {r['title']} · {fmt_ts(r['duration'])}"
                 + (f" · {r['category']}" if r["category"] else "") + (f" · {tags}" if tags else "")
                 + f"\n{(r['summary'] or '').strip()[:700]}")
        total += len(entry)
        if total > MAX_CATALOG_CHARS:
            break
        parts.append(entry)
    return "\n\n".join(parts)


def build_material(db: sqlite3.Connection, user_id: int, question: str, recording_id: int | None) -> tuple[str, list[int]]:
    if recording_id is not None:
        rec = db.execute("SELECT * FROM recordings WHERE id = ? AND user_id = ?", (recording_id, user_id)).fetchone()
        if rec is None:
            raise HTTPException(404, detail={"code": "not_found"})
        if rec["status"] != "done":
            raise HTTPException(409, detail={"code": "not_ready"})
        segments = jload(rec["segments"], [])
        full = transcript_for_llm(segments, jload(rec["speakers"], {}))
        header = (f"<recording id=\"{rec['id']}\" title=\"{rec['title']}\" "
                  f"date=\"{(rec['recorded_at'] or rec['created_at'])[:10]}\">\n"
                  f"<summary>{rec['summary'] or ''}</summary>\n")
        if len(full) <= MAX_FULL_TRANSCRIPT_CHARS:
            return header + f"<transcript>\n{full}\n</transcript>\n</recording>", [rec["id"]]
        chunks = search_chunks(db, user_id, question, limit=25, recording_id=rec["id"])
        excerpt = "\n\n".join(c["text"] for c in chunks)
        return header + f"<excerpts>\n{excerpt}\n</excerpts>\n</recording>", [rec["id"]]

    catalog = _catalog(db, user_id)
    if not catalog:
        return "<recordings>none yet</recordings>", []
    chunks = search_chunks(db, user_id, question, limit=14)
    excerpts = "\n\n".join(f"<excerpt recording=\"#{c['recording_id']}\">\n{c['text']}\n</excerpt>" for c in chunks)
    material = f"<recordings_catalog>\n{catalog}\n</recordings_catalog>"
    if excerpts:
        material += f"\n\n<relevant_transcript_excerpts>\n{excerpts}\n</relevant_transcript_excerpts>"
    return material, []


@router.post("/chat")
def chat(body: ChatIn, user: dict = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    s = get_settings()
    if not s.llm_enabled:
        raise HTTPException(501, detail={"code": "llm_disabled"})
    if body.messages[-1].role != "user":
        raise HTTPException(422, detail={"code": "last_message_must_be_user"})
    question = body.messages[-1].content
    material, _ = build_material(db, user["id"], question, body.recording_id)
    consume_ai_credit(db, user)

    system = SYSTEM.replace("{app}", s.app_name).replace("{today}", now_iso()[:10]).replace("{material}", material)
    messages = [{"role": "system", "content": system}] + [m.model_dump() for m in body.messages[-20:]]

    # Recording titles, so the client can render citations as links.
    titles = {r["id"]: r["title"] for r in db.execute(
        "SELECT id, title FROM recordings WHERE user_id = ? AND status = 'done'", (user["id"],))}

    def events() -> Iterator[str]:
        cited: set[int] = set()
        buf = ""
        try:
            for delta in llm.stream(messages, max_tokens=3000):
                buf += delta
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        except llm.LLMError as e:
            yield f"data: {json.dumps({'error': 'llm_error', 'message': str(e)[:200]})}\n\n"
            return
        for m in re.finditer(r"\[#(\d+)", buf):
            rid = int(m.group(1))
            if rid in titles:
                cited.add(rid)
        sources = [{"id": rid, "title": titles[rid]} for rid in sorted(cited)]
        yield f"data: {json.dumps({'done': True, 'sources': sources}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

