"""Documentos históricos físicos digitalizados (fichas, odontogramas dibujados, etc.)."""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.ids import new_uuid


class HistoricalDocument(Base):
    __tablename__ = "historical_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(40), index=True, default="ficha_clinica")
    titulo: Mapped[str] = mapped_column(String(200), default="")
    filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="upload")  # upload | scan
    document_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
