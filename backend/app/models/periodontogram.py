"""Periodontogram, tooth media, clinical audit trail."""

from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Numeric, Boolean, Text, Integer, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PeriodontogramEntry(Base):
    __tablename__ = "periodontogram_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    pieza_fdi: Mapped[str] = mapped_column(String(4), index=True)
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")
    movilidad: Mapped[int] = mapped_column(Integer, default=0)  # 0–3
    recesion_mm: Mapped[float] = mapped_column(Numeric(4, 1), default=0)
    sondaje_v: Mapped[float] = mapped_column(Numeric(4, 1), default=0)
    sondaje_l: Mapped[float] = mapped_column(Numeric(4, 1), default=0)
    sondaje_m: Mapped[float] = mapped_column(Numeric(4, 1), default=0)
    sondaje_d: Mapped[float] = mapped_column(Numeric(4, 1), default=0)
    sangrado: Mapped[bool] = mapped_column(Boolean, default=False)
    placa: Mapped[bool] = mapped_column(Boolean, default=False)
    notas: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class ToothMedia(Base):
    __tablename__ = "tooth_media"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    pieza_fdi: Mapped[str] = mapped_column(String(4), index=True)
    tipo: Mapped[str] = mapped_column(String(40), default="foto")
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100), default="image/jpeg")
    notas: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClinicalAuditLog(Base):
    __tablename__ = "clinical_audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"), index=True)
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[dict | None] = mapped_column(JSON)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
