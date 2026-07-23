"""Módulos del sistema y defaults de acceso por rol."""

from __future__ import annotations

import json
from typing import Iterable

from app.core.roles import Rol

# Claves canónicas (deben coincidir con frontend/src/lib/roles.ts)
ALL_MODULES = (
    "dashboard",
    "pacientes",
    "agenda",
    "caja",
    "reportes",
    "configuracion",
)

VALID_MODULES = frozenset(ALL_MODULES)

# Inicio siempre disponible para cualquier usuario activo
ALWAYS_ON = frozenset({"dashboard"})

# Defaults recomendados al crear un usuario (el admin puede ajustarlos)
DEFAULT_MODULES_BY_ROLE: dict[str, tuple[str, ...]] = {
    Rol.ADMIN.value: ALL_MODULES,
    Rol.DOCTOR.value: (
        "dashboard",
        "pacientes",
        "agenda",
        "caja",
        "reportes",
        "configuracion",
    ),
    Rol.ASISTENTE.value: ("dashboard", "pacientes", "agenda", "configuracion"),
    # Cajero: solo operación de cobro (sin reportes ni configuración completa)
    Rol.CAJERO.value: ("dashboard", "pacientes", "caja"),
}


def default_modules_for_role(rol: str) -> list[str]:
    return list(DEFAULT_MODULES_BY_ROLE.get(rol, ("dashboard",)))


def normalize_modules(
    raw: Iterable[str] | None,
    *,
    rol: str | None = None,
) -> list[str]:
    """Valida y ordena módulos; ADMIN siempre obtiene todos."""
    if rol == Rol.ADMIN.value:
        return list(ALL_MODULES)

    if raw is None:
        return default_modules_for_role(rol or Rol.DOCTOR.value)

    cleaned: list[str] = []
    seen: set[str] = set()
    for item in raw:
        key = (item or "").strip().lower()
        if key not in VALID_MODULES or key in seen:
            continue
        seen.add(key)
        cleaned.append(key)

    for m in ALWAYS_ON:
        if m not in seen:
            cleaned.insert(0, m)
            seen.add(m)

    # Mantener orden canónico
    order = {m: i for i, m in enumerate(ALL_MODULES)}
    cleaned.sort(key=lambda m: order.get(m, 99))
    return cleaned


def modules_to_json(modules: list[str]) -> str:
    return json.dumps(modules, ensure_ascii=False)


def modules_from_storage(raw: str | None, rol: str) -> list[str]:
    if not raw or not str(raw).strip():
        return default_modules_for_role(rol)
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return default_modules_for_role(rol)
    if not isinstance(parsed, list):
        return default_modules_for_role(rol)
    return normalize_modules([str(x) for x in parsed], rol=rol)


def user_can_access(rol: str, stored: str | None, module: str) -> bool:
    mods = modules_from_storage(stored, rol)
    return module in mods
