"""Ensure alta-retroactiva columns exist on already-stamped local DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine


_PATIENT_COLS = [
    ("es_migrado", "BOOLEAN NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("fecha_ingreso_clinica", "DATE", "DATE"),
    ("resumen_historia_previa", "TEXT", "TEXT"),
]

_EVOLUTION_COLS = [
    ("origen", "VARCHAR(20) NOT NULL DEFAULT 'tiempo_real'", "VARCHAR(20) NOT NULL DEFAULT 'tiempo_real'"),
]

_SNAPSHOT_COLS = [
    ("origen", "VARCHAR(20) NOT NULL DEFAULT 'tiempo_real'", "VARCHAR(20) NOT NULL DEFAULT 'tiempo_real'"),
]


def _add_missing(table: str, cols: list[tuple[str, str, str]]) -> None:
    insp = inspect(engine)
    if table not in set(insp.get_table_names()):
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    dialect = engine.dialect.name
    with engine.begin() as conn:
        for name, sqlite_ddl, pg_ddl in cols:
            if name in existing:
                continue
            ddl = sqlite_ddl if dialect == "sqlite" else pg_ddl
            if dialect == "postgresql":
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {ddl}"))
            else:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
            print(f"[dentalfacil] added {table}.{name}", flush=True)


def ensure_alta_retroactiva_schema() -> None:
    _add_missing("patients", _PATIENT_COLS)
    _add_missing("clinical_evolution_entries", _EVOLUTION_COLS)
    _add_missing("odontogram_snapshots", _SNAPSHOT_COLS)
