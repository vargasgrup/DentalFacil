from datetime import datetime

from sqlalchemy import String, DateTime, Text, Boolean, ForeignKey, Numeric, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ClinicalRecord(Base):
    __tablename__ = "clinical_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), unique=True)
    motivo_consulta: Mapped[str | None] = mapped_column(Text)
    antecedentes_medicos: Mapped[str | None] = mapped_column(Text)
    antecedentes_odontologicos: Mapped[str | None] = mapped_column(Text)
    diagnostico: Mapped[str | None] = mapped_column(Text)
    plan_tratamiento: Mapped[list | None] = mapped_column(JSON)
    observaciones: Mapped[str | None] = mapped_column(Text)
    doctor_responsable_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    consentimiento_firmado: Mapped[bool] = mapped_column(Boolean, default=False)
    consentimiento_fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    firma_odontologo: Mapped[str | None] = mapped_column(Text)  # data URL PNG
    firma_paciente: Mapped[str | None] = mapped_column(Text)  # data URL PNG
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ClinicalEvolutionEntry(Base):
    __tablename__ = "clinical_evolution_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    especialidad: Mapped[str | None] = mapped_column(String(80))
    tratamiento_descripcion: Mapped[str] = mapped_column(Text)
    costo: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    a_cuenta: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente/en_proceso/completado
    proxima_cita_fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OdontogramEntry(Base):
    __tablename__ = "odontogram_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    pieza_fdi: Mapped[str] = mapped_column(String(4))  # e.g. "18", "11", "36", "55"
    # condicion general de la pieza (antes "estado" del odontograma simplificado)
    estado: Mapped[str] = mapped_column(String(40), default="sano")
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")  # permanente | temporal
    superficies: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {"M": None, "D": None, "V": None, "L": None, "O": None},
    )
    notas: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OdontogramChangeLog(Base):
    """Historial automático de cada modificación del odontograma."""

    __tablename__ = "odontogram_change_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    pieza_fdi: Mapped[str] = mapped_column(String(4), default="")
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")
    estado_antes: Mapped[str | None] = mapped_column(String(40))
    estado_despues: Mapped[str | None] = mapped_column(String(40))
    superficies_antes: Mapped[dict | None] = mapped_column(JSON)
    superficies_despues: Mapped[dict | None] = mapped_column(JSON)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    accion: Mapped[str] = mapped_column(String(20), default="upsert")  # upsert|clear_pieza|clear_all
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OdontogramSnapshot(Base):
    """Copia completa del odontograma en un momento (estado de cita)."""

    __tablename__ = "odontogram_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")
    label: Mapped[str] = mapped_column(String(120), default="Estado de cita")
    entries: Mapped[list] = mapped_column(JSON, default=list)
    taken_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    evolution_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("clinical_evolution_entries.id"), nullable=True
    )
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

