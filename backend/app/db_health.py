"""Lightweight PostgreSQL readiness checks."""

from __future__ import annotations

from sqlalchemy import text

from app.database import engine


def ping_database() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def schema_ready() -> tuple[bool, str | None]:
    """Verify core tables exist (patient + clinical record flow)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1 FROM patients LIMIT 1"))
            conn.execute(text("SELECT 1 FROM clinical_records LIMIT 1"))
        return True, None
    except Exception as exc:
        return False, str(exc)
