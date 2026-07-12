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
    """Verify core tables/columns exist for patient + clinical record flow."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1 FROM patients LIMIT 1"))
            conn.execute(text("SELECT 1 FROM clinical_records LIMIT 1"))
            # Columns that blocked Railway when Alembic was behind the live schema
            conn.execute(
                text(
                    "SELECT lugar_nacimiento, ocupacion, estado_civil, nombre_responsable "
                    "FROM patients LIMIT 1"
                )
            )
            conn.execute(
                text("SELECT observaciones, plan_tratamiento FROM clinical_records LIMIT 1")
            )
        return True, None
    except Exception as exc:
        return False, str(exc)
