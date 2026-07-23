"""User management and role limits."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_users_with_roles(
    client: TestClient,
    admin_headers: dict[str, str],
):
    for i, rol in enumerate(["DOCTOR", "ASISTENTE", "CAJERO"]):
        resp = client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "nombre": f"Usuario {rol}",
                "email": f"{rol.lower()}{i}@clinica.pe",
                "password": "clave123",
                "rol": rol,
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["rol"] == rol


def test_max_two_admins(
    client: TestClient,
    admin_headers: dict[str, str],
    admin_user,
):
    second = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "nombre": "Admin Dos",
            "email": "admin2@clinica.pe",
            "password": "clave123",
            "rol": "ADMIN",
        },
    )
    assert second.status_code == 201, second.text

    third = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "nombre": "Admin Tres",
            "email": "admin3@clinica.pe",
            "password": "clave123",
            "rol": "ADMIN",
        },
    )
    assert third.status_code == 400, third.text
    assert "máximo" in third.json()["detail"].lower() or "2" in third.json()["detail"]


def test_invalid_role_rejected(
    client: TestClient,
    admin_headers: dict[str, str],
):
    resp = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "nombre": "Sin Rol",
            "email": "norol@clinica.pe",
            "password": "clave123",
            "rol": "SUPERUSER",
        },
    )
    assert resp.status_code == 400, resp.text
