from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings


def _connect_args(url: str) -> dict:
    args: dict = {"connect_timeout": 10}
    lower = url.lower()
    # Railway public Postgres hostnames require TLS; internal *.railway.internal does not.
    if ("railway.app" in lower or "rlwy.net" in lower) and "railway.internal" not in lower:
        args["sslmode"] = "require"
    return args


def _make_engine():
    try:
        return create_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            connect_args=_connect_args(settings.DATABASE_URL),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ERROR create_engine: {exc}", flush=True)
        return create_engine(
            "postgresql+psycopg://invalid:invalid@127.0.0.1:1/invalid",
            pool_pre_ping=False,
            connect_args={"connect_timeout": 1},
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
