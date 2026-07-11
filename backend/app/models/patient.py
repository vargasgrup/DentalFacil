from datetime import datetime

from sqlalchemy import String, Date, DateTime, Text, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (
        Index(
            "ux_patients_tipo_numero_documento",
            "tipo_documento",
            "numero_documento",
            unique=True,
            postgresql_where=text(
                "numero_documento IS NOT NULL AND btrim(numero_documento) <> ''"
            ),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    numero_ficha: Mapped[int] = mapped_column(unique=True, index=True)
    nombres: Mapped[str] = mapped_column(String(120))
    apellidos: Mapped[str] = mapped_column(String(120))
    tipo_documento: Mapped[str] = mapped_column(String(15), default="DNI")
    numero_documento: Mapped[str | None] = mapped_column(String(20), index=True)
    fecha_nacimiento: Mapped[datetime | None] = mapped_column(Date)
    telefono: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(180))
    direccion: Mapped[str | None] = mapped_column(String(255))
    contacto_emergencia: Mapped[str | None] = mapped_column(String(255))
    alergias: Mapped[str | None] = mapped_column(Text)
    lugar_nacimiento: Mapped[str | None] = mapped_column(String(120))
    ocupacion: Mapped[str | None] = mapped_column(String(120))
    estado_civil: Mapped[str | None] = mapped_column(String(40))
    nombre_responsable: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
