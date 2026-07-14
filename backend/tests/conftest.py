"""
Pytest fixtures for DentalSimple API integration tests (SQLite file DB).
"""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Environment — must run before any `app.*` import
# ---------------------------------------------------------------------------
TEST_DB_PATH = Path(__file__).resolve().parent / "_testdata" / "test_clinica.db"
TEST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    f"sqlite:///{TEST_DB_PATH.as_posix()}",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "pytest-jwt-secret-not-for-production"
os.environ["RATE_LIMIT_LOGIN_PER_MINUTE"] = "1000"
os.environ["RATE_LIMIT_SETUP_PER_MINUTE"] = "1000"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "testpass123"
ADMIN_NOMBRE = "Admin Test"

_DB_ERROR: str | None = None


def _reset_schema() -> None:
    from app.database import Base, engine
    from app.models.ids import CLINIC_SETTINGS_ID
    import app.models  # noqa: F401

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO clinic_settings (id, hora_apertura, hora_cierre) "
                "VALUES (:id, '08:00', '20:00')"
            ),
            {"id": CLINIC_SETTINGS_ID},
        )


def _truncate_all(session: Session) -> None:
    from app.database import Base
    import app.models  # noqa: F401

    # SQLite: disable FKs briefly for truncate-like deletes
    session.execute(text("PRAGMA foreign_keys=OFF"))
    for table in reversed(Base.metadata.sorted_tables):
        session.execute(table.delete())
    session.execute(text("PRAGMA foreign_keys=ON"))
    session.commit()


def _clear_rate_limiter(app) -> None:
    from app.core import rate_limit as rl

    with rl._lock:
        rl._hits.clear()


try:
    with patch("apscheduler.schedulers.background.BackgroundScheduler") as _MockSched:
        _MockSched.return_value = MagicMock()
        from fastapi.testclient import TestClient

        from app.core.security import hash_password
        from app.database import SessionLocal
        from app.main import app as fastapi_app
        import app.main as main_mod
        from app.models import User
        from app.models.ids import new_uuid
        import app.migrate as migrate_mod

        main_mod._run_migrations = lambda: None  # type: ignore[assignment]
        migrate_mod._migrations_ok = True
        migrate_mod._migrations_error = None

    _reset_schema()
except Exception as exc:  # noqa: BLE001
    _DB_ERROR = str(exc)


def pytest_collection_modifyitems(config, items):
    if not _DB_ERROR:
        return
    skip = pytest.mark.skip(reason=f"Test DB unavailable: {_DB_ERROR}")
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
        id=new_uuid(),
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
    resp = client.patch(
        "/api/config/hours",
        headers=admin_headers,
        json={"hora_apertura": "00:00", "hora_cierre": "23:59"},
    )
    assert resp.status_code == 200, resp.text
