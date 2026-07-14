"""Ensure clinical_evolution_entries has economic / plan-link columns on existing DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine


_EVOLUTION_EXTRA = [
    ("pieza_fdi", "VARCHAR(4)"),
    ("cantidad", "NUMERIC(10,2) DEFAULT 1"),
    ("costo_unitario", "NUMERIC(10,2) DEFAULT 0"),
    ("plan_item_id", "VARCHAR(40)"),
]


def ensure_clinical_evolution_schema() -> None:
    insp = inspect(engine)
    if "clinical_evolution_entries" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("clinical_evolution_entries")}
    dialect = engine.dialect.name
    with engine.begin() as conn:
        for col, ddl in _EVOLUTION_EXTRA:
            if col in existing:
                continue
            if dialect == "postgresql":
                conn.execute(
                    text(
                        f"ALTER TABLE clinical_evolution_entries "
                        f"ADD COLUMN IF NOT EXISTS {col} {ddl}"
                    )
                )
            else:
                conn.execute(
                    text(f"ALTER TABLE clinical_evolution_entries ADD COLUMN {col} {ddl}")
                )
            print(f"[dentalfacil] added clinical_evolution_entries.{col}", flush=True)
