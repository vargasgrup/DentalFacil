"""Password recovery: create / validate / consume reset tokens."""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.logging_config import get_logger
from app.models import PasswordResetToken, User
from app.models.ids import new_uuid
from app.services.mailer import email_configured, send_email

logger = get_logger("password_reset")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _expire_minutes() -> int:
    return max(5, int(getattr(settings, "PASSWORD_RESET_EXPIRE_MINUTES", 60) or 60))


@dataclass
class ResetIssueResult:
    issued: bool
    email_sent: bool
    delivery: str  # email | admin | none
    # Only for tests / explicit local inline mode — never for unknown emails
    reset_code: str | None = None
    reset_token: str | None = None


def invalidate_user_tokens(db: Session, user_id: str) -> None:
    now = _utcnow()
    rows = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used_at.is_(None),
        )
        .all()
    )
    for row in rows:
        row.used_at = now


def issue_reset_for_email(db: Session, email: str) -> ResetIssueResult:
    """
    Always safe against enumeration: caller should return a generic message.
    If the user exists and is active, creates token+code and tries email delivery.
    """
    normalized = (email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == normalized).first()
    if not user or not user.activo:
        return ResetIssueResult(issued=False, email_sent=False, delivery="none")

    invalidate_user_tokens(db, user.id)

    raw_token = secrets.token_urlsafe(32)
    raw_code = f"{secrets.randbelow(1_000_000):06d}"
    row = PasswordResetToken(
        id=new_uuid(),
        user_id=user.id,
        token_hash=_hash(raw_token),
        code_hash=_hash(raw_code),
        code_plain=raw_code,
        expires_at=_utcnow() + timedelta(minutes=_expire_minutes()),
        email_sent=False,
    )
    db.add(row)
    db.commit()

    app_url = (settings.PUBLIC_APP_URL or "").rstrip("/")
    reset_link = f"{app_url}/recuperar-clave?token={raw_token}" if app_url else ""
    clinic = settings.CLINIC_NAME or settings.APP_NAME
    subject = f"Recuperar contraseña — {clinic}"
    text_body = (
        f"Hola {user.nombre},\n\n"
        f"Recibimos una solicitud para restablecer su contraseña en {clinic}.\n\n"
        f"Código de verificación: {raw_code}\n"
        f"(válido { _expire_minutes() } minutos)\n\n"
    )
    if reset_link:
        text_body += f"También puede abrir este enlace:\n{reset_link}\n\n"
    text_body += (
        "Si usted no solicitó este cambio, ignore este mensaje.\n"
        "Por seguridad no comparta el código con personas no autorizadas.\n"
    )
    html_body = (
        f"<p>Hola <strong>{user.nombre}</strong>,</p>"
        f"<p>Recibimos una solicitud para restablecer su contraseña en "
        f"<strong>{clinic}</strong>.</p>"
        f"<p style='font-size:1.25rem'>Código: <strong>{raw_code}</strong></p>"
        f"<p>Válido { _expire_minutes() } minutos.</p>"
    )
    if reset_link:
        html_body += f"<p><a href=\"{reset_link}\">Restablecer contraseña</a></p>"

    sent = False
    if email_configured():
        sent = send_email(to=user.email, subject=subject, text_body=text_body, html_body=html_body)
        row.email_sent = sent
        db.commit()

    delivery = "email" if sent else "admin"
    inline = bool(getattr(settings, "PASSWORD_RESET_INLINE_CODE", False))
    return ResetIssueResult(
        issued=True,
        email_sent=sent,
        delivery=delivery,
        reset_code=raw_code if inline else None,
        reset_token=raw_token if inline else None,
    )


def _get_valid_row(
    db: Session,
    *,
    token: str | None = None,
    code: str | None = None,
    email: str | None = None,
) -> PasswordResetToken | None:
    now = _utcnow()
    q = db.query(PasswordResetToken).filter(
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now,
    )
    if token:
        row = q.filter(PasswordResetToken.token_hash == _hash(token.strip())).first()
        return row
    if code and email:
        user = (
            db.query(User)
            .filter(func.lower(User.email) == email.strip().lower())
            .first()
        )
        if not user:
            return None
        return (
            q.filter(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.code_hash == _hash(code.strip()),
            )
            .order_by(PasswordResetToken.created_at.desc())
            .first()
        )
    return None


def validate_reset(
    db: Session,
    *,
    token: str | None = None,
    code: str | None = None,
    email: str | None = None,
) -> dict:
    row = _get_valid_row(db, token=token, code=code, email=email)
    if not row:
        return {"valid": False}
    user = db.get(User, row.user_id)
    if not user or not user.activo:
        return {"valid": False}
    return {"valid": True, "email": user.email, "nombre": user.nombre}


def consume_reset(
    db: Session,
    *,
    new_password: str,
    token: str | None = None,
    code: str | None = None,
    email: str | None = None,
) -> User:
    from fastapi import HTTPException

    from app.core.security import hash_password

    row = _get_valid_row(db, token=token, code=code, email=email)
    if not row:
        raise HTTPException(status_code=400, detail="Código o enlace inválido o expirado")
    user = db.get(User, row.user_id)
    if not user or not user.activo:
        raise HTTPException(status_code=400, detail="Usuario no disponible")

    now = _utcnow()
    user.password_hash = hash_password(new_password)
    user.token_version = int(getattr(user, "token_version", 0) or 0) + 1
    row.used_at = now
    row.code_plain = ""
    siblings = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.id != row.id,
        )
        .all()
    )
    for sib in siblings:
        sib.used_at = now
        sib.code_plain = ""
    db.commit()
    db.refresh(user)
    logger.info("password reset consumed for user_id=%s", user.id)
    return user


def list_active_requests(db: Session) -> list[dict]:
    now = _utcnow()
    rows = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
        .order_by(PasswordResetToken.created_at.desc())
        .all()
    )
    out: list[dict] = []
    for row in rows:
        user = db.get(User, row.user_id)
        if not user:
            continue
        out.append(
            {
                "id": row.id,
                "user_id": user.id,
                "nombre": user.nombre,
                "email": user.email,
                "code": row.code_plain,
                "email_sent": bool(row.email_sent),
                "expires_at": row.expires_at,
                "created_at": row.created_at,
            }
        )
    return out
