"""Ensure cash_sessions / cash_transactions columns for controlled till."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_cash_schema")

_SESSION_COLS: list[tuple[str, str]] = [
    ("open_lock", "INTEGER"),
    ("monto_contado", "NUMERIC(10,2)"),
    ("diferencia", "NUMERIC(10,2)"),
    ("cierre_notas", "VARCHAR(500)"),
    ("cerrada_por_id", "VARCHAR(36)"),
]

_TX_COLS: list[tuple[str, str]] = [
    ("anulado", "BOOLEAN DEFAULT 0"),
    ("anulado_en", "TIMESTAMP"),
    ("anulado_por_id", "VARCHAR(36)"),
    ("anulacion_motivo", "VARCHAR(255)"),
]


def ensure_cash_schema() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    dialect = engine.dialect.name

    if "cash_sessions" in tables:
        cols = {c["name"] for c in insp.get_columns("cash_sessions")}
        missing = [(n, s) for n, s in _SESSION_COLS if n not in cols]
        if missing:
            with engine.begin() as conn:
                for name, spec in missing:
                    if dialect == "sqlite":
                        conn.execute(text(f"ALTER TABLE cash_sessions ADD COLUMN {name} {spec}"))
                    else:
                        conn.execute(
                            text(
                                f"ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS {name} {spec}"
                            )
                        )
                    logger.info("[dentalfacil] added cash_sessions.%s", name)

        # Unique open session: only one row may have open_lock=1
        with engine.begin() as conn:
            if dialect == "sqlite":
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ux_cash_sessions_open_lock "
                        "ON cash_sessions (open_lock)"
                    )
                )
            else:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ux_cash_sessions_open_lock "
                        "ON cash_sessions (open_lock)"
                    )
                )
            # Backfill open_lock for existing open sessions (best-effort single open)
            open_rows = conn.execute(
                text(
                    "SELECT id FROM cash_sessions WHERE estado = 'abierta' "
                    "ORDER BY abierta_en ASC"
                )
            ).fetchall()
            if open_rows:
                # Keep first open as lock=1; close extras shouldn't happen — leave others NULL
                first_id = open_rows[0][0]
                conn.execute(
                    text("UPDATE cash_sessions SET open_lock = 1 WHERE id = :id"),
                    {"id": first_id},
                )
                for row in open_rows[1:]:
                    conn.execute(
                        text(
                            "UPDATE cash_sessions SET estado = 'cerrada', open_lock = NULL "
                            "WHERE id = :id AND estado = 'abierta'"
                        ),
                        {"id": row[0]},
                    )

    if "cash_transactions" in tables:
        cols = {c["name"] for c in insp.get_columns("cash_transactions")}
        missing = [(n, s) for n, s in _TX_COLS if n not in cols]
        if not missing:
            return
        with engine.begin() as conn:
            for name, spec in missing:
                if dialect == "sqlite":
                    conn.execute(
                        text(f"ALTER TABLE cash_transactions ADD COLUMN {name} {spec}")
                    )
                else:
                    conn.execute(
                        text(
                            f"ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS {name} {spec}"
                        )
                    )
                logger.info("[dentalfacil] added cash_transactions.%s", name)
