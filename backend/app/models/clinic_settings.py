"""Clinic settings singleton (horario + datos del centro odontológico)."""
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, JSON, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.ids import CLINIC_SETTINGS_ID


class ClinicSettings(Base):
    __tablename__ = "clinic_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=CLINIC_SETTINGS_ID)

    hora_apertura: Mapped[str] = mapped_column(String(5), default="08:00")
    hora_cierre: Mapped[str] = mapped_column(String(5), default="20:00")

    razon_social: Mapped[str | None] = mapped_column(String(200), nullable=True)
    nombre_comercial: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ruc: Mapped[str | None] = mapped_column(String(11), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(300), nullable=True)
    distrito: Mapped[str | None] = mapped_column(String(80), nullable=True)
    provincia: Mapped[str | None] = mapped_column(String(80), nullable=True)
    departamento: Mapped[str | None] = mapped_column(String(80), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ticket_serie: Mapped[str | None] = mapped_column(String(10), nullable=True)
    eslogan: Mapped[str | None] = mapped_column(String(200), nullable=True)
    director_nombre: Mapped[str | None] = mapped_column(String(150), nullable=True)
    cop_registro: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    especialidades: Mapped[list | None] = mapped_column(JSON, nullable=True)
    reminder_hours_before: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reminder_template: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        default=datetime.utcnow,
    )
