"""Appointment API integration tests."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

LIMA = ZoneInfo("America/Lima")


def test_create_appointment_within_clinic_hours(
    client: TestClient,
    admin_headers: dict[str, str],
    admin_user,
    patient: dict,
    wide_clinic_hours,
):
    fecha = datetime(2026, 7, 14, 10, 0, tzinfo=LIMA)
    resp = client.post(
        "/api/appointments",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "doctor_id": admin_user.id,
            "fecha_hora": fecha.isoformat(),
            "duracion_minutos": 30,
            "notas": "Control",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["patient_id"] == patient["id"]
    assert data["doctor_id"] == admin_user.id


def test_appointment_overlap_same_doctor_409(
    client: TestClient,
    admin_headers: dict[str, str],
    admin_user,
    patient: dict,
    wide_clinic_hours,
):
    fecha = datetime(2026, 7, 14, 11, 0, tzinfo=LIMA)
    payload = {
        "patient_id": patient["id"],
        "doctor_id": admin_user.id,
        "fecha_hora": fecha.isoformat(),
        "duracion_minutos": 60,
    }
    first = client.post("/api/appointments", headers=admin_headers, json=payload)
    assert first.status_code == 201, first.text

    # Overlapping window for the same doctor
    overlap_time = datetime(2026, 7, 14, 11, 30, tzinfo=LIMA)
    second = client.post(
        "/api/appointments",
        headers=admin_headers,
        json={
            **payload,
            "fecha_hora": overlap_time.isoformat(),
            "duracion_minutos": 30,
        },
    )
    assert second.status_code == 409, second.text


def test_appointment_outside_clinic_hours(
    client: TestClient,
    admin_headers: dict[str, str],
    admin_user,
    patient: dict,
):
    hours = client.patch(
        "/api/config/hours",
        headers=admin_headers,
        json={"hora_apertura": "09:00", "hora_cierre": "12:00"},
    )
    assert hours.status_code == 200, hours.text

    # 15:00 Lima is outside 09:00–12:00
    fecha = datetime(2026, 7, 14, 15, 0, tzinfo=LIMA)
    resp = client.post(
        "/api/appointments",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "doctor_id": admin_user.id,
            "fecha_hora": fecha.isoformat(),
            "duracion_minutos": 30,
        },
    )
    assert resp.status_code == 400, resp.text
    assert "horario" in resp.json()["detail"].lower()
