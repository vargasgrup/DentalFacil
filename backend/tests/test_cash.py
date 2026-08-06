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

    close = client.post(
        "/api/cash/session/close",
        headers=admin_headers,
        json={"monto_contado": 180.0, "notas": "Cuadra"},
    )
    assert close.status_code == 200, close.text
    summary = close.json()
    assert summary["session_id"] == session_id
    assert summary["monto_inicial"] == 100.0
    assert summary["ingresos"] == 80.0
    assert summary["egresos"] == 0.0
    assert summary["neto"] == 80.0
    assert summary["total_esperado"] == 180.0
    assert summary["monto_contado"] == 180.0
    assert summary["diferencia"] == 0.0
    assert summary["por_metodo"]["yape"] == 50.0
    assert summary["por_metodo"]["efectivo"] == 30.0


def test_cash_requires_open_session(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    sess = client.get("/api/cash/session", headers=admin_headers)
    assert sess.status_code == 200
    assert sess.json() is None

    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Sin caja",
            "monto": 25.0,
            "metodo_pago": "efectivo",
        },
    )
    assert pay.status_code == 400, pay.text
    assert "caja abierta" in pay.json()["detail"].lower()


def test_cash_egreso_cannot_exceed_saldo(
    client: TestClient,
    admin_headers: dict[str, str],
    open_cash_session: dict,
):
    # open con 100, egreso 150 → error
    bad = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "tipo": "egreso",
            "concepto": "Compra",
            "monto": 150.0,
            "metodo_pago": "efectivo",
        },
    )
    assert bad.status_code == 400, bad.text

    ok = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "tipo": "egreso",
            "concepto": "Compra",
            "monto": 40.0,
            "metodo_pago": "efectivo",
        },
    )
    assert ok.status_code == 201, ok.text


def test_cash_void_income_and_resync_clinical(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Consulta",
            "monto": 40.0,
            "metodo_pago": "yape",
            "allocate": True,
        },
    )
    assert pay.status_code == 201, pay.text
    tx_id = pay.json()["id"]

    void = client.post(
        f"/api/cash/transactions/{tx_id}/void",
        headers=admin_headers,
        json={"motivo": "Error de digitación"},
    )
    assert void.status_code == 200, void.text
    assert void.json()["anulado"] is True

    fin = client.get(
        f"/api/clinical/{patient['id']}/financial",
        headers=admin_headers,
    )
    assert fin.status_code == 200
    assert float(fin.json()["pagado_total"]) == 0.0


def test_cash_pago_mixto_splits_by_method_for_audit(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    """Cobro mixto: 20 efectivo + 80 yape = 100; reportes ven ambos métodos."""
    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono tratamiento",
            "monto": 100.0,
            "metodo_pago": "mixto",
            "pagos_parciales": [
                {"metodo_pago": "efectivo", "monto": 20.0},
                {"metodo_pago": "yape", "monto": 80.0},
            ],
        },
    )
    assert pay.status_code == 201, pay.text
    body = pay.json()
    assert body["metodo_pago"] == "mixto"
    assert body["monto"] == 100.0
    assert body["grupo_pago_id"]
    assert body["pagos_parciales"] == [
        {"metodo_pago": "efectivo", "monto": 20.0},
        {"metodo_pago": "yape", "monto": 80.0},
    ]

    txs = client.get("/api/cash/transactions", headers=admin_headers)
    assert txs.status_code == 200
    rows = txs.json()
    grupo = [t for t in rows if t.get("grupo_pago_id") == body["grupo_pago_id"]]
    assert len(grupo) == 2
    by_method = {t["metodo_pago"]: float(t["monto"]) for t in grupo}
    assert by_method["efectivo"] == 20.0
    assert by_method["yape"] == 80.0

    bad = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono",
            "monto": 100.0,
            "pagos_parciales": [
                {"metodo_pago": "efectivo", "monto": 20.0},
                {"metodo_pago": "yape", "monto": 50.0},
            ],
        },
    )
    assert bad.status_code == 422, bad.text

    close = client.post(
        "/api/cash/session/close",
        headers=admin_headers,
        json={"monto_contado": 200.0},
    )
    assert close.status_code == 200, close.text
    summary = close.json()
    assert summary["ingresos"] == 100.0
    assert summary["por_metodo"]["efectivo"] == 20.0
    assert summary["por_metodo"]["yape"] == 80.0
    assert summary["total_esperado"] == 200.0  # 100 initial + 100
    assert summary["diferencia"] == 0.0
