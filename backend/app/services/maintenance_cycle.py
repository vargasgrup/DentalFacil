"""Vendor maintenance cycle — 6 months from install / last reset.

The countdown runs server-side only. Clinic users see an alert when due;
reset requires MAINTENANCE_ACCESS_KEY (vendor staff), never a clinic role.
"""

from __future__ import annotations

import calendar
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.clinic_settings import ClinicSettings
from app.models.ids import CLINIC_SETTINGS_ID

MAINTENANCE_MONTHS = 6

# Única clave de proveedor para renovar / apagar el aviso (no configurable por entorno).
MAINTENANCE_ACCESS_KEY = "Solo,yo1532"

ALERT_TITLE = "Mantenimiento del sistema requerido"
ALERT_MESSAGE = (
    "El periodo de mantenimiento preventivo del software ha vencido. "
    "Para garantizar el correcto funcionamiento, la seguridad de los datos "
    "y la continuidad del servicio clínico, se requiere asistencia técnica "
    "autorizada del proveedor del sistema. "
    "Por favor contacte al personal de soporte para programar el mantenimiento."
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def add_calendar_months(dt: datetime, months: int) -> datetime:
    """Add calendar months preserving time-of-day (UTC-aware)."""
    dt = _as_utc(dt)
    y = dt.year + (dt.month - 1 + months) // 12
    m = (dt.month - 1 + months) % 12 + 1
    d = min(dt.day, calendar.monthrange(y, m)[1])
    return dt.replace(year=y, month=m, day=d)


def _get_or_create_settings(db: Session) -> ClinicSettings:
    row = db.get(ClinicSettings, CLINIC_SETTINGS_ID)
    if not row:
        row = ClinicSettings(
            id=CLINIC_SETTINGS_ID,
            hora_apertura="08:00",
            hora_cierre="20:00",
            maintenance_cycle_started_at=_utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    if row.maintenance_cycle_started_at is None:
        row.maintenance_cycle_started_at = _utcnow()
        db.commit()
        db.refresh(row)
    return row


def get_maintenance_status(db: Session) -> dict[str, Any]:
    row = _get_or_create_settings(db)
    started = _as_utc(row.maintenance_cycle_started_at or _utcnow())
    due_at = add_calendar_months(started, MAINTENANCE_MONTHS)
    now = _utcnow()
    required = now >= due_at
    return {
        "maintenance_required": required,
        "cycle_started_at": started.isoformat(),
        "due_at": due_at.isoformat(),
        "months": MAINTENANCE_MONTHS,
        "title": ALERT_TITLE if required else None,
        "message": ALERT_MESSAGE if required else None,
    }


def verify_maintenance_access_key(raw: str | None) -> None:
    expected = MAINTENANCE_ACCESS_KEY
    provided = (raw or "").strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clave de mantenimiento inválida",
        )


def reset_maintenance_cycle(db: Session, *, access_key: str | None) -> dict[str, Any]:
    verify_maintenance_access_key(access_key)
    row = _get_or_create_settings(db)
    row.maintenance_cycle_started_at = _utcnow()
    db.commit()
    db.refresh(row)
    return get_maintenance_status(db)
