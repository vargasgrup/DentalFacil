"""Ensure patients.activo exists on already-stamped local DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_patient_activo_schema")


def ensure_patient_activo_schema() -> None:
    insp = inspect(engine)
    if "patients" not in set(insp.get_table_names()):
        return
    cols = {c["name"] for c in insp.get_columns("patients")}
    if "activo" in cols:
        return
    with engine.begin() as conn:
        # SQLite / Postgres: boolean server default
        dialect = engine.dialect.name
        if dialect == "sqlite":
            conn.execute(text("ALTER TABLE patients ADD COLUMN activo BOOLEAN NOT NULL DEFAULT 1"))
        else:
            conn.execute(
                text("ALTER TABLE patients ADD COLUMN activo BOOLEAN NOT NULL DEFAULT TRUE")
            )
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_patients_activo ON patients (activo)"))
        except Exception:  # noqa: BLE001
            pass
    logger.info("[dentalfacil] added patients.activo")
