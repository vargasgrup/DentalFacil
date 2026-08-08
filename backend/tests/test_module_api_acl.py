"""Server-side module ACL — multi-user desktop must not rely on UI alone."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_cajero_cannot_access_agenda_api(
    client: TestClient,
    admin_headers: dict[str, str],
):
    create = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "nombre": "Cajero ACL",
            "username": "cajero.acl",
            "email": "cajero.acl@clinica.pe",
            "password": "clave123",
            "rol": "CAJERO",
            "modulos_acceso": ["dashboard", "pacientes", "caja"],
        },
    )
    assert create.status_code == 201, create.text

    login = client.post(
        "/api/auth/login",
        json={"username": "cajero.acl", "password": "clave123"},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    agenda = client.get("/api/appointments", headers=headers)
    assert agenda.status_code == 403, agenda.text
    assert "html" not in (agenda.headers.get("content-type") or "").lower()

    reportes = client.get("/api/reports/resumen", headers=headers)
    assert reportes.status_code == 403, reportes.text
    assert "html" not in (reportes.headers.get("content-type") or "").lower()


def test_cajero_can_access_caja_and_patients(
    client: TestClient,
    admin_headers: dict[str, str],
):
    create = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "nombre": "Cajero Ops",
            "username": "cajero.ops",
            "email": "cajero.ops@clinica.pe",
            "password": "clave123",
            "rol": "CAJERO",
            "modulos_acceso": ["dashboard", "pacientes", "caja"],
        },
    )
    assert create.status_code == 201, create.text
    login = client.post(
        "/api/auth/login",
        json={"username": "cajero.ops", "password": "clave123"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    patients = client.get("/api/patients", headers=headers)
    assert patients.status_code == 200, patients.text

    session = client.get("/api/cash/session", headers=headers)
    assert session.status_code == 200, session.text
