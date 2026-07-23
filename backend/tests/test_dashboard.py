"""Dashboard home API smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_dashboard_home_ok(client: TestClient, admin_headers: dict[str, str]):
    resp = client.get("/api/dashboard/home", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "kpis" in data
    assert "cash" in data
    assert "citas_hoy" in data
    assert "revenue_chart" in data
    assert "resumen_semanal" in data
    assert "especialidades" in data
    assert "cumpleanos" in data
    assert "actividad" in data
    assert isinstance(data["kpis"]["citas_hoy"], int)
    assert "labels" in data["revenue_chart"]
