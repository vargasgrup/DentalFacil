"""Ensure auth-related schema exists even if Alembic was stamped past a failed revision."""

from __future__ import annotations

from sqlalchemy import text

from app.database import engine


def ensure_auth_schema() -> None:
    """Idempotent DDL for JWT revocation columns/tables introduced in l9c0d1e2f3a4."""
    statements = [
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
        """,
        """
        CREATE TABLE IF NOT EXISTS revoked_tokens (
            jti VARCHAR(64) PRIMARY KEY,
            expires_at TIMESTAMPTZ NOT NULL,
            user_id INTEGER REFERENCES users(id),
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
    print("[dentalfacil] auth schema ensured (token_version / revoked_tokens)", flush=True)
