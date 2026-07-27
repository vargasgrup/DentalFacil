"""Fail fast when runtime schema is incompatible with UUID models (Railway cutover guard)."""

from __future__ import annotations

import os

from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine

from app.logging_config import get_logger

logger = get_logger('schema_guard')


def assert_schema_compatible_with_uuid_models() -> None:
    """Exit with a clear error if Postgres still has integer PKs under UUID ORM.

    SQLite greenfield / post-ETL is fine. Postgres leftover from pre-UUID Railway
    installs will 500 on login without this guard.

    Emergency only: ALLOW_LEGACY_POSTGRES_INT=1 skips this check (unsupported).
    """
    if settings.is_sqlite:
        return
    if os.environ.get("ALLOW_LEGACY_POSTGRES_INT", "").strip() in ("1", "true", "yes"):
        logger.warning("[dentalfacil] WARNING: ALLOW_LEGACY_POSTGRES_INT=1 — UUID guard skipped",)
        return

    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        if "users" not in tables:
            return
        cols = {c["name"]: c for c in insp.get_columns("users")}
        id_col = cols.get("id")
        if not id_col:
            return
        type_name = type(id_col["type"]).__name__.lower()
        if "int" in type_name or type_name in {"integer", "bigint", "smallint"}:
            msg = (
                "[dentalfacil] FATAL SCHEMA MISMATCH: Postgres users.id is INTEGER but "
                "this build expects UUID String(36).\n"
                "Para DentalSimple/production HOY: NO use ${{Postgres.DATABASE_URL}} todavía.\n"
                "Opciones:\n"
                "  1) Quitar DATABASE_URL de Postgres y usar "
                "DATABASE_URL=sqlite:////data/clinica.db + Volume en /data en el Backend\n"
                "  2) Cutover UUID (scripts.railway_sqlite_cutover) y luego SQLite en /data\n"
                "  3) Emergencia: ALLOW_LEGACY_POSTGRES_INT=1 (login puede fallar; no soportado)\n"
                "See docs/RAILWAY.md"
            )
            logger.info(msg)
            raise SystemExit(2)

        with engine.connect() as conn:
            sample = conn.execute(text("SELECT id FROM users LIMIT 1")).scalar()
        if sample is not None and not isinstance(sample, str):
            logger.info(f"[dentalfacil] FATAL: users.id sample type={type(sample).__name__} "
                "(expected UUID str). Complete SQLite cutover.",
            )
            raise SystemExit(2)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[dentalfacil] schema guard skipped (probe failed): {exc}")
