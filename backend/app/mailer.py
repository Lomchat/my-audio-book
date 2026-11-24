"""Optional outgoing email (password reset), over SMTP. Works with any provider
(Resend: host smtp.resend.com, user "resend", password = API key)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger("mailer")


def send(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if not s.mail_enabled:
        log.warning("Email not configured; message to %s dropped", to)
        return
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    ctx = ssl.create_default_context()
    try:
        if s.smtp_ssl:
            with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, context=ctx, timeout=20) as smtp:
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                smtp.starttls(context=ctx)
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password)
                smtp.send_message(msg)
    except Exception:
        log.exception("Failed to send email to %s", to)
