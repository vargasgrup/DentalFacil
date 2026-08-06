"""Auth API integration tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME


def test_setup_status_needs_setup(client: TestClient):
    resp = client.get("/api/auth/setup-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_setup"] is True
    assert "demo_mode" in body


def test_setup_status_after_admin(client: TestClient, admin_user):
    resp = client.get("/api/auth/setup-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["needs_setup"] is False
    assert "demo_mode" in body


def test_login_valid(client: TestClient, admin_user):
    resp = client.post(
        "/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["username"].lower() == ADMIN_USERNAME.lower()
    assert data["user"]["email"] == ADMIN_EMAIL


def test_login_legacy_email_still_works(client: TestClient, admin_user):
    resp = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200


def test_login_invalid(client: TestClient, admin_user):
    resp = client.post(
        "/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": "wrong-password"},
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
        json={"username": ADMIN_USERNAME, "password": "newpass123"},
    )
    assert login.status_code == 200
    me_new = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )
    assert me_new.status_code == 200


def test_update_me_nombre_and_username(client: TestClient, admin_tokens: dict):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "current_password": ADMIN_PASSWORD,
            "nombre": "Admin Clínica",
            "username": ADMIN_USERNAME,
            "email": ADMIN_EMAIL,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["nombre"] == "Admin Clínica"
    assert body["username"].lower() == ADMIN_USERNAME.lower()
    assert body["email"].lower() == ADMIN_EMAIL.lower()


def test_update_me_rejects_wrong_password(client: TestClient, admin_tokens: dict):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "current_password": "wrong-password",
            "nombre": "Otro Nombre",
        },
    )
    assert resp.status_code == 400


def test_update_me_password_and_relogin(client: TestClient, admin_tokens: dict):
    headers = {"Authorization": f"Bearer {admin_tokens['access_token']}"}
    resp = client.patch(
        "/api/users/me",
        headers=headers,
        json={
            "current_password": ADMIN_PASSWORD,
            "nombre": "Admin",
            "username": ADMIN_USERNAME,
            "email": ADMIN_EMAIL,
            "new_password": "newerpass99",
            "confirm_new_password": "newerpass99",
        },
    )
    assert resp.status_code == 200, resp.text

    assert client.get("/api/users/me", headers=headers).status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": "newerpass99"},
    )
    assert login.status_code == 200
    new_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    reset = client.patch(
        "/api/users/me",
        headers=new_headers,
        json={
            "current_password": "newerpass99",
            "new_password": ADMIN_PASSWORD,
            "confirm_new_password": ADMIN_PASSWORD,
        },
    )
    assert reset.status_code == 200, reset.text


def test_logout_all_invalidates_previous_token(client: TestClient, admin_headers, admin_user):
    """POST /api/auth/logout-all bump token_version y revoca el JWT actual."""
    me = client.get("/api/users/me", headers=admin_headers)
    assert me.status_code == 200

    out = client.post("/api/auth/logout-all", headers=admin_headers)
    assert out.status_code == 204, out.text

    after = client.get("/api/users/me", headers=admin_headers)
    assert after.status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
    )
    assert login.status_code == 200
    fresh = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me2 = client.get("/api/users/me", headers=fresh)
    assert me2.status_code == 200
