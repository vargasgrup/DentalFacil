"""Ensure unique composite indexes for odontogram / periodontogram (greenfield SQLite)."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine


_INDEXES = (
    (
        "odontogram_entries",
        "ix_odontogram_patient_pieza_denticion",
        ("patient_id", "pieza_fdi", "denticion"),
    ),
    (
        "periodontogram_entries",
        "ix_periodontogram_pieza",
        ("patient_id", "pieza_fdi", "denticion"),
    ),
)


def ensure_odontogram_unique_indexes() -> None:
    """Create unique (patient_id, pieza_fdi, denticion) indexes if missing."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, index_name, cols in _INDEXES:
            if table not in tables:
                continue
            existing = {ix["name"] for ix in insp.get_indexes(table)}
            if index_name in existing:
                continue
            col_sql = ", ".join(cols)
            conn.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} ON {table} ({col_sql})"
                )
            )
            print(f"[dentalfacil] ensured unique index {index_name}", flush=True)
