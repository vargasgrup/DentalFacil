"""Preventive maintenance cycle (6 months) — vendor key reset."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


def test_maintenance_status_requires_auth(client: TestClient):
    r = client.get("/api/system/maintenance/status")
    assert r.status_code == 401


def test_maintenance_cycle_status_and_vendor_reset(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
):
    monkeypatch.setenv("MAINTENANCE_ACCESS_KEY", "vendor-secret-key-32chars-min!!")
    # Reload settings that read env at import — patch service settings object
    from app.config import settings

    monkeypatch.setattr(settings, "MAINTENANCE_ACCESS_KEY", "vendor-secret-key-32chars-min!!")

    st = client.get("/api/system/maintenance/status", headers=admin_headers)
    assert st.status_code == 200, st.text
    body = st.json()
    assert body["maintenance_required"] is False
    assert body["months"] == 6
    assert body["due_at"]

    # Force overdue by backdating cycle start
    from app.database import SessionLocal
    from app.models.clinic_settings import ClinicSettings
    from app.models.ids import CLINIC_SETTINGS_ID

    with SessionLocal() as db:
        row = db.get(ClinicSettings, CLINIC_SETTINGS_ID)
        assert row is not None
        row.maintenance_cycle_started_at = datetime.now(timezone.utc) - timedelta(days=200)
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

    # Clinic ADMIN JWT alone cannot reset without key
    admin_only = client.post(
        "/api/system/maintenance/reset",
        headers=admin_headers,
        json={"access_key": "wrong-key-xxxxxxxx"},
    )
    assert admin_only.status_code == 403

    ok = client.post(
        "/api/system/maintenance/reset",
        json={"access_key": "vendor-secret-key-32chars-min!!"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["maintenance_required"] is False

    again = client.get("/api/system/maintenance/status", headers=admin_headers)
    assert again.json()["maintenance_required"] is False
