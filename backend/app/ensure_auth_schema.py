"""Ensure auth-related schema exists even if Alembic was stamped past a failed revision."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine

from app.logging_config import get_logger

logger = get_logger("ensure_auth_schema")


def _ensure_sqlite_user_columns() -> None:
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    with engine.begin() as conn:
        if "token_version" not in cols:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
            )
        if "modulos_acceso" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN modulos_acceso TEXT"))


def ensure_auth_schema() -> None:
    """Idempotent DDL for JWT revocation and user module permissions."""
    if settings.is_sqlite:
        try:
            _ensure_sqlite_user_columns()
            logger.info("[dentalfacil] auth schema (SQLite): user columns ensured")
        except Exception as exc:  # noqa: BLE001
            logger.warning("[dentalfacil] SQLite auth column ensure skipped: %s", exc)
        return

    statements = [
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
        """,
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS modulos_acceso TEXT
        """,
        """
        CREATE TABLE IF NOT EXISTS revoked_tokens (
            jti VARCHAR(64) PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL,
            user_id VARCHAR(36) REFERENCES users(id),
            reason VARCHAR(100),
            revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_revoked_tokens_expires_at
        ON revoked_tokens (expires_at)
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_revoked_tokens_user_id
        ON revoked_tokens (user_id)
        """,
    ]
    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))
    logger.info("[dentalfacil] auth schema ensured (token_version / modulos_acceso / revoked_tokens)")
