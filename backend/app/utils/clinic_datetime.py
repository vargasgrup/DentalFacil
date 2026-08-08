"""Fecha/hora de clínica Perú (America/Lima): dd/mm/aaaa y 12 h a. m. / p. m.

Los timestamps de BD suelen ir en UTC (a veces naive). Para mostrarlos hay que
convertir a America/Lima; no usar strftime del servidor ni ISO en tiques.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    CLINIC_TZ = ZoneInfo("America/Lima")
except ZoneInfoNotFoundError:
    # Windows sin tzdata: Perú no usa DST (UTC-5 fijo)
    from datetime import timedelta

    CLINIC_TZ = timezone(timedelta(hours=-5))


def to_clinic(dt: datetime | None) -> datetime | None:
    """UTC/naive-as-UTC → reloj de pared America/Lima."""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CLINIC_TZ)


def now_clinic() -> datetime:
    return datetime.now(CLINIC_TZ)


def format_time_12h(local: datetime) -> str:
    """Ej.: '5:13 p. m.' (estilo es-PE, sin segundos)."""
    h = local.hour
    m = local.minute
    period = "p. m." if h >= 12 else "a. m."
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {period}"


def format_date_dmy(value: datetime | date | None) -> str:
    """dd/mm/aaaa."""
    if value is None:
        return "—"
    if isinstance(value, datetime):
        local = to_clinic(value) or value
        d = local.date() if isinstance(local, datetime) else local
    else:
        d = value
    return f"{d.day:02d}/{d.month:02d}/{d.year:04d}"


def format_datetime_parts(
    value: datetime | date | str | None,
) -> tuple[str, str]:
    """
    (fecha dd/mm/aaaa, hora 12h) para tiques y listados.
    Strings ISO: se interpretan; si no hay zona se asume UTC.
    """
    if value is None:
        return "—", "—"
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return "—", "—"
        # Solo fecha
        if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
            try:
                y, m, d = int(raw[0:4]), int(raw[5:7]), int(raw[8:10])
                return f"{d:02d}/{m:02d}/{y:04d}", ""
            except ValueError:
                return raw, ""
        candidate = raw.replace("Z", "+00:00").replace(" ", "T", 1)
        try:
            # fromisoformat handles +00:00
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            return raw, ""
        return format_datetime_parts(dt)

    if isinstance(value, date) and not isinstance(value, datetime):
        return format_date_dmy(value), ""

    if isinstance(value, datetime):
        local = to_clinic(value)
        if local is None:
            return "—", "—"
        return format_date_dmy(local), format_time_12h(local)

    return "—", "—"


def format_datetime_clinic(value: Any = None) -> str:
    """'08/08/2026, 5:13 p. m.'"""
    if value is None:
        value = now_clinic()
    f, h = format_datetime_parts(value)
    if not h or h == "—":
        return f
    return f"{f}, {h}"
