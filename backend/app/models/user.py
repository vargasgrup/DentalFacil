from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.ids import new_uuid


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    # Display name shown in UI
    nombre: Mapped[str] = mapped_column(String(120))
    # Login identifier (case-insensitive unique). Not email.
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    # Optional recovery contact only (not used for login).
    email: Mapped[str | None] = mapped_column(String(180), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    rol: Mapped[str] = mapped_column(String(20), default="DOCTOR")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # JSON list of module keys, e.g. ["dashboard","pacientes","caja"]
    modulos_acceso: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=datetime.utcnow
    )
