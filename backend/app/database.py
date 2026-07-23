from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

from app.logging_config import get_logger

logger = get_logger('database')


def _is_sqlite(url: str) -> bool:
    return url.strip().lower().startswith("sqlite")


def _connect_args(url: str) -> dict:
    if _is_sqlite(url):
        return {"check_same_thread": False}
    args: dict = {"connect_timeout": 10}
    lower = url.lower()
    if ("railway.app" in lower or "rlwy.net" in lower) and "railway.internal" not in lower:
        args["sslmode"] = "require"
    return args


def _ensure_sqlite_parent(url: str) -> None:
    if not _is_sqlite(url):
        return
    from sqlalchemy.engine.url import make_url

    db_path = make_url(url).database
    if not db_path or db_path == ":memory:":
        return
    path = Path(db_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)


@event.listens_for(Engine, "connect")
def _sqlite_on_connect(dbapi_connection, connection_record) -> None:  # noqa: ARG001
    if not _is_sqlite(settings.DATABASE_URL):
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def _make_engine():
    url = settings.DATABASE_URL
    try:
        _ensure_sqlite_parent(url)
        return create_engine(
            url,
            pool_pre_ping=not _is_sqlite(url),
            connect_args=_connect_args(url),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(f"[dentalfacil] ERROR create_engine: {exc}")
        fallback = "sqlite:///./data/clinica_fallback.db"
        _ensure_sqlite_parent(fallback)
        return create_engine(
            fallback,
            pool_pre_ping=False,
            connect_args={"check_same_thread": False},
        )


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
