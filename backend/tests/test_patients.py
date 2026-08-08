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


def test_patient_especialidad_create_and_filter(
    client: TestClient,
    admin_headers: dict[str, str],
):
    created = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Ana",
            "apellidos": "Ortiz",
            "tipo_documento": "DNI",
            "numero_documento": "11223344",
            "especialidad": "Ortodoncia",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["especialidad"] == "Ortodoncia"
    assert body["especialidades"] == ["Ortodoncia"]

    listed = client.get(
        "/api/patients",
        headers=admin_headers,
        params={"especialidad": "Ortodoncia"},
    )
    assert listed.status_code == 200, listed.text
    ids = {p["id"] for p in listed.json()}
    assert body["id"] in ids

    empty = client.get(
        "/api/patients",
        headers=admin_headers,
        params={"especialidad": "Endodoncia"},
    )
    assert empty.status_code == 200
    assert body["id"] not in {p["id"] for p in empty.json()}

    patched = client.patch(
        f"/api/patients/{body['id']}",
        headers=admin_headers,
        json={"especialidad": "Endodoncia"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["especialidad"] == "Endodoncia"
    assert patched.json()["especialidades"] == ["Endodoncia"]


def test_patient_multi_especialidades(
    client: TestClient,
    admin_headers: dict[str, str],
):
    created = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Diego",
            "apellidos": "Mamani",
            "tipo_documento": "DNI",
            "numero_documento": "40526399",
            "especialidades": ["Ortodoncia", "Endodoncia", "Rehabilitación oral"],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["especialidad"] == "Ortodoncia"
    assert body["especialidades"] == [
        "Ortodoncia",
        "Endodoncia",
        "Rehabilitación oral",
    ]

    # Filter by non-primary specialty still finds the patient
    listed = client.get(
        "/api/patients",
        headers=admin_headers,
        params={"especialidad": "Endodoncia"},
    )
    assert listed.status_code == 200
    assert body["id"] in {p["id"] for p in listed.json()}

    patched = client.patch(
        f"/api/patients/{body['id']}",
        headers=admin_headers,
        json={"especialidades": ["Implantología oral", "Estética dental"]},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["especialidades"] == [
        "Implantología oral",
        "Estética dental",
    ]
    assert patched.json()["especialidad"] == "Implantología oral"

    cleared = client.patch(
        f"/api/patients/{body['id']}",
        headers=admin_headers,
        json={"especialidades": []},
    )
    assert cleared.status_code == 200
    assert cleared.json()["especialidades"] == []
    assert cleared.json()["especialidad"] in (None, "")


def test_appointment_appends_patient_especialidad(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    """Cita con especialidad nueva se acumula en el perfil del paciente."""
    # ensure patient starts with one specialty
    client.patch(
        f"/api/patients/{patient['id']}",
        headers=admin_headers,
        json={"especialidades": ["Ortodoncia"]},
    )
    # need doctor id - get me
    me = client.get("/api/auth/me", headers=admin_headers)
    assert me.status_code == 200
    doctor_id = me.json()["id"]
    from datetime import datetime, timedelta, timezone

    when = (datetime.now(timezone.utc) + timedelta(days=2)).replace(
        hour=15, minute=0, second=0, microsecond=0
    )
    apt = client.post(
        "/api/appointments",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "doctor_id": doctor_id,
            "fecha_hora": when.isoformat(),
            "duracion_minutos": 30,
            "especialidad": "Endodoncia",
        },
    )
    assert apt.status_code == 201, apt.text
    got = client.get(f"/api/patients/{patient['id']}", headers=admin_headers)
    assert got.status_code == 200
    esps = got.json().get("especialidades") or []
    assert "Ortodoncia" in esps
    assert "Endodoncia" in esps


def test_create_patient_full_fields_linked(
    client: TestClient,
    admin_headers: dict[str, str],
):
    """Alta con alergias, especialidad, sexo y tutor — deben persistir y listarse."""
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Sofía",
            "apellidos": "Mendoza",
            "tipo_documento": "DNI",
            "numero_documento": "55667788",
            "fecha_nacimiento": "2015-03-20",
            "sexo": "F",
            "telefono": "912345678",
            "alergias": "Penicilina",
            "especialidad": "Odontopediatría",
            "nombre_responsable": "Rosa Mendoza",
            "parentesco_responsable": "Madre",
            "telefono_responsable": "987111222",
            "documento_responsable": "10203040",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["alergias"] == "Penicilina"
    assert body["especialidad"] == "Odontopediatría"
    assert body["sexo"] == "F"
    assert body["telefono"] == "912345678"
    assert body["telefono_responsable"] == "987111222"
    assert body["documento_responsable"] == "10203040"
    assert body["parentesco_responsable"] == "Madre"

    got = client.get(f"/api/patients/{body['id']}", headers=admin_headers)
    assert got.status_code == 200
    assert got.json()["alergias"] == "Penicilina"

    listed = client.get(
        "/api/patients",
        headers=admin_headers,
        params={"especialidad": "Odontopediatría"},
    )
    assert listed.status_code == 200
    assert body["id"] in {p["id"] for p in listed.json()}

    search = client.get(
        "/api/patients/search",
        headers=admin_headers,
        params={"q": "55667788"},
    )
    assert search.status_code == 200
    assert any(p["id"] == body["id"] for p in search.json())

    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Lucía",
            "apellidos": "Ramos",
            "tipo_documento": "SIN_DOC",
            "numero_documento": None,
            "fecha_nacimiento": "2018-05-12",
            "sexo": "F",
            "nombre_responsable": "María Ramos",
            "parentesco_responsable": "Madre",
            "telefono_responsable": "987654321",
            "telefono": "987654321",
            "especialidad": "Odontopediatría",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tipo_documento"] == "SIN_DOC"
    assert body["numero_documento"] in (None, "")
    assert body["nombre_responsable"] == "María Ramos"
    assert body["parentesco_responsable"] == "Madre"
    assert body["telefono_responsable"] == "987654321"
    assert body["sexo"] == "F"

    # A second child without document must also be allowed
    resp2 = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Pedro",
            "apellidos": "López",
            "tipo_documento": "SIN_DOC",
            "nombre_responsable": "Ana López",
            "telefono_responsable": "912345678",
            "telefono": "912345678",
        },
    )
    assert resp2.status_code == 201, resp2.text
