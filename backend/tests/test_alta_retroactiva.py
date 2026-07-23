"""Tests for alta retroactiva migration (up/down) and patient migration flow."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_alta_retroactiva_ensure_schema_up_idempotent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """ensure_* adds columns additively and is safe to run twice (SQLite local DBs)."""
    db_file = tmp_path / "ensure_alta.db"
    url = f"sqlite:///{db_file.as_posix()}"
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE patients ("
                "id VARCHAR(36) PRIMARY KEY, nombres VARCHAR(120) NOT NULL)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE clinical_evolution_entries ("
                "id VARCHAR(36) PRIMARY KEY, patient_id VARCHAR(36))"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE odontogram_snapshots ("
                "id VARCHAR(36) PRIMARY KEY, patient_id VARCHAR(36))"
            )
        )

    import app.ensure_alta_retroactiva_schema as ensure_mod

    monkeypatch.setattr(ensure_mod, "engine", engine)
    ensure_mod.ensure_alta_retroactiva_schema()
    ensure_mod.ensure_alta_retroactiva_schema()  # idempotent

    insp = inspect(engine)
    patient_cols = {c["name"] for c in insp.get_columns("patients")}
    evo_cols = {c["name"] for c in insp.get_columns("clinical_evolution_entries")}
    snap_cols = {c["name"] for c in insp.get_columns("odontogram_snapshots")}
    assert {"es_migrado", "fecha_ingreso_clinica", "resumen_historia_previa"} <= patient_cols
    assert "origen" in evo_cols
    assert "origen" in snap_cols


def test_alta_retroactiva_migration_upgrade_downgrade_functions(tmp_path: Path):
    """Call revision upgrade/downgrade against a MigrationContext (reversible)."""
    import importlib.util

    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    rev_path = BACKEND_ROOT / "alembic" / "versions" / "o2alta_retroactiva.py"
    spec = importlib.util.spec_from_file_location("o2alta_retroactiva", rev_path)
    assert spec and spec.loader
    rev = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(rev)

    db_file = tmp_path / "rev_alta.db"
    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE patients (id VARCHAR(36) PRIMARY KEY)"))
        conn.execute(
            text(
                "CREATE TABLE clinical_evolution_entries ("
                "id VARCHAR(36) PRIMARY KEY)"
            )
        )
        conn.execute(
            text("CREATE TABLE odontogram_snapshots (id VARCHAR(36) PRIMARY KEY)")
        )

    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            rev.upgrade()

    insp = inspect(engine)
    assert "es_migrado" in {c["name"] for c in insp.get_columns("patients")}
    assert "origen" in {c["name"] for c in insp.get_columns("clinical_evolution_entries")}

    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            rev.downgrade()

    insp = inspect(engine)
    assert "es_migrado" not in {c["name"] for c in insp.get_columns("patients")}
    assert "origen" not in {c["name"] for c in insp.get_columns("clinical_evolution_entries")}
    assert "origen" not in {c["name"] for c in insp.get_columns("odontogram_snapshots")}


def test_create_migrated_patient_with_saldo(
    client: TestClient,
    admin_headers: dict[str, str],
):
    ingreso = (date.today() - timedelta(days=400)).isoformat()
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Historico",
            "apellidos": "Migrado",
            "tipo_documento": "DNI",
            "numero_documento": "44556677",
            "telefono": "912345678",
            "es_migrado": True,
            "fecha_ingreso_clinica": ingreso,
            "resumen_historia_previa": "Tratamiento ortodóntico desde 2019.",
            "saldo_inicial_migracion": 350.5,
        },
    )
    assert resp.status_code == 201, resp.text
    patient = resp.json()
    assert patient["es_migrado"] is True
    assert patient["fecha_ingreso_clinica"] == ingreso
    assert "ortodóntico" in (patient.get("resumen_historia_previa") or "")

    fin = client.get(f"/api/clinical/{patient['id']}/financial", headers=admin_headers)
    assert fin.status_code == 200, fin.text
    body = fin.json()
    assert abs(body["costo_total"] - 350.5) < 0.01
    assert abs(body["saldo"] - 350.5) < 0.01

    evo = client.get(f"/api/clinical/{patient['id']}/evolution", headers=admin_headers)
    assert evo.status_code == 200, evo.text
    entries = evo.json()
    assert len(entries) == 1
    assert entries[0]["origen"] == "migracion"
    assert entries[0]["tratamiento_descripcion"] == "Saldo inicial por migración"
    assert abs(float(entries[0]["costo"]) - 350.5) < 0.01


def test_migracion_excluded_from_tratamientos_report(
    client: TestClient,
    admin_headers: dict[str, str],
):
    # Migrated patient with saldo dated "today" via fecha_ingreso = today
    # (edge case: ingreso today should still be excluded from productivity)
    today = date.today().isoformat()
    mig = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Solo",
            "apellidos": "Migracion",
            "tipo_documento": "DNI",
            "numero_documento": "55667788",
            "telefono": "987654321",
            "es_migrado": True,
            "fecha_ingreso_clinica": today,
            "saldo_inicial_migracion": 100,
        },
    )
    assert mig.status_code == 201, mig.text
    mig_id = mig.json()["id"]

    # Real-time evolution for another patient (counts in report)
    normal = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Nuevo",
            "apellidos": "Hoy",
            "tipo_documento": "DNI",
            "numero_documento": "66778899",
            "telefono": "911222333",
        },
    )
    assert normal.status_code == 201, normal.text
    normal_id = normal.json()["id"]
    evo = client.post(
        f"/api/clinical/{normal_id}/evolution",
        headers=admin_headers,
        json={
            "tratamiento_descripcion": "Limpieza",
            "costo": 80,
            "costo_unitario": 80,
            "cantidad": 1,
        },
    )
    assert evo.status_code == 201, evo.text

    start = datetime.combine(date.today(), datetime.min.time()).isoformat()
    end = datetime.combine(date.today(), datetime.max.time()).isoformat()
    report = client.get(
        f"/api/reports/tratamientos?start={start}&end={end}",
        headers=admin_headers,
    )
    assert report.status_code == 200, report.text
    data = report.json()
    # Summary Total cobrado should be 80 (normal only), not 180
    assert "S/ 80.00" in data["summary"]["Total cobrado"]
    row_text = " ".join(" ".join(map(str, r)) for r in data["rows"])
    assert "Saldo inicial por migración" not in row_text
    assert "Limpieza" in row_text

    # Evolution detail still shows migration entry on patient ficha
    detail = client.get(f"/api/clinical/{mig_id}/evolution", headers=admin_headers)
    assert any(e["origen"] == "migracion" for e in detail.json())


def test_normal_patient_unchanged(
    client: TestClient,
    admin_headers: dict[str, str],
):
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Normal",
            "apellidos": "SinMigracion",
            "tipo_documento": "DNI",
            "numero_documento": "77889900",
            "telefono": "900111222",
            "es_migrado": False,
            "fecha_ingreso_clinica": "2015-01-01",
            "saldo_inicial_migracion": 999,
        },
    )
    assert resp.status_code == 201, resp.text
    patient = resp.json()
    assert patient["es_migrado"] is False
    assert patient.get("fecha_ingreso_clinica") is None

    fin = client.get(f"/api/clinical/{patient['id']}/financial", headers=admin_headers)
    assert fin.json()["costo_total"] == 0

    evo = client.get(f"/api/clinical/{patient['id']}/evolution", headers=admin_headers)
    assert evo.json() == []


def test_migrated_requires_fecha_ingreso(
    client: TestClient,
    admin_headers: dict[str, str],
):
    resp = client.post(
        "/api/patients",
        headers=admin_headers,
        json={
            "nombres": "Sin",
            "apellidos": "Fecha",
            "tipo_documento": "DNI",
            "numero_documento": "88990011",
            "telefono": "933444555",
            "es_migrado": True,
            "saldo_inicial_migracion": 10,
        },
    )
    assert resp.status_code == 422, resp.text


def test_snapshot_origen_migracion(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    resp = client.post(
        f"/api/odontogram/{patient['id']}/snapshots",
        headers=admin_headers,
        json={
            "denticion": "permanente",
            "origen": "migracion",
            "label": "Estado histórico (migración)",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["origen"] == "migracion"
    assert "histórico" in body["label"].lower() or "migracion" in body["label"].lower()
