"""Documents API smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_comprobante_pdf_smoke(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    tx = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Limpieza dental",
            "monto": 80.0,
            "metodo_pago": "tarjeta",
        },
    )
    assert tx.status_code == 201, tx.text
    tx_id = tx.json()["id"]

    resp = client.get(
        f"/api/documents/comprobante/{tx_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert "application/pdf" in resp.headers.get("content-type", "")
    assert resp.content[:4] == b"%PDF"
