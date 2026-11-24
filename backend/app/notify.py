"""Optional notifications to the instance owner (new sign-ups, new recordings).

Any HTTP endpoint that takes a JSON POST works: a WhatsApp/Telegram bot, Slack or
Discord webhook, ntfy, n8n... Configure in .env:

    NOTIFY_URL=https://example.com/hook
    NOTIFY_HEADERS={"Authorization": "Bearer xxx"}        # optional
    NOTIFY_BODY={"chat": "123", "text": "{text}"}         # optional, {text} = the message
    NOTIFY_LANG=en                                        # en | fr

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
    },
    "en": {
        "signup": "New sign-up: {who}{via}.\n{count} accounts in total.",
        "via_google": ", with Google",
        "recording": "New audio from {who}: \"{name}\", {duration}{source}.\nUsed: {used} of {quota}.",
        "unlimited": "unlimited",
        "sources": {"record": " (recorded in the app)", "share": " (shared)", "api": " (API)", "upload": ""},
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
