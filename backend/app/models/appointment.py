from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Boolean, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    doctor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    fecha_hora: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    duracion_minutos: Mapped[int] = mapped_column(Integer, default=30)
    estado: Mapped[str] = mapped_column(String(20), default="programada")  # programada/completada/cancelada
    especialidad: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text)
    recordatorio_enviado: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AppointmentReminder(Base):
    __tablename__ = "appointment_reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"))
    canal: Mapped[str] = mapped_column(String(20), default="whatsapp")
    programado_para: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    mensaje_sugerido: Mapped[str] = mapped_column(Text)
    marcado_enviado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    marcado_enviado_por_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")  # pendiente/enviado
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
