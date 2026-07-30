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
    # Guard against empty/corrupt tickets (ReportLab story reuse bug → ~1KB shell)
    assert len(resp.content) > 2500, f"PDF too small ({len(resp.content)} bytes)"
    assert resp.headers.get("x-document-id"), "missing X-Document-Id registration header"


def test_consentimiento_whatsapp_mark_by_patient_tipo(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    """markSent must use DocumentGenerated (patient+tipo), not ClinicalRecord.id."""
    pdf = client.get(
        f"/api/documents/consentimiento/{patient['id']}",
        headers=admin_headers,
    )
    assert pdf.status_code == 200, pdf.text
    doc_id = pdf.headers.get("x-document-id")
    assert doc_id

    bad = client.post(
        f"/api/documents/whatsapp-sent/{patient['id']}",
        headers=admin_headers,
    )
    assert bad.status_code == 404

    ok = client.post(
        f"/api/documents/whatsapp-sent?patient_id={patient['id']}&tipo=consentimiento",
        headers=admin_headers,
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "marked"
    assert body["document_id"] == doc_id
    assert body["tipo"] == "consentimiento"

    by_id = client.post(
        f"/api/documents/whatsapp-sent/{doc_id}",
        headers=admin_headers,
    )
    assert by_id.status_code == 200, by_id.text
