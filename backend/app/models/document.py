from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DocumentGenerated(Base):
    __tablename__ = "documents_generated"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int | None] = mapped_column(ForeignKey("patients.id"))
    tipo: Mapped[str] = mapped_column(String(30))  # ficha/evolucion/consentimiento/comprobante/cierre_caja/reporte
    formato: Mapped[str] = mapped_column(String(10))  # 80mm/A5/A4
    archivo_ref: Mapped[str] = mapped_column(String(500))
    marcado_enviado_whatsapp_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
