"""Patient API integration tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_patient_creates_clinical_record(
    client: TestClient,
    admin_headers: dict[str, str],
):
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Luis",
            "apellidos": "García",
            "tipo_documento": "DNI",
            "numero_documento": "87654321",
        },
    )
    assert resp.status_code == 201, resp.text
    patient = resp.json()
    assert isinstance(patient["id"], str) and len(patient["id"]) == 36
    assert patient["numero_ficha"] >= 1

    record = client.get(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
    )
    assert record.status_code == 200, record.text
    body = record.json()
    assert body["patient_id"] == patient["id"]


def test_duplicate_document_rejected(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Otro",
            "apellidos": "Paciente",
            "tipo_documento": "DNI",
            "numero_documento": patient["numero_documento"],
        },
    )
    assert resp.status_code == 409, resp.text
