"""Backup settings (singleton) and backup history."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.ids import BACKUP_SETTINGS_ID, new_uuid


class BackupSettings(Base):
    __tablename__ = "backup_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=BACKUP_SETTINGS_ID)
    auto_backup_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), default="daily", nullable=False)
    preferred_hour: Mapped[str] = mapped_column(String(5), default="22:00", nullable=False)
    retention_count: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    keep_manual: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Absolute or env-expanded path for zip output (desktop). Empty = default / BACKUP_DIRECTORY env.
    backup_directory: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_backup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        default=datetime.utcnow,
    )


class BackupHistory(Base):
    __tablename__ = "backup_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    abs_path: Mapped[str] = mapped_column(String(500), nullable=False)
    triggered_by: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    keep: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=datetime.utcnow,
        nullable=False,
    )
