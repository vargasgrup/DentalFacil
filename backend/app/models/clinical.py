from datetime import datetime

from sqlalchemy import String, DateTime, Text, Boolean, ForeignKey, Numeric, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.ids import new_uuid


class ClinicalRecord(Base):
    __tablename__ = "clinical_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), unique=True)
    motivo_consulta: Mapped[str | None] = mapped_column(Text)
    antecedentes_medicos: Mapped[str | None] = mapped_column(Text)
    antecedentes_odontologicos: Mapped[str | None] = mapped_column(Text)
    diagnostico: Mapped[str | None] = mapped_column(Text)
    plan_tratamiento: Mapped[list | None] = mapped_column(JSON)
    observaciones: Mapped[str | None] = mapped_column(Text)
    doctor_responsable_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    consentimiento_firmado: Mapped[bool] = mapped_column(Boolean, default=False)
    consentimiento_fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    firma_odontologo: Mapped[str | None] = mapped_column(Text)
    firma_paciente: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), default=datetime.utcnow
    )


class ClinicalEvolutionEntry(Base):
    __tablename__ = "clinical_evolution_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    especialidad: Mapped[str | None] = mapped_column(String(80))
    tratamiento_descripcion: Mapped[str] = mapped_column(Text)
    pieza_fdi: Mapped[str | None] = mapped_column(String(4))
    cantidad: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    costo_unitario: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    costo: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    a_cuenta: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")
    plan_item_id: Mapped[str | None] = mapped_column(String(40))
    proxima_cita_fecha: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )


class OdontogramEntry(Base):
    __tablename__ = "odontogram_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    pieza_fdi: Mapped[str] = mapped_column(String(4))
    estado: Mapped[str] = mapped_column(String(40), default="sano")
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")
    superficies: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {"M": None, "D": None, "V": None, "L": None, "O": None},
    )
    notas: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), default=datetime.utcnow
    )


class OdontogramChangeLog(Base):
    """Historial automático de cada modificación del odontograma."""

    __tablename__ = "odontogram_change_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    pieza_fdi: Mapped[str] = mapped_column(String(4), default="")
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")
    estado_antes: Mapped[str | None] = mapped_column(String(40))
    estado_despues: Mapped[str | None] = mapped_column(String(40))
    superficies_antes: Mapped[dict | None] = mapped_column(JSON)
    superficies_despues: Mapped[dict | None] = mapped_column(JSON)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    accion: Mapped[str] = mapped_column(String(20), default="upsert")
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )


class OdontogramSnapshot(Base):
    """Copia completa del odontograma en un momento (estado de cita)."""

    __tablename__ = "odontogram_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    denticion: Mapped[str] = mapped_column(String(20), default="permanente")
    label: Mapped[str] = mapped_column(String(120), default="Estado de cita")
    entries: Mapped[list] = mapped_column(JSON, default=list)
    taken_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    evolution_entry_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("clinical_evolution_entries.id"), nullable=True
    )
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
