"""Minimal email delivery for password reset (SMTP and optional Resend API)."""

from __future__ import annotations

import json
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage

from app.config import settings
from app.logging_config import get_logger

logger = get_logger("mailer")


def email_configured() -> bool:
    if (settings.RESEND_API_KEY or "").strip():
        return True
    return bool((settings.SMTP_HOST or "").strip() and (settings.SMTP_FROM or "").strip())


def send_email(*, to: str, subject: str, text_body: str, html_body: str | None = None) -> bool:
    """Send email. Returns True on success. Never raises to callers."""
    to = (to or "").strip()
    if not to:
        return False
    try:
        if (settings.RESEND_API_KEY or "").strip():
            return _send_resend(to=to, subject=subject, text_body=text_body, html_body=html_body)
        if (settings.SMTP_HOST or "").strip():
            return _send_smtp(to=to, subject=subject, text_body=text_body, html_body=html_body)
        logger.info("email skipped (SMTP/Resend not configured) → %s", to)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("email send failed to %s: %s", to, exc, exc_info=True)
        return False


def _from_address() -> str:
    return (settings.SMTP_FROM or settings.CLINIC_EMAIL or "noreply@localhost").strip()


def _send_smtp(*, to: str, subject: str, text_body: str, html_body: str | None) -> bool:
    host = (settings.SMTP_HOST or "").strip()
    if not host:
        return False
    port = int(settings.SMTP_PORT or 587)
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = _from_address()
    msg["To"] = to
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    user = (settings.SMTP_USER or "").strip()
    password = settings.SMTP_PASSWORD or ""
    use_tls = bool(settings.SMTP_TLS)

    if port == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.ehlo()
            if use_tls:
                context = ssl.create_default_context()
                smtp.starttls(context=context)
                smtp.ehlo()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    logger.info("smtp email sent → %s", to)
    return True


def _send_resend(*, to: str, subject: str, text_body: str, html_body: str | None) -> bool:
    api_key = (settings.RESEND_API_KEY or "").strip()
    if not api_key:
        return False
    payload = {
        "from": _from_address(),
        "to": [to],
        "subject": subject,
        "text": text_body,
    }
    if html_body:
        payload["html"] = html_body
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if 200 <= resp.status < 300:
                logger.info("resend email sent → %s", to)
                return True
            logger.error("resend HTTP %s", resp.status)
            return False
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        logger.error("resend HTTPError %s: %s", exc.code, body[:500])
        return False
