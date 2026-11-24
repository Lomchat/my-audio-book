"""Client for any OpenAI-compatible chat completions API (OpenRouter by default).

Used for summaries, automatic categorization and the "ask your recordings" chat.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterator
from typing import Any

import httpx

from .config import get_settings

log = logging.getLogger("llm")

LANG_NAMES = {"fr": "French", "en": "English", "he": "Hebrew", "es": "Spanish", "de": "German",
              "it": "Italian", "pt": "Portuguese", "ar": "Arabic", "ru": "Russian", "nl": "Dutch"}


class LLMError(Exception):
    pass


def lang_name(code: str | None) -> str:
    return LANG_NAMES.get((code or "").lower(), code or "the language of the transcript")


def _headers() -> dict[str, str]:
    s = get_settings()
    h = {"Content-Type": "application/json", "X-Title": s.app_name, "HTTP-Referer": s.public_url}
    if s.llm_api_key:
        h["Authorization"] = f"Bearer {s.llm_api_key}"
    return h


def _body(messages: list[dict[str, str]], max_tokens: int, stream: bool) -> dict[str, Any]:
    s = get_settings()
    body: dict[str, Any] = {"model": s.llm_model, "messages": messages, "max_tokens": max_tokens, "stream": stream}
    if s.llm_reasoning_effort:
        body["reasoning"] = {"effort": s.llm_reasoning_effort}
    return body


def _url() -> str:
    return get_settings().llm_base_url.rstrip("/") + "/chat/completions"


def complete(messages: list[dict[str, str]], max_tokens: int = 4000) -> str:
    s = get_settings()
    if not s.llm_enabled:
        raise LLMError("LLM is not configured (LLM_API_KEY)")
    try:
        r = httpx.post(_url(), headers=_headers(), json=_body(messages, max_tokens, False), timeout=s.llm_timeout)
    except httpx.HTTPError as e:
        raise LLMError(f"LLM request failed: {e}") from e
    if r.status_code >= 400:
        raise LLMError(f"LLM HTTP {r.status_code}: {r.text[:300]}")
    data = r.json()
    if "error" in data:
        raise LLMError(f"LLM error: {str(data['error'])[:300]}")
    try:
        return data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError) as e:
        raise LLMError("Unexpected LLM response") from e


def stream(messages: list[dict[str, str]], max_tokens: int = 4000) -> Iterator[str]:
    """Yields text deltas."""
    s = get_settings()
    if not s.llm_enabled:
        raise LLMError("LLM is not configured (LLM_API_KEY)")
    with httpx.stream("POST", _url(), headers=_headers(), json=_body(messages, max_tokens, True),
                      timeout=s.llm_timeout) as r:
        if r.status_code >= 400:
            r.read()
            raise LLMError(f"LLM HTTP {r.status_code}: {r.text[:300]}")
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue  # SSE comments such as ": OPENROUTER PROCESSING"
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except ValueError:
                continue
            if "error" in chunk:
                raise LLMError(str(chunk["error"])[:300])
            for choice in chunk.get("choices", []):
                delta = (choice.get("delta") or {}).get("content")
                if delta:
                    yield delta


def parse_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise LLMError("No JSON object in LLM response")
    try:
        return json.loads(text[start:end + 1])
    except ValueError as e:
        raise LLMError("Invalid JSON in LLM response") from e


ANALYZE_SYSTEM = """You analyze transcripts of audio recordings made on a phone: voice memos, ideas, meetings, calls, lectures, journal entries.

Reply with ONE JSON object only, no other text, with exactly these keys:
{
  "title": "specific title, at most 8 words, no quotes",
  "summary": "2 to 6 sentences capturing what matters: the subject, decisions, conclusions",
  "key_points": ["0 to 7 short key points"],
  "action_items": ["tasks, to-dos or follow-ups explicitly mentioned; [] if none"],
  "category": "one category name",
  "tags": ["2 to 6 short lowercase tags"]
}

Rules:
- Write title, summary, key_points and action_items in {content_lang}.
- Write category and tags in {org_lang}.
- Category: reuse one of the user's existing categories when it fits, with its exact spelling. Otherwise create a new, broad category of 1 or 2 words, capitalized (e.g. "Work", "Ideas", "Health", "Family", "Finance", "Learning"), never a specific one.
- Existing categories: {categories}
- Be faithful to the transcript: do not invent facts. Transcription errors are possible; interpret obvious ones.
- If the recording is nearly empty or unintelligible, say so briefly in the summary."""


def analyze(transcript: str, categories: list[str], content_lang: str, org_lang: str) -> dict[str, Any]:
    system = (ANALYZE_SYSTEM
              .replace("{content_lang}", lang_name(content_lang))
              .replace("{org_lang}", lang_name(org_lang))
              .replace("{categories}", json.dumps(categories, ensure_ascii=False) if categories else "none yet"))
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"<transcript>\n{transcript}\n</transcript>"},
    ]
    last_error: Exception | None = None
    for _ in range(2):
        try:
            data = parse_json_object(complete(messages, max_tokens=3000))
            return _clean_analysis(data)
        except LLMError as e:
            last_error = e
            log.warning("analysis attempt failed: %s", e)
    raise LLMError(str(last_error))


def _str_list(v: Any, limit: int) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if str(x).strip()][:limit]


def _clean_analysis(d: dict[str, Any]) -> dict[str, Any]:
    tags = []
    for t in _str_list(d.get("tags"), 8):
        t = t.lower().lstrip("#").strip()[:40]
        if t and t not in tags:
            tags.append(t)
    return {
        "title": str(d.get("title") or "").strip().strip('"')[:120],
        "summary": str(d.get("summary") or "").strip(),
        "key_points": _str_list(d.get("key_points"), 10),
        "action_items": _str_list(d.get("action_items"), 15),
        "category": str(d.get("category") or "").strip()[:40],
        "tags": tags,
    }
