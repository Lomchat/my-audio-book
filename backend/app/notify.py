"""Optional notifications to the instance owner (new sign-ups, new recordings).

Any HTTP endpoint that takes a JSON POST works: a WhatsApp/Telegram bot, Slack or
Discord webhook, ntfy, n8n... Configure in .env:

    NOTIFY_URL=https://example.com/hook
    NOTIFY_HEADERS={"Authorization": "Bearer xxx"}        # optional
    NOTIFY_BODY={"chat": "123", "text": "{text}"}         # optional, {text} = the message
    NOTIFY_LANG=en                                        # en | fr
    NOTIFY_TRANSCRIPTS=me@example.com                     # also send finished transcripts:
                                                          # "" never, "all", or a list of emails

Sending transcripts lets the operator check transcription quality. Only enable it for other
people's accounts if your privacy policy says so: their text leaves this server.

Sending happens in a background thread: a slow or failing endpoint never delays a request.
"""

from __future__ import annotations

import json
import logging
import threading

import httpx

from .config import get_settings

log = logging.getLogger("notify")

HEADER = "🎧 *{app}* 🎧"

MESSAGES = {
    "fr": {
        "signup": "Nouvelle inscription : {who}{via}.\n{count} comptes au total.",
        "via_google": ", via Google",
        "recording": "Nouvel audio de {who} : « {name} », {duration}{source}.\nUtilisé : {used} sur {quota}.",
        "unlimited": "illimité",
        "sources": {"record": " (enregistré dans l’app)", "share": " (partagé)", "api": " (API)", "upload": ""},
        "done": "Transcription terminée : *{title}*\n{who} · {duration} · {lang}{speakers}",
        "timing": "\nWhisper : {stt} ({speed}× le temps réel), traitement complet : {total}.",
        "speakers": " · {n} intervenants",
        "failed": "Échec du traitement de « {name} » ({who}) : {error}.",
        "empty": "(aucune parole détectée)",
        "truncated": "… (tronqué : {n} caractères au total)",
        "speaker": "Intervenant {n}",
        "sep": " : ",
    },
    "en": {
        "signup": "New sign-up: {who}{via}.\n{count} accounts in total.",
        "via_google": ", with Google",
        "recording": "New audio from {who}: \"{name}\", {duration}{source}.\nUsed: {used} of {quota}.",
        "unlimited": "unlimited",
        "sources": {"record": " (recorded in the app)", "share": " (shared)", "api": " (API)", "upload": ""},
        "done": "Transcript ready: *{title}*\n{who} · {duration} · {lang}{speakers}",
        "timing": "\nWhisper: {stt} ({speed}× real time), full processing: {total}.",
        "speakers": " · {n} speakers",
        "failed": "Processing failed for \"{name}\" ({who}): {error}.",
        "empty": "(no speech detected)",
        "truncated": "… (truncated: {n} characters in total)",
        "speaker": "Speaker {n}",
        "sep": ": ",
    },
}


def _texts() -> dict:
    return MESSAGES.get(get_settings().notify_lang, MESSAGES["en"])


def _duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s} s"
    m, s = divmod(s, 60)
    return f"{m} min {s:02d} s" if m < 60 else f"{m // 60} h {m % 60:02d}"


def _who(name: str, email: str) -> str:
    name = (name or "").strip()
    return f"*{name}* ({email})" if name else email


def _post(text: str) -> None:
    s = get_settings()
    try:
        headers = {"Content-Type": "application/json", **json.loads(s.notify_headers or "{}")}
        template = s.notify_body or '{"text": "{text}"}'
        body = json.loads(template.replace("{text}", json.dumps(text, ensure_ascii=False)[1:-1]))
        r = httpx.post(s.notify_url, headers=headers, json=body, timeout=15)
        if r.status_code >= 400:
            log.warning("notification refused: HTTP %s %s", r.status_code, r.text[:200])
    except Exception:
        log.exception("notification failed")


def send(text: str) -> None:
    s = get_settings()
    if not s.notify_url:
        return
    message = HEADER.format(app=s.app_name) + "\n\n" + text
    threading.Thread(target=_post, args=(message,), daemon=True).start()


def signup(name: str, email: str, google: bool, total_accounts: int) -> None:
    t = _texts()
    send(t["signup"].format(who=_who(name, email), via=t["via_google"] if google else "", count=total_accounts))


def recording(user: dict, original_name: str, duration: float, source: str, used: float, quota: float) -> None:
    t = _texts()
    send(t["recording"].format(
        who=_who(user["name"], user["email"]), name=original_name, duration=_duration(duration),
        source=t["sources"].get(source, ""), used=_duration(used),
        quota=t["unlimited"] if quota < 0 else _duration(quota),
    ))


MAX_TRANSCRIPT_CHARS = 6500  # WhatsApp bots usually cap a message around 8,000 characters


def _wants_transcripts(email: str) -> bool:
    setting = get_settings().notify_transcripts.strip().lower()
    if not setting:
        return False
    return setting == "all" or email.lower() in {e.strip() for e in setting.split(",")}


def _clock(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m // 60}:{m % 60:02d}:{s:02d}" if m >= 60 else f"{m:02d}:{s:02d}"


def processed(user: dict, rec: dict, stats: dict | None, error: str | None = None) -> None:
    """After the worker finishes a recording: its transcript (or the failure), for quality checks."""
    if not _wants_transcripts(user["email"]):
        return
    t = _texts()
    who = _who(user["name"], user["email"])
    if error:
        send(t["failed"].format(name=rec["original_name"], who=who, error=error))
        return
    segments = json.loads(rec["segments"] or "[]")
    names = json.loads(rec["speakers"] or "{}")
    lines = []
    for seg in segments:
        sp = seg.get("sp")
        label = (names.get(str(sp)) or t["speaker"].format(n=sp)) + t["sep"] if sp else ""
        lines.append(f"[{_clock(seg['s'])}] {label}{seg['t']}")
    body = "\n".join(lines) or t["empty"]
    if len(body) > MAX_TRANSCRIPT_CHARS:
        body = body[:MAX_TRANSCRIPT_CHARS].rsplit("\n", 1)[0] + "\n" + t["truncated"].format(n=len(body))
    header = t["done"].format(
        title=rec["title"] or rec["original_name"], who=who, duration=_duration(rec["duration"]),
        lang=(rec["language"] or "?").upper(),
        speakers=t["speakers"].format(n=rec["num_speakers"]) if rec["num_speakers"] > 1 else "",
    )
    if stats and stats.get("transcription", 0) > 0:
        stt = stats["transcription"]
        header += t["timing"].format(stt=_duration(stt), speed=f"{rec['duration'] / stt:.1f}",
                                     total=_duration(stats.get("total", stt)))
    send(header + "\n\n" + body)
