"""Per-user module access permissions."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_cajero_with_custom_modules(
    client: TestClient,
    admin_headers: dict[str, str],
):
    resp = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "nombre": "Hilda Caja",
            "email": "hilda.caja@clinica.pe",
            "password": "clave123",
            "rol": "CAJERO",
            "modulos_acceso": ["dashboard", "pacientes", "caja"],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["rol"] == "CAJERO"
    assert "caja" in body["modulos_acceso"]
    assert "reportes" not in body["modulos_acceso"]
    assert "configuracion" not in body["modulos_acceso"]
    assert "dashboard" in body["modulos_acceso"]

    patched = client.patch(
        f"/api/users/{body['id']}",
        headers=admin_headers,
        json={"modulos_acceso": ["dashboard", "caja"]},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["modulos_acceso"] == ["dashboard", "caja"]

    me = client.post(
        "/api/auth/login",
        json={"email": "hilda.caja@clinica.pe", "password": "clave123"},
    )
    assert me.status_code == 200
    assert "caja" in me.json()["user"]["modulos_acceso"]
    assert "agenda" not in me.json()["user"]["modulos_acceso"]
