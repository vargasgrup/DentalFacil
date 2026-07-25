"""Vendor break-glass: rescue locked ADMIN password."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


def test_vendor_list_admins_requires_key(client: TestClient, admin_user):
    bad = client.post(
        "/api/system/vendor/list-admins",
        json={"access_key": "wrong-key-xxxxxxxx"},
    )
    assert bad.status_code == 403

    ok = client.post(
        "/api/system/vendor/list-admins",
        json={"access_key": "Solo,yo1532"},
    )
    assert ok.status_code == 200, ok.text
    emails = [a["email"].lower() for a in ok.json()["admins"]]
    assert ADMIN_EMAIL.lower() in emails


def test_vendor_rescue_admin_password(client: TestClient, admin_user):
    missing_confirm = client.post(
        "/api/system/vendor/rescue-admin-password",
        json={
            "access_key": "Solo,yo1532",
            "admin_email": ADMIN_EMAIL,
            "new_password": "RescuePass123!",
            "confirm_password": "RescuePass123!",
            "confirm_token": "NO",
        },
    )
    assert missing_confirm.status_code == 400

    non_admin = client.post(
        "/api/users",
        headers={
            "Authorization": f"Bearer {client.post('/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}).json()['access_token']}"
        },
        json={
            "nombre": "Asistente Rescue",
            "email": "asist.rescue@example.com",
            "password": "Asist123!",
            "rol": "ASISTENTE",
        },
    )
    assert non_admin.status_code == 201, non_admin.text

    refuse_asist = client.post(
        "/api/system/vendor/rescue-admin-password",
        json={
            "access_key": "Solo,yo1532",
            "admin_email": "asist.rescue@example.com",
            "new_password": "RescuePass123!",
            "confirm_password": "RescuePass123!",
            "confirm_token": "RESCATAR",
        },
    )
    assert refuse_asist.status_code == 400

    ok = client.post(
        "/api/system/vendor/rescue-admin-password",
        json={
            "access_key": "Solo,yo1532",
            "admin_email": ADMIN_EMAIL,
            "new_password": "RescuePass123!",
            "confirm_password": "RescuePass123!",
            "confirm_token": "RESCATAR",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["ok"] is True

    old = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert old.status_code == 401

    neu = client.post(
        "/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": "RescuePass123!"},
    )
    assert neu.status_code == 200, neu.text
