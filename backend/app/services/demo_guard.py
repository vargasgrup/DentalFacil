"""Shared DEMO mode guards — temporary shared-login demos.

Enable with DEMO_MODE=true (or NKDENTALSOFT_DEMO=1).
Disable by removing the var / setting DEMO_MODE=false.

Clinic desktop installers leave this off so Admin can change their password.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.config import settings
from app.core.roles import Rol
from app.models import User

DEMO_ADMIN_CREDENTIALS_DETAIL = (
    "Versión DEMO: el correo y la contraseña de la cuenta Administrador están "
    "protegidos porque varios usuarios comparten las mismas credenciales de acceso. "
    "Puede probar el resto del sistema con normalidad."
)


def is_demo_mode() -> bool:
    return bool(getattr(settings, "demo_mode", False) or settings.DEMO_MODE)


def is_admin_user(user: User | None) -> bool:
    return bool(user and (user.rol or "") == Rol.ADMIN.value)


def assert_admin_credentials_mutable(user: User | None) -> None:
    """Block Admin login-email / password changes while DEMO_MODE is on."""
    if is_demo_mode() and is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=DEMO_ADMIN_CREDENTIALS_DETAIL,
        )
