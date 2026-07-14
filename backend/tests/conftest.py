"""Pytest fixtures for DentalSimple API integration tests.

Env vars are set BEFORE importing the FastAPI app so Settings / engine point
at the isolated test database.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from unittest.mock import MagicMock, patch
from urllib.parse import urlparse

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Environment — must run before any `app.*` import
# ---------------------------------------------------------------------------
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://dentalsimple:dentalsimple@127.0.0.1:5434/dentalsimple_test",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "pytest-jwt-secret-not-for-production"
os.environ["RATE_LIMIT_LOGIN_PER_MINUTE"] = "1000"
os.environ["RATE_LIMIT_SETUP_PER_MINUTE"] = "1000"

ADMIN_EMAIL = "admin@test.local"
ADMIN_PASSWORD = "testpass123"
ADMIN_NOMBRE = "Admin Test"

_DB_ERROR: str | None = None


def _admin_url_from_test_url(url: str) -> tuple[str, str]:
    """Return (maintenance connection URL, test DB name)."""
    parsed = urlparse(url.replace("postgresql+psycopg://", "postgresql://", 1))
    db_name = (parsed.path or "/dentalsimple_test").lstrip("/") or "dentalsimple_test"
    # Connect to docker-compose default DB to run CREATE DATABASE.
    maintenance = parsed._replace(path="/dentalsimple").geturl()
    maintenance = maintenance.replace("postgresql://", "postgresql+psycopg://", 1)
    return maintenance, db_name


def _ensure_test_database() -> None:
    maintenance_url, db_name = _admin_url_from_test_url(TEST_DATABASE_URL)
    engine = create_engine(
        maintenance_url,
        isolation_level="AUTOCOMMIT",
        connect_args={"connect_timeout": 3},
    )
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    finally:
        engine.dispose()


def _reset_schema() -> None:
    from app.database import Base, engine
    import app.models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def _truncate_all(session: Session) -> None:
    from app.database import Base
    import app.models  # noqa: F401

    tables = ", ".join(f'"{t.name}"' for t in reversed(Base.metadata.sorted_tables))
    if tables:
        session.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))
        session.commit()


def _clear_rate_limiter(app) -> None:
    from app.core import rate_limit as rl

    with rl._lock:
        rl._hits.clear()


try:
    _ensure_test_database()
except Exception as exc:  # noqa: BLE001
    _DB_ERROR = str(exc)


# Import app only after env is set. Mock scheduler; skip real alembic on test DB
# (schema comes from Base.metadata.create_all).
with patch("apscheduler.schedulers.background.BackgroundScheduler") as _MockSched:
    _MockSched.return_value = MagicMock()
    from fastapi.testclient import TestClient

    from app.core.security import hash_password
    from app.database import SessionLocal
    from app.main import app as fastapi_app
    import app.main as main_mod
    from app.models import User
    import app.migrate as migrate_mod

    main_mod._run_migrations = lambda: None  # type: ignore[assignment]
    migrate_mod._migrations_ok = True
    migrate_mod._migrations_error = None


if _DB_ERROR is None:
    try:
        _reset_schema()
    except Exception as exc:  # noqa: BLE001
        _DB_ERROR = str(exc)


def pytest_collection_modifyitems(config, items):
    if not _DB_ERROR:
        return
    skip = pytest.mark.skip(
        reason=(
            f"Test DB unavailable ({TEST_DATABASE_URL}): {_DB_ERROR}. "
            "Start Postgres with `docker compose up -d db` from the repo root."
        )
    )
    for item in items:
        item.add_marker(skip)


@pytest.fixture(scope="session")
def app():
    return fastapi_app


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(app) -> Generator[TestClient, None, None]:
    """HTTP client with lifespan; tables truncated before each test."""
    _clear_rate_limiter(app)

    session = SessionLocal()
    try:
        _truncate_all(session)
    finally:
        session.close()

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture()
def admin_user(client: TestClient, db: Session) -> User:
    user = User(
        nombre=ADMIN_NOMBRE,
        email=ADMIN_EMAIL,
        password_hash=hash_password(ADMIN_PASSWORD),
        rol="ADMIN",
        activo=True,
        token_version=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def admin_headers(client: TestClient, admin_user: User) -> dict[str, str]:
    resp = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_tokens(client: TestClient, admin_user: User) -> dict:
    resp = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.fixture()
def patient(client: TestClient, admin_headers: dict[str, str]) -> dict:
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Ana",
            "apellidos": "Pérez",
            "tipo_documento": "DNI",
            "numero_documento": "12345678",
            "telefono": "999111222",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
def open_cash_session(client: TestClient, admin_headers: dict[str, str]) -> dict:
    resp = client.post(
        "/api/cash/session/open",
        headers=admin_headers,
        json={"monto_inicial": 100.0},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.fixture()
def wide_clinic_hours(client: TestClient, admin_headers: dict[str, str]) -> None:
    """Wide hours so positive appointment tests are not time-of-day fragile."""
    resp = client.patch(
        "/api/config/hours",
        headers=admin_headers,
        json={"hora_apertura": "00:00", "hora_cierre": "23:59"},
    )
    assert resp.status_code == 200, resp.text
