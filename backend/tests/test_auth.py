"""Auth API integration tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_setup_status_needs_setup(client: TestClient):
    resp = client.get("/api/auth/setup-status")
    assert resp.status_code == 200
    assert resp.json() == {"needs_setup": True}


def test_setup_status_after_admin(client: TestClient, admin_user):
    resp = client.get("/api/auth/setup-status")
    assert resp.status_code == 200
    assert resp.json() == {"needs_setup": False}


def test_login_valid(client: TestClient, admin_user):
    resp = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == ADMIN_EMAIL


def test_login_invalid(client: TestClient, admin_user):
    resp = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "wrong-password"},
    )
    assert resp.status_code == 401


def test_refresh_valid(client: TestClient, admin_tokens: dict):
    resp = client.post(
        "/api/auth/refresh",
        json={"refresh_token": admin_tokens["refresh_token"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_invalid(client: TestClient, admin_user):
    resp = client.post(
        "/api/auth/refresh",
        json={"refresh_token": "not.a.valid.token"},
    )
    assert resp.status_code == 401


def test_logout_revokes_refresh(client: TestClient, admin_tokens: dict):
    access = admin_tokens["access_token"]
    refresh = admin_tokens["refresh_token"]

    resp = client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {access}"},
        json={"refresh_token": refresh},
    )
    assert resp.status_code == 204

    resp = client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh},
    )
    assert resp.status_code == 401


def test_change_password_bumps_token_version(client: TestClient, admin_tokens: dict):
    old_access = admin_tokens["access_token"]
    headers = {"Authorization": f"Bearer {old_access}"}

    me = client.get("/api/users/me", headers=headers)
    assert me.status_code == 200

    resp = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"old_password": ADMIN_PASSWORD, "new_password": "newpass123"},
    )
    assert resp.status_code == 204

    me_old = client.get("/api/users/me", headers=headers)
    assert me_old.status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "newpass123"},
    )
    assert login.status_code == 200
    me_new = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert me_new.status_code == 200
