"""Ensure clinical_evolution_entries has economic / plan-link columns on existing DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine

from app.logging_config import get_logger

logger = get_logger('ensure_clinical_schema')


_EVOLUTION_EXTRA = [
    ("pieza_fdi", "VARCHAR(4)"),
    ("cantidad", "NUMERIC(10,2) DEFAULT 1"),
    ("costo_unitario", "NUMERIC(10,2) DEFAULT 0"),
    ("plan_item_id", "VARCHAR(40)"),
]

_CASH_TX_EXTRA = [
    ("evolution_entry_id", "VARCHAR(36)"),
    ("plan_item_ref", "VARCHAR(80)"),
    ("pieza_fdi", "VARCHAR(4)"),
    ("grupo_pago_id", "VARCHAR(36)"),
]


def ensure_clinical_evolution_schema() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if "clinical_evolution_entries" in tables:
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
                        text(
                            f"ALTER TABLE clinical_evolution_entries ADD COLUMN {col} {ddl}"
                        )
                    )
                logger.info(f"[dentalfacil] added clinical_evolution_entries.{col}")

    if "cash_transactions" in tables:
        existing = {c["name"] for c in insp.get_columns("cash_transactions")}
        dialect = engine.dialect.name
        with engine.begin() as conn:
            for col, ddl in _CASH_TX_EXTRA:
                if col in existing:
                    continue
                if dialect == "postgresql":
                    conn.execute(
                        text(
                            f"ALTER TABLE cash_transactions "
                            f"ADD COLUMN IF NOT EXISTS {col} {ddl}"
                        )
                    )
                else:
                    conn.execute(
                        text(f"ALTER TABLE cash_transactions ADD COLUMN {col} {ddl}")
                    )
                logger.info(f"[dentalfacil] added cash_transactions.{col}")
