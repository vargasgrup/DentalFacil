"""Ensure backup_settings / backup_history tables exist."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_backup_schema")


def ensure_backup_schema() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    dialect = engine.dialect.name

    with engine.begin() as conn:
        if "backup_settings" not in tables:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE backup_settings (
                            id VARCHAR(36) PRIMARY KEY,
                            auto_backup_enabled BOOLEAN NOT NULL DEFAULT 0,
                            frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
                            preferred_hour VARCHAR(5) NOT NULL DEFAULT '22:00',
                            retention_count INTEGER NOT NULL DEFAULT 10,
                            keep_manual BOOLEAN NOT NULL DEFAULT 1,
                            last_backup_at DATETIME,
                            updated_at DATETIME
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE backup_settings (
                            id VARCHAR(36) PRIMARY KEY,
                            auto_backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                            frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
                            preferred_hour VARCHAR(5) NOT NULL DEFAULT '22:00',
                            retention_count INTEGER NOT NULL DEFAULT 10,
                            keep_manual BOOLEAN NOT NULL DEFAULT TRUE,
                            last_backup_at TIMESTAMPTZ,
                            updated_at TIMESTAMPTZ
                        )
                        """
                    )
                )
            logger.info("[dentalfacil] created backup_settings")

        if "backup_history" not in tables:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        """
                        CREATE TABLE backup_history (
                            id VARCHAR(36) PRIMARY KEY,
                            filename VARCHAR(255) NOT NULL,
                            abs_path VARCHAR(500) NOT NULL,
                            triggered_by VARCHAR(20) NOT NULL,
                            status VARCHAR(20) NOT NULL,
                            error_message TEXT,
                            size_bytes INTEGER,
                            duration_ms INTEGER,
                            keep BOOLEAN NOT NULL DEFAULT 0,
                            created_at DATETIME NOT NULL
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE backup_history (
                            id VARCHAR(36) PRIMARY KEY,
                            filename VARCHAR(255) NOT NULL,
                            abs_path VARCHAR(500) NOT NULL,
                            triggered_by VARCHAR(20) NOT NULL,
                            status VARCHAR(20) NOT NULL,
                            error_message TEXT,
                            size_bytes INTEGER,
                            duration_ms INTEGER,
                            keep BOOLEAN NOT NULL DEFAULT FALSE,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
            logger.info("[dentalfacil] created backup_history")
