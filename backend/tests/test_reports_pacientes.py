"""Reports: pacientes atendidos consolidates Agenda + Evolución + Caja."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


def test_pacientes_report_includes_evolution_and_cash_without_appointment(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    """Walk-in care (evolución + cobro) must appear even without a cita."""
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    end = (now + timedelta(days=1)).strftime("%Y-%m-%dT23:59:59Z")

    # Empty without activity
    empty = client.get(
        f"/api/reports/pacientes?start={start}&end={end}",
        headers=admin_headers,
    )
    assert empty.status_code == 200, empty.text
    assert empty.json()["summary"]["Pacientes únicos"] == "0"

    evo = client.post(
        f"/api/clinical/{patient['id']}/evolution",
        headers=admin_headers,
        json={
            "tratamiento_descripcion": "Consulta de control",
            "costo": 50,
            "a_cuenta": 0,
            "estado": "en_proceso",
        },
    )
    assert evo.status_code == 201, evo.text
    evo_id = evo.json()["id"]

    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono consulta",
            "monto": 50.0,
            "metodo_pago": "efectivo",
            "allocate": True,
            "evolution_entry_id": evo_id,
        },
    )
    assert pay.status_code == 201, pay.text

    report = client.get(
        f"/api/reports/pacientes?start={start}&end={end}",
        headers=admin_headers,
    )
    assert report.status_code == 200, report.text
    body = report.json()
    assert int(body["summary"]["Pacientes únicos"]) >= 1
    assert int(body["summary"]["Atenciones"]) >= 2  # evolución + caja
    origins = {row[4] for row in body["rows"][1:]}
    assert "Evolución" in origins
    assert "Caja" in origins

    resumen = client.get(
        f"/api/reports/resumen?start={start}&end={end}",
        headers=admin_headers,
    )
    assert resumen.status_code == 200
    assert resumen.json()["pacientes"]["pacientes_unicos"] >= 1
    assert float(resumen.json()["caja"]["total_ingresos"]) >= 50.0
