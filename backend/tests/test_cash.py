"""Cash API integration tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_cash_session_flow(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    session_id = open_cash_session["id"]
    assert open_cash_session["estado"] == "abierta"

    tx_yape = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Consulta",
            "monto": 50.0,
            "metodo_pago": "yape",
        },
    )
    assert tx_yape.status_code == 201, tx_yape.text

    tx_efectivo = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Radiografía",
            "monto": 30.0,
            "metodo_pago": "efectivo",
        },
    )
    assert tx_efectivo.status_code == 201, tx_efectivo.text

    second_open = client.post(
        "/api/cash/session/open",
        headers=admin_headers,
        json={"monto_inicial": 0},
    )
    assert second_open.status_code == 400, second_open.text

    close = client.post("/api/cash/session/close", headers=admin_headers)
    assert close.status_code == 200, close.text
    summary = close.json()
    assert summary["session_id"] == session_id
    assert summary["monto_inicial"] == 100.0
    assert summary["ingresos"] == 80.0
    assert summary["egresos"] == 0.0
    assert summary["neto"] == 80.0
    assert summary["total_esperado"] == 180.0
    assert summary["por_metodo"]["yape"] == 50.0
    assert summary["por_metodo"]["efectivo"] == 30.0
