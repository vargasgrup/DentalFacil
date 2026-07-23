"""Utilidades compartidas para generación de PDFs clínicos (ReportLab).

Formato de fechas/moneda, limpieza de textos de tratamiento y tamaños de logo.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path
from typing import Any

from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage

# Logo profesional: máximo 80×80 pt (≈ 28.2 mm)
MAX_LOGO_PT = 80.0
_DEFAULT_LOGO_ASPECT = 1951 / 583

_MONTHS_ES = (
    "",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
)

# Textos residuales / OCR / duplicados de pieza en descripciones
_RE_MARKDOWN_HEADERS = re.compile(r"^#{1,6}\s*", re.MULTILINE)
_RE_PIEZA_PAREN = re.compile(
    r"\s*\(\s*pie[zs]?a?\s*\.?\s*\d{1,2}\s*\)",
    re.IGNORECASE,
)
_RE_PIER_GARBAGE = re.compile(
    r"\s*\(\s*pier\s+\d{2,4}\s*\)",
    re.IGNORECASE,
)
_RE_MULTI_SPACE = re.compile(r"[ \t]{2,}")


def format_price(amount: float | int | None, *, prefix: str = "S/ ") -> str:
    """Formato monetario peruano: S/ 120.00"""
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0.0
    return f"{prefix}{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def format_price_plain(amount: float | int | None) -> str:
    """S/ 120.00 con punto decimal (más legible en tablas PDF)."""
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0.0
    return f"S/ {value:.2f}"


def format_date_for_document(
    value: datetime | date | str | None = None,
    *,
    include_time: bool = False,
) -> str:
    """Fecha formal: '23 de julio de 2026' (sin hora salvo include_time)."""
    dt: datetime | date | None
    if value is None:
        dt = datetime.now()
    elif isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        dt = value
    elif isinstance(value, str):
        raw = value.strip()
        dt = None
        for fmt in (
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%d/%m/%Y %H:%M",
            "%d/%m/%Y",
        ):
            try:
                # strip timezone colon variants
                candidate = raw.replace("Z", "+00:00")
                if fmt.endswith("%z") and len(candidate) > 19 and candidate[-3] == ":":
                    candidate = candidate[:-3] + candidate[-2:]
                dt = datetime.strptime(candidate[:26], fmt)
                break
            except ValueError:
                continue
        if dt is None:
            return raw.split(" ")[0] if raw else "—"
    else:
        return "—"

    if isinstance(dt, datetime):
        d = dt.date()
        time_part = dt.strftime("%H:%M") if include_time else None
    else:
        d = dt
        time_part = None

    month = _MONTHS_ES[d.month] if 1 <= d.month <= 12 else str(d.month)
    text = f"{d.day} de {month} de {d.year}"
    if time_part:
        text = f"{text}, {time_part}"
    return text


def strip_markdown_noise(text: str) -> str:
    """Elimina encabezados Markdown (##) y artefactos típicos de copy-paste."""
    if not text:
        return ""
    cleaned = _RE_MARKDOWN_HEADERS.sub("", str(text))
    cleaned = cleaned.replace("**", "").replace("__", "")
    return cleaned.strip()


def clean_treatment_label(
    text: str | None,
    *,
    pieza_fdi: str | None = None,
) -> str:
    """
    Limpia descripción de tratamiento para PDF:
    - quita Markdown
    - quita '(pier 2020)' y similares
    - quita '(pieza N)' redundante si ya hay columna de pieza
    """
    raw = strip_markdown_noise(str(text or "")).strip()
    if not raw:
        return "—"
    raw = _RE_PIER_GARBAGE.sub("", raw)
    if pieza_fdi:
        # Quitar cualquier (pieza XX) duplicado en el texto
        raw = _RE_PIEZA_PAREN.sub("", raw)
        # También "pieza 12" suelto al final
        raw = re.sub(
            rf"\s*[-–—,]?\s*pieza\s*{re.escape(str(pieza_fdi))}\s*$",
            "",
            raw,
            flags=re.IGNORECASE,
        )
    else:
        raw = _RE_PIEZA_PAREN.sub("", raw)
    raw = _RE_MULTI_SPACE.sub(" ", raw).strip(" -–—,")
    return raw or "—"


def safe_clinic_text(value: str | None, fallback: str = "") -> str:
    """Texto de clínica usable; vacío → fallback."""
    text = (value or "").strip()
    return text if text else fallback


def clinic_contact_line(
    *,
    direccion: str = "",
    telefono: str = "",
    email: str = "",
    ruc: str = "",
) -> str:
    """Línea de contacto para cabecera PDF (sin 'no configurada' si hay algún dato)."""
    bits: list[str] = []
    if direccion.strip():
        bits.append(direccion.strip())
    if telefono.strip():
        bits.append(telefono.strip())
    if email.strip():
        bits.append(email.strip())
    if ruc.strip():
        bits.append(f"RUC {ruc.strip()}")
    return " · ".join(bits)


def logo_image(
    path: Path | None,
    *,
    max_pt: float = MAX_LOGO_PT,
    h_align: str = "LEFT",
) -> RLImage | None:
    """
    Logo acotado a max_pt × max_pt, preservando aspecto.
    Alineación por defecto a la izquierda (cabecera profesional).
    """
    if not path or not path.is_file():
        return None
    try:
        from reportlab.lib.utils import ImageReader

        ir = ImageReader(str(path))
        iw, ih = ir.getSize()
        aspect = (iw / ih) if ih else _DEFAULT_LOGO_ASPECT
    except Exception:
        aspect = _DEFAULT_LOGO_ASPECT

    # Encajar en caja max_pt × max_pt
    if aspect >= 1.0:
        width = float(max_pt)
        height = width / aspect
    else:
        height = float(max_pt)
        width = height * aspect
    if height > max_pt:
        height = float(max_pt)
        width = height * aspect
    if width > max_pt:
        width = float(max_pt)
        height = width / aspect

    img = RLImage(str(path), width=width, height=height)
    img.hAlign = h_align
    return img


def logo_size_mm_for_ticket(fmt: str) -> float:
    """Ancho máximo del logo en mm para tickets (más compacto que documentos A4)."""
    if fmt == "80mm":
        return 22.0  # ~62 pt, dentro del límite 80pt
    if fmt == "A5":
        return 26.0
    return 28.0  # ~80 pt


def cell_paragraph(text: Any, style: ParagraphStyle) -> Any:
    """Convierte texto a Paragraph escapando XML básico de ReportLab."""
    from reportlab.platypus import Paragraph

    raw = strip_markdown_noise(str(text if text is not None else ""))
    # Escape mínimo para Paragraph
    escaped = (
        raw.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return Paragraph(escaped or "—", style)


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
