"""Login usernames (not email). Case-insensitive uniqueness; display case preserved."""

from __future__ import annotations

import re

from fastapi import HTTPException

# Letters, digits, . _ - ; 3–40 chars. Examples: Admin, maria.r, doc_juan
USERNAME_RE = re.compile(r"^[A-Za-z0-9._\-]{3,40}$")


def normalize_username(raw: str | None) -> str:
    return (raw or "").strip()


def validate_username(raw: str | None) -> str:
    value = normalize_username(raw)
    if not value:
        raise HTTPException(status_code=400, detail="Indique el nombre de usuario de acceso")
    if " " in value or "@" in value:
        raise HTTPException(
            status_code=400,
            detail="El usuario de acceso no puede contener espacios ni @. Use letras, números, punto, guion o _.",
        )
    if not USERNAME_RE.match(value):
        raise HTTPException(
            status_code=400,
            detail="Usuario inválido: 3–40 caracteres (letras, números, . _ -).",
        )
    return value


def username_from_legacy(nombre: str | None, email: str | None) -> str:
    """Suggest a username when migrating legacy email-only accounts."""
    base = ""
    if nombre:
        base = re.sub(r"[^A-Za-z0-9._\-]+", "", nombre.strip())
    if not base and email and "@" in email:
        base = re.sub(r"[^A-Za-z0-9._\-]+", "", email.split("@", 1)[0])
    if not base:
        base = "usuario"
    base = base[:40]
    if len(base) < 3:
        base = (base + "xxx")[:3]
    return base
