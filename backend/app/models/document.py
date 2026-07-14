from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.ids import new_uuid


class DocumentGenerated(Base):
    __tablename__ = "documents_generated"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    patient_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("patients.id"))
    tipo: Mapped[str] = mapped_column(String(30))
    formato: Mapped[str] = mapped_column(String(10))
    archivo_ref: Mapped[str] = mapped_column(String(500))
    marcado_enviado_whatsapp_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
