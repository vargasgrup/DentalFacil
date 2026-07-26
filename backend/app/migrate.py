"""Alembic migrations — must complete before patient/clinical writes."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from app.logging_config import get_logger

logger = get_logger("migrate")

_migrations_ok = False
_migrations_error: str | None = None

HEAD_REVISION = "q11backup_dir"


def migrations_status() -> dict:
    return {"ok": _migrations_ok, "error": _migrations_error}


def _candidate_roots() -> list[Path]:
    roots: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        roots.append(Path(meipass))
    if getattr(sys, "frozen", False):
        roots.append(Path(sys.executable).resolve().parent)
    # backend/ when running from source (this file → app → backend)
    roots.append(Path(__file__).resolve().parents[1])
    roots.append(Path.cwd())
    out: list[Path] = []
    seen: set[str] = set()
    for r in roots:
        key = str(r.resolve()) if r.exists() else str(r)
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def alembic_config():
    """Load alembic.ini with absolute script_location (PyInstaller-safe)."""
    from alembic.config import Config

    for root in _candidate_roots():
        ini = root / "alembic.ini"
        scripts = root / "alembic"
        if ini.is_file() and scripts.is_dir():
            cfg = Config(str(ini))
            cfg.set_main_option("script_location", str(scripts))
            try:
                from app.config import settings

                cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
            except Exception:  # noqa: BLE001
                db = os.environ.get("DATABASE_URL")
                if db:
                    cfg.set_main_option("sqlalchemy.url", db)
            logger.info("[dentalfacil] alembic.ini from %s", ini)
            return cfg

    raise FileNotFoundError(
        "alembic.ini / alembic/ not found beside the app "
        f"(searched: {[str(r) for r in _candidate_roots()]})"
    )


def _sqlite_bootstrap() -> bool:
    """Create UUID schema from models and stamp Alembic head (skip PG-only history)."""
    global _migrations_ok, _migrations_error
    from alembic import command
    from sqlalchemy import inspect, text

    from app.database import Base, engine
    import app.models  # noqa: F401

    logger.info("[dentalfacil] SQLite bootstrap: create_all + stamp head")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys=ON"))
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

    cfg = alembic_config()
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
            from sqlalchemy import inspect

            from app.database import engine

            insp = inspect(engine)
            tables = set(insp.get_table_names())
            if "alembic_version" not in tables or "users" not in tables:
                return _sqlite_bootstrap()
            try:
                from alembic import command

                command.upgrade(alembic_config(), "head")
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"[dentalfacil] SQLite upgrade note: {exc}")
                from alembic import command
                from app.db_health import schema_ready

                ready, _ = schema_ready()
                if ready:
                    try:
                        from app.ensure_backup_schema import ensure_backup_schema

                        ensure_backup_schema()
                    except Exception as ensure_exc:  # noqa: BLE001
                        logger.warning(
                            "[dentalfacil] ensure_backup_schema after stamp note: %s",
                            ensure_exc,
                        )
                    command.stamp(alembic_config(), HEAD_REVISION)
                else:
                    return _sqlite_bootstrap()
            else:
                try:
                    from app.ensure_backup_schema import ensure_backup_schema

                    ensure_backup_schema()
                except Exception as ensure_exc:  # noqa: BLE001
                    logger.warning(
                        "[dentalfacil] ensure_backup_schema after upgrade note: %s",
                        ensure_exc,
                    )
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

            logger.info(f"[dentalfacil] running migrations (attempt {attempt}/{retries})...")
            command.upgrade(alembic_config(), "head")
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
                    from app.db_health import schema_ready

                    cfg = alembic_config()
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
                        logger.info(
                            "[dentalfacil] schema_ready but duplicate-column mid-upgrade; "
                            "NOT stamping head — re-raise for retry/manual fix",
                        )
                except Exception as stamp_exc:  # noqa: BLE001
                    logger.error(f"[dentalfacil] stamp recovery failed: {stamp_exc}")
                    _migrations_error = f"{err} | stamp: {stamp_exc}"

            if attempt < retries:
                time.sleep(2 * attempt)
    return False
