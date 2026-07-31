"""DEMO_MODE — Admin credentials lock for shared-login demos."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


@pytest.fixture()
def demo_on(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DEMO_MODE", "true")
    from app.config import settings

    monkeypatch.setattr(settings, "DEMO_MODE", True)
    yield


def test_demo_blocks_admin_change_password(
    client: TestClient, admin_tokens: dict, demo_on
):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": ADMIN_PASSWORD, "new_password": "hacked999"},
    )
    assert resp.status_code == 403
    assert "DEMO" in resp.json()["detail"]

    # Credentials unchanged
    login = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert login.status_code == 200


def test_demo_blocks_admin_password_via_me(
    client: TestClient, admin_tokens: dict, demo_on
):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "current_password": ADMIN_PASSWORD,
            "new_password": "hacked999",
            "confirm_new_password": "hacked999",
        },
    )
    assert resp.status_code == 403


def test_demo_blocks_admin_email_change(
    client: TestClient, admin_tokens: dict, demo_on
):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "current_password": ADMIN_PASSWORD,
            "email": "otro-admin@example.com",
        },
    )
    assert resp.status_code == 403


def test_demo_allows_admin_nombre_change(
    client: TestClient, admin_tokens: dict, demo_on
):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "current_password": ADMIN_PASSWORD,
            "nombre": "Admin Demo Visible",
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["nombre"] == "Admin Demo Visible"


def test_demo_setup_status_flags(client: TestClient, demo_on):
    resp = client.get("/api/auth/setup-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["demo_mode"] is True
    assert body["demo_admin_credentials_locked"] is True
