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
    "Versión DEMO: el usuario de acceso y la contraseña de la cuenta Administrador "
    "están protegidos porque varios usuarios comparten las mismas credenciales. "
    "Puede probar el resto del sistema con normalidad."
)


def is_demo_mode() -> bool:
    # Always honor settings (DEMO currently forced off in config.py).
    return bool(settings.demo_mode)


def is_admin_user(user: User | None) -> bool:
    return bool(user and (user.rol or "") == Rol.ADMIN.value)


def assert_admin_credentials_mutable(user: User | None) -> None:
    """Block Admin login username / password changes while DEMO_MODE is on."""
    if is_demo_mode() and is_admin_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=DEMO_ADMIN_CREDENTIALS_DETAIL,
        )
