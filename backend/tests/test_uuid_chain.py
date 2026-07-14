"""End-to-end FK chain with UUID primary keys on SQLite."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


def test_uuid_fk_chain_patient_ficha_cita_caja_odontogram(
    client: TestClient,
    admin_headers: dict[str, str],
    wide_clinic_hours,
):
    # Patient + clinical 1:1
    p = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Luis",
            "apellidos": "UUID",
            "tipo_documento": "DNI",
            "numero_documento": "87654321",
        },
    )
    assert p.status_code == 201, p.text
    patient = p.json()
    assert isinstance(patient["id"], str) and len(patient["id"]) == 36

    rec = client.get(f"/api/clinical/{patient['id']}/record", headers=admin_headers)
    assert rec.status_code == 200, rec.text
    assert rec.json()["patient_id"] == patient["id"]

    # Appointment
    when = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
    if when.weekday() >= 5:
        when = when + timedelta(days=2)
    apt = client.post(
        "/api/appointments",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "fecha_hora": when.isoformat(),
            "duracion_minutos": 30,
        },
    )
    assert apt.status_code == 201, apt.text
    assert isinstance(apt.json()["id"], str)

    # Cash session + transaction
    sess = client.post(
        "/api/cash/session/open",
        headers=admin_headers,
        json={"monto_inicial": 10},
    )
    assert sess.status_code == 201, sess.text
    assert isinstance(sess.json()["id"], str)

    tx = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "UUID test",
            "monto": 50,
            "metodo_pago": "efectivo",
        },
    )
    assert tx.status_code == 201, tx.text
    assert isinstance(tx.json()["id"], str)
    assert tx.json()["cash_session_id"] == sess.json()["id"]

    # Odontogram upsert (schema only — clinical rules unchanged)
    odo = client.put(
        f"/api/odontogram/{patient['id']}/11",
        headers=admin_headers,
        json={"estado": "sano", "denticion": "permanente"},
    )
    # Accept 200/201 depending on router
    assert odo.status_code in (200, 201), odo.text
    body = odo.json()
    if isinstance(body, dict) and "id" in body:
        assert isinstance(body["id"], str)
