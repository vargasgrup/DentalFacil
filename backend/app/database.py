from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings
from app.logging_config import get_logger
from app.paths import absolute_sqlite_url

logger = get_logger('database')


def _is_sqlite(url: str) -> bool:
    return url.strip().lower().startswith("sqlite")


def _connect_args(url: str) -> dict:
    if _is_sqlite(url):
        return {"check_same_thread": False, "timeout": 60}
    args: dict = {"connect_timeout": 10}
    lower = url.lower()
    if ("railway.app" in lower or "rlwy.net" in lower) and "railway.internal" not in lower:
        args["sslmode"] = "require"
    return args


def _ensure_sqlite_parent(url: str) -> str:
    if not _is_sqlite(url):
        return url
    return absolute_sqlite_url(url)


@event.listens_for(Engine, "connect")
def _sqlite_on_connect(dbapi_connection, connection_record) -> None:  # noqa: ARG001
    if not _is_sqlite(settings.DATABASE_URL):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def _apply_pending_restore_at_boot() -> None:
    """Swap staged clinica.db before opening the engine (Windows installer path)."""
    if not _is_sqlite(settings.DATABASE_URL):
        return
    try:
        from app.sqlite_restore import apply_pending_sqlite_restore

        if apply_pending_sqlite_restore(settings.DATABASE_URL):
            logger.info("[dentalfacil] pending backup restore applied at boot")
    except Exception as exc:  # noqa: BLE001
        logger.error("pending restore at boot failed: %s", exc, exc_info=True)


def _make_engine():
    url = settings.DATABASE_URL
    try:
        url = _ensure_sqlite_parent(url)
        # NullPool: no pooled handles — required for Windows backup/restore file replace
        kwargs: dict = {
            "pool_pre_ping": not _is_sqlite(url),
            "connect_args": _connect_args(url),
        }
        if _is_sqlite(url):
            kwargs["poolclass"] = NullPool
        return create_engine(url, **kwargs)
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[dentalfacil] ERROR create_engine: {exc}")
        if settings.is_production:
            raise RuntimeError(
                f"No se pudo abrir DATABASE_URL en producción: {exc}"
            ) from exc
        fallback = absolute_sqlite_url("sqlite:///./data/clinica_fallback.db")
        logger.warning(
            "[dentalfacil] Using local SQLite fallback DB (dev only): %s", fallback
        )
        return create_engine(
            fallback,
            pool_pre_ping=False,
            poolclass=NullPool,
            connect_args={"check_same_thread": False, "timeout": 60},
        )


_apply_pending_restore_at_boot()
engine = _make_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
