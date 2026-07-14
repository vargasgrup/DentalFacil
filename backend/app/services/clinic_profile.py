"""
Perfil operativo del centro odontológico.
Prioridad: clinic_settings (DB) → variables CLINIC_* (env) → defaults.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models.clinic_settings import ClinicSettings
from app.models.ids import CLINIC_SETTINGS_ID

_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
_DEFAULT_LOGO = _ASSETS_DIR / "logo-md.png"
_UPLOADS_DIR = _ASSETS_DIR / "uploads"


@dataclass(frozen=True)
class ClinicProfile:
    razon_social: str
    nombre_comercial: str
    ruc: str
    direccion: str
    distrito: str
    provincia: str
    departamento: str
    telefono: str
    email: str
    ticket_serie: str
    eslogan: str
    director_nombre: str
    cop_registro: str
    logo_abs_path: Path | None
    has_custom_logo: bool

    @property
    def nombre_publico(self) -> str:
        """Nombre para documentos y WhatsApp ({nombre_centro})."""
        return self.nombre_comercial or self.razon_social

    @property
    def direccion_completa(self) -> str:
        parts = [self.direccion]
        ubigeo = [p for p in [self.distrito, self.provincia, self.departamento] if p]
        if ubigeo:
            parts.append(", ".join(ubigeo))
        return " — ".join([p for p in parts if p])

    @property
    def linea_contacto(self) -> str:
        bits = [b for b in [self.direccion_completa or None, self.telefono or None] if b]
        return " · ".join(bits)


def _get_or_create_row(db: Session) -> ClinicSettings:
    row = db.get(ClinicSettings, CLINIC_SETTINGS_ID)
    if not row:
        row = ClinicSettings(id=CLINIC_SETTINGS_ID, hora_apertura="08:00", hora_cierre="20:00")
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def resolve_logo_path(logo_rel: str | None) -> tuple[Path | None, bool]:
    """Devuelve (ruta absoluta usable, es_logo_personalizado)."""
    if logo_rel:
        candidate = (_ASSETS_DIR / logo_rel).resolve()
        # Seguridad: solo dentro de assets/
        try:
            candidate.relative_to(_ASSETS_DIR.resolve())
        except ValueError:
            candidate = _DEFAULT_LOGO
        if candidate.is_file():
            return candidate, True
    if _DEFAULT_LOGO.is_file():
        return _DEFAULT_LOGO, False
    return None, False


def get_clinic_profile(db: Session | None = None) -> ClinicProfile:
    """Lee perfil del centro. Si db es None, abre sesión propia."""
    close = False
    if db is None:
        from app.database import SessionLocal

        db = SessionLocal()
        close = True
    try:
        row = _get_or_create_row(db)
        logo_abs, custom = resolve_logo_path(row.logo_path)
        return ClinicProfile(
            razon_social=(row.razon_social or settings.CLINIC_NAME or "").strip(),
            nombre_comercial=(row.nombre_comercial or row.razon_social or settings.CLINIC_NAME or "").strip(),
            ruc=(row.ruc or settings.CLINIC_RUC or "").strip(),
            direccion=(row.direccion or settings.CLINIC_ADDRESS or "").strip(),
            distrito=(row.distrito or "").strip(),
            provincia=(row.provincia or "").strip(),
            departamento=(row.departamento or "").strip(),
            telefono=(row.telefono or settings.CLINIC_PHONE or "").strip(),
            email=(row.email or settings.CLINIC_EMAIL or "").strip(),
            ticket_serie=(row.ticket_serie or settings.CLINIC_TICKET_SERIE or "T001").strip().upper() or "T001",
            eslogan=(row.eslogan or "").strip(),
            director_nombre=(row.director_nombre or "").strip(),
            cop_registro=(row.cop_registro or "").strip(),
            logo_abs_path=logo_abs,
            has_custom_logo=custom,
        )
    finally:
        if close:
            db.close()


def ensure_uploads_dir() -> Path:
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return _UPLOADS_DIR
