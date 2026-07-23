"""Alembic migrations — must complete before patient/clinical writes."""

from __future__ import annotations

import time

from app.logging_config import get_logger

logger = get_logger('migrate')

_migrations_ok = False
_migrations_error: str | None = None

HEAD_REVISION = "o2alta_retroactiva"


def migrations_status() -> dict:
    return {"ok": _migrations_ok, "error": _migrations_error}


def _sqlite_bootstrap() -> bool:
    """Create UUID schema from models and stamp Alembic head (skip PG-only history)."""
    global _migrations_ok, _migrations_error
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect, text

    from app.database import Base, engine
    import app.models  # noqa: F401

    logger.info("[dentalfacil] SQLite bootstrap: create_all + stamp head")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
        # Seed clinic_settings singleton if missing
        from app.models.ids import CLINIC_SETTINGS_ID

        insp = inspect(conn)
        if "clinic_settings" in insp.get_table_names():
            exists = conn.execute(
                text("SELECT 1 FROM clinic_settings WHERE id = :id"),
                {"id": CLINIC_SETTINGS_ID},
            ).scalar()
            if not exists:
                conn.execute(
                    text(
                        "INSERT INTO clinic_settings (id, hora_apertura, hora_cierre) "
                        "VALUES (:id, '08:00', '20:00')"
                    ),
                    {"id": CLINIC_SETTINGS_ID},
                )

    cfg = Config("alembic.ini")
    command.stamp(cfg, HEAD_REVISION)
    _migrations_ok = True
    _migrations_error = None
    logger.info("[dentalfacil] SQLite bootstrap ok")
    return True


def run_migrations_blocking(retries: int = 3) -> bool:
    """Apply migrations. SQLite empty DBs use metadata bootstrap (no PG history)."""
    global _migrations_ok, _migrations_error

    from app.config import settings

    if settings.is_sqlite:
        try:
            from sqlalchemy import inspect, text

            from app.database import engine

            insp = inspect(engine)
            tables = set(insp.get_table_names())
            if "alembic_version" not in tables or "users" not in tables:
                return _sqlite_bootstrap()
            # Already bootstrapped / stamped — try upgrade (usually no-op at head)
            try:
                from alembic import command
                from alembic.config import Config

                command.upgrade(Config("alembic.ini"), "head")
            except Exception as exc:  # noqa: BLE001
                # If chain is broken for sqlite, re-stamp head if schema looks ready
                logger.warning(f"[dentalfacil] SQLite upgrade note: {exc}")
                from alembic import command
                from alembic.config import Config
                from app.db_health import schema_ready

                ready, _ = schema_ready()
                if ready:
                    command.stamp(Config("alembic.ini"), HEAD_REVISION)
                else:
                    return _sqlite_bootstrap()
            _migrations_ok = True
            _migrations_error = None
            return True
        except Exception as exc:  # noqa: BLE001
            _migrations_ok = False
            _migrations_error = str(exc)
            logger.error(f"[dentalfacil] SQLite migrations FAILED: {exc}")
            return False

    for attempt in range(1, retries + 1):
        try:
            from alembic import command
            from alembic.config import Config

            logger.info(f"[dentalfacil] running migrations (attempt {attempt}/{retries})...")
            command.upgrade(Config("alembic.ini"), "head")
            _migrations_ok = True
            _migrations_error = None
            logger.info("[dentalfacil] migrations ok")
            return True
        except Exception as exc:  # noqa: BLE001
            err = str(exc)
            _migrations_ok = False
            _migrations_error = err
            logger.error(f"[dentalfacil] migrations FAILED (attempt {attempt}): {exc}")

            duplicate = any(
                token in err.lower()
                for token in ("duplicatecolumn", "already exists", "duplicate table")
            )
            if duplicate:
                stamp_target = None
                lower = err.lower()
                if "lugar_nacimiento" in lower or "plan_tratamiento_new" in lower:
                    stamp_target = "f1030bfb1b16"
                elif "firma_odontologo" in lower or "firma_paciente" in lower:
                    stamp_target = "c9f2a1b3d4e5"
                elif "denticion" in lower or "superficies" in lower:
                    stamp_target = "e2b3c4d5e6f7"
                try:
                    from alembic import command
                    from alembic.config import Config
                    from app.db_health import schema_ready

                    cfg = Config("alembic.ini")
                    ready, _ = schema_ready()
                    if stamp_target:
                        logger.info(f"[dentalfacil] stamping {stamp_target} then retry upgrade")
                        command.stamp(cfg, stamp_target)
                        command.upgrade(cfg, "head")
                        _migrations_ok = True
                        _migrations_error = None
                        logger.info("[dentalfacil] migrations ok after stamp+upgrade")
                        return True
                    if ready:
                        logger.info("[dentalfacil] schema_ready but duplicate-column mid-upgrade; "
                            "NOT stamping head — re-raise for retry/manual fix",)
                except Exception as stamp_exc:  # noqa: BLE001
                    logger.error(f"[dentalfacil] stamp recovery failed: {stamp_exc}")
                    _migrations_error = f"{err} | stamp: {stamp_exc}"

            if attempt < retries:
                time.sleep(2 * attempt)
    return False
