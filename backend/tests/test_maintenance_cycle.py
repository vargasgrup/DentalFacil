"""Preventive maintenance cycle (6 months) — fixed vendor key reset."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.services.maintenance_cycle import MAINTENANCE_ACCESS_KEY


def test_maintenance_status_requires_auth(client: TestClient):
    r = client.get("/api/system/maintenance/status")
    assert r.status_code == 401


def test_fixed_vendor_key_is_solo_yo1532():
    assert MAINTENANCE_ACCESS_KEY == "Solo,yo1532"


def test_maintenance_cycle_status_and_vendor_reset(
    client: TestClient,
    admin_headers: dict[str, str],
):
    st = client.get("/api/system/maintenance/status", headers=admin_headers)
    assert st.status_code == 200, st.text
    body = st.json()
    assert body["maintenance_required"] is False
    assert body["months"] == 12
    assert body["due_at"]

    from app.database import SessionLocal
    from app.models.clinic_settings import ClinicSettings
    from app.models.ids import CLINIC_SETTINGS_ID

    with SessionLocal() as db:
        row = db.get(ClinicSettings, CLINIC_SETTINGS_ID)
        assert row is not None
        row.maintenance_cycle_started_at = datetime.now(timezone.utc) - timedelta(days=400)
        db.commit()

    due = client.get("/api/system/maintenance/status", headers=admin_headers)
    assert due.status_code == 200
    assert due.json()["maintenance_required"] is True
    assert due.json()["title"]

    bad = client.post(
        "/api/system/maintenance/reset",
        json={"access_key": "wrong-key-xxxxxxxx"},
    )
    assert bad.status_code == 403

    # Clinic ADMIN JWT alone cannot reset without the fixed vendor key
    admin_only = client.post(
        "/api/system/maintenance/reset",
        headers=admin_headers,
        json={"access_key": "otra-clave"},
    )
    assert admin_only.status_code == 403

    ok = client.post(
        "/api/system/maintenance/reset",
        json={"access_key": "Solo,yo1532"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["maintenance_required"] is False

    again = client.get("/api/system/maintenance/status", headers=admin_headers)
    assert again.json()["maintenance_required"] is False
