"""Ensure backup_settings / backup_history tables exist and stay current."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_backup_schema")


def _column_names(conn, table: str) -> set[str]:
    """Read columns using the same connection (avoids SQLite cross-conn visibility gaps)."""
    dialect = conn.engine.dialect.name
    if dialect == "sqlite":
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        # PRAGMA: cid, name, type, notnull, dflt_value, pk
        return {str(r[1]) for r in rows}
    insp = inspect(conn)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def ensure_backup_schema() -> None:
    """Idempotent. Safe to call on startup and before backup API reads/writes."""
    dialect = engine.dialect.name

    with engine.begin() as conn:
        insp = inspect(conn)
        tables = set(insp.get_table_names())

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
                            updated_at DATETIME,
                            backup_directory VARCHAR(500)
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
                            updated_at TIMESTAMPTZ,
                            backup_directory VARCHAR(500)
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

        cols = _column_names(conn, "backup_settings")
        if cols and "backup_directory" not in cols:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        "ALTER TABLE backup_settings ADD COLUMN backup_directory VARCHAR(500)"
                    )
                )
            else:
                conn.execute(
                    text(
                        "ALTER TABLE backup_settings "
                        "ADD COLUMN IF NOT EXISTS backup_directory VARCHAR(500)"
                    )
                )
            logger.info("[dentalfacil] added backup_settings.backup_directory")
