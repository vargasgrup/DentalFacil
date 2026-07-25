"""Vendor break-glass: reset locked ADMIN password without clinic login."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.roles import Rol
from app.core.security import hash_password
from app.logging_config import get_logger
from app.models import User
from app.services.maintenance_cycle import verify_maintenance_access_key
from app.services.password_reset import invalidate_user_tokens

logger = get_logger("vendor_rescue")

RESCUE_CONFIRM = "RESCATAR"


def list_admin_accounts(db: Session, *, access_key: str | None) -> list[dict[str, Any]]:
    """Return ADMIN accounts for vendor rescue UI (email + nombre only)."""
    verify_maintenance_access_key(access_key)
    rows = (
        db.query(User)
        .filter(User.rol == Rol.ADMIN.value)
        .order_by(User.created_at.asc())
        .all()
    )
    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "email": u.email,
            "activo": bool(u.activo),
        }
        for u in rows
    ]


def rescue_admin_password(
    db: Session,
    *,
    access_key: str | None,
    admin_email: str,
    new_password: str,
    confirm_password: str,
    confirm_token: str,
) -> dict[str, Any]:
    """
    Reset an ADMIN user's password using the fixed vendor key.
    Does not require an authenticated clinic session.
    """
    verify_maintenance_access_key(access_key)

    if (confirm_token or "").strip().upper() != RESCUE_CONFIRM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Escriba RESCATAR para confirmar el rescate de contraseña',
        )
    if new_password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Las contraseñas no coinciden",
        )
    if len(new_password or "") < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 6 caracteres",
        )

    email = (admin_email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existe un usuario con ese correo",
        )
    if user.rol != Rol.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rescate con clave de proveedor solo aplica a cuentas ADMIN",
        )

    was_inactive = not bool(user.activo)
    user.password_hash = hash_password(new_password)
    user.token_version = int(getattr(user, "token_version", 0) or 0) + 1
    # Reactivate if the only admin was soft-disabled by mistake
    if was_inactive:
        user.activo = True

    invalidate_user_tokens(db, user.id)
    # invalidate_user_tokens commits? Check - it only marks used_at, caller must commit
    # Looking at password_reset.invalidate_user_tokens - it doesn't commit, just modifies
    db.commit()
    db.refresh(user)

    logger.warning(
        "vendor rescue: admin password reset email=%s reactivated=%s",
        user.email,
        was_inactive,
    )
    return {
        "ok": True,
        "email": user.email,
        "nombre": user.nombre,
        "reactivated": was_inactive,
        "message": (
            "Contraseña de administrador restablecida. "
            "Inicie sesión con la nueva clave. Las sesiones anteriores quedaron invalidadas."
        ),
    }
