"""Password recovery (forgot / reset with code)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_forgot_password_generic_ok(client: TestClient, admin_user):
    unknown = client.post(
        "/api/auth/forgot-password",
        json={"email": "nobody@example.com"},
    )
    assert unknown.status_code == 200, unknown.text
    assert unknown.json()["ok"] is True

    known = client.post(
        "/api/auth/forgot-password",
        json={"email": ADMIN_EMAIL},
    )
    assert known.status_code == 200, known.text
    body = known.json()
    assert body["ok"] is True
    assert body["delivery"] in ("email", "admin", "none")


def test_reset_password_with_code(
    client: TestClient,
    admin_user,
    admin_headers: dict[str, str],
    monkeypatch,
):
    monkeypatch.setenv("PASSWORD_RESET_INLINE_CODE", "true")
    # settings already loaded — set attribute directly
    from app.config import settings

    monkeypatch.setattr(settings, "PASSWORD_RESET_INLINE_CODE", True)

    forgot = client.post("/api/auth/forgot-password", json={"email": ADMIN_EMAIL})
    assert forgot.status_code == 200, forgot.text
    code = forgot.json().get("reset_code")
    assert code and len(code) == 6

    # Admin can list pending request
    pending = client.get("/api/auth/password-reset-requests", headers=admin_headers)
    assert pending.status_code == 200
    assert any(r["email"].lower() == ADMIN_EMAIL.lower() for r in pending.json())

    bad = client.post(
        "/api/auth/reset-password",
        json={
            "email": ADMIN_EMAIL,
            "code": "000000",
            "new_password": "NuevaClave123!",
            "confirm_password": "NuevaClave123!",
        },
    )
    assert bad.status_code == 400

    ok = client.post(
        "/api/auth/reset-password",
        json={
            "email": ADMIN_EMAIL,
            "code": code,
            "new_password": "NuevaClave123!",
            "confirm_password": "NuevaClave123!",
        },
    )
    assert ok.status_code == 204, ok.text

    # Old password fails
    old = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert old.status_code == 401

    # New password works
    neu = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "NuevaClave123!"},
    )
    assert neu.status_code == 200, neu.text


def test_password_reset_requests_requires_admin(client: TestClient, admin_user):
    assert client.get("/api/auth/password-reset-requests").status_code == 401
