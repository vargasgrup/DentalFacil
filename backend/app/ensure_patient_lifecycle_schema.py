"""Ensure patient lifecycle columns (sexo, guardian contact) on existing DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_patient_lifecycle_schema")

_COLUMNS: list[tuple[str, str]] = [
    ("sexo", "VARCHAR(20)"),
    ("parentesco_responsable", "VARCHAR(40)"),
    ("telefono_responsable", "VARCHAR(30)"),
    ("documento_responsable", "VARCHAR(30)"),
]


def ensure_patient_lifecycle_schema() -> None:
    insp = inspect(engine)
    if "patients" not in set(insp.get_table_names()):
        return
    cols = {c["name"] for c in insp.get_columns("patients")}
    dialect = engine.dialect.name
    missing = [(name, spec) for name, spec in _COLUMNS if name not in cols]
    if not missing:
        return
    with engine.begin() as conn:
        for name, spec in missing:
            if dialect == "sqlite":
                conn.execute(text(f"ALTER TABLE patients ADD COLUMN {name} {spec}"))
            else:
                conn.execute(
                    text(
                        f"ALTER TABLE patients ADD COLUMN IF NOT EXISTS {name} {spec}"
                    )
                )
            logger.info("[dentalfacil] added patients.%s", name)
