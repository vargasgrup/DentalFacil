"""Payment allocation syncs Caja → Evolución / Plan a_cuenta."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_payment_allocates_to_evolution_and_plan(
    client: TestClient,
    admin_headers: dict[str, str],
    admin_user,
    patient: dict,
    open_cash_session: dict,
):
    # Saving the plan auto-creates linked evolution rows
    plan = {
        "active_id": "plan_a",
        "alternatives": [
            {
                "id": "plan_a",
                "nombre": "Plan A",
                "items": [
                    {
                        "id": "pi_testpay01",
                        "item": "Limpieza dental",
                        "cantidad": 1,
                        "costo_unitario": 100,
                        "a_cuenta": 0,
                        "estado": "pendiente",
                        "origen": "manual",
                    }
                ],
            }
        ],
    }
    rec = client.patch(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
        json={"plan_tratamiento": plan},
    )
    assert rec.status_code == 200, rec.text
    item = rec.json()["plan_tratamiento"]["alternatives"][0]["items"][0]
    evo_id = item["evolution_entry_id"]
    assert evo_id

    targets = client.get(
        f"/api/clinical/{patient['id']}/payment-targets",
        headers=admin_headers,
    )
    assert targets.status_code == 200, targets.text
    assert any(t["id"] == evo_id for t in targets.json()["targets"])

    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono limpieza",
            "monto": 40.0,
            "metodo_pago": "efectivo",
            "allocate": True,
            "evolution_entry_id": evo_id,
        },
    )
    assert pay.status_code == 201, pay.text
    body = pay.json()
    assert body["allocated_total"] == 40.0
    assert body["evolution_entry_id"] == evo_id

    evos = client.get(
        f"/api/clinical/{patient['id']}/evolution",
        headers=admin_headers,
    )
    assert evos.status_code == 200
    row = next(x for x in evos.json() if x["id"] == evo_id)
    assert float(row["a_cuenta"]) == 40.0
    assert float(row["costo"]) - float(row["a_cuenta"]) == 60.0

    record = client.get(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
    )
    items = record.json()["plan_tratamiento"]["alternatives"][0]["items"]
    item = next(i for i in items if i["id"] == "pi_testpay01")
    assert float(item["a_cuenta"]) == 40.0

    fin = client.get(
        f"/api/clinical/{patient['id']}/financial",
        headers=admin_headers,
    )
    assert fin.status_code == 200
    f = fin.json()
    assert float(f["costo_total"]) == 100.0
    assert float(f["pagado_total"]) == 40.0
    assert float(f["saldo"]) == 60.0
    assert float(f["a_cuenta_clinico"]) == 40.0


def test_partial_abono_leaves_saldo_on_plan_and_targets(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    """Caso típico: presupuesto 120, paga 100 → A cuenta 100, saldo 20 en plan y Aplicar a."""
    plan = {
        "active_id": "plan_a",
        "alternatives": [
            {
                "id": "plan_a",
                "nombre": "Plan A",
                "items": [
                    {
                        "id": "pi_corona13",
                        "item": "Corona temporal / provisional",
                        "pieza_fdi": "13",
                        "cantidad": 1,
                        "costo_unitario": 120,
                        "a_cuenta": 0,
                        "estado": "pendiente",
                        "origen": "manual",
                    }
                ],
            }
        ],
    }
    rec = client.patch(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
        json={"plan_tratamiento": plan},
    )
    assert rec.status_code == 200, rec.text
    item = rec.json()["plan_tratamiento"]["alternatives"][0]["items"][0]
    evo_id = item["evolution_entry_id"]
    assert evo_id

    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono corona",
            "monto": 100.0,
            "metodo_pago": "efectivo",
            "allocate": True,
            "evolution_entry_id": evo_id,
        },
    )
    assert pay.status_code == 201, pay.text
    body = pay.json()
    assert body["allocated_total"] == 100.0
    assert body["saldo_pendiente_destino"] == 20.0

    record = client.get(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
    )
    items = record.json()["plan_tratamiento"]["alternatives"][0]["items"]
    item = next(i for i in items if i["id"] == "pi_corona13")
    assert float(item["a_cuenta"]) == 100.0

    targets = client.get(
        f"/api/clinical/{patient['id']}/payment-targets",
        headers=admin_headers,
    )
    assert targets.status_code == 200
    tgt = next(t for t in targets.json()["targets"] if t["id"] == evo_id)
    assert float(tgt["saldo"]) == 20.0
    assert float(tgt["a_cuenta"]) == 100.0
    assert float(tgt["costo"]) == 120.0


def test_abono_50_of_400_shows_saldo_350_everywhere(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    open_cash_session: dict,
):
    """Regresión UI Caja: abono S/ 50 de presupuesto S/ 400 → saldo S/ 350."""
    plan = {
        "active_id": "plan_a",
        "alternatives": [
            {
                "id": "plan_a",
                "nombre": "Plan A",
                "items": [
                    {
                        "id": "pi_corona11",
                        "item": "Corona metal-porcelana",
                        "pieza_fdi": "11",
                        "cantidad": 1,
                        "costo_unitario": 400,
                        "a_cuenta": 0,
                        "estado": "pendiente",
                        "origen": "manual",
                    }
                ],
            }
        ],
    }
    rec = client.patch(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
        json={"plan_tratamiento": plan},
    )
    assert rec.status_code == 200, rec.text
    item = rec.json()["plan_tratamiento"]["alternatives"][0]["items"][0]
    evo_id = item["evolution_entry_id"]
    assert evo_id

    before = client.get(
        f"/api/clinical/{patient['id']}/payment-targets",
        headers=admin_headers,
    )
    assert before.status_code == 200
    tgt0 = next(t for t in before.json()["targets"] if t["id"] == evo_id)
    assert float(tgt0["saldo"]) == 400.0
    assert float(tgt0["a_cuenta"]) == 0.0

    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono — Corona metal-porcelana (pieza 11)",
            "monto": 50.0,
            "metodo_pago": "efectivo",
            "allocate": True,
            "evolution_entry_id": evo_id,
        },
    )
    assert pay.status_code == 201, pay.text
    body = pay.json()
    assert float(body["allocated_total"]) == 50.0
    assert float(body["saldo_pendiente_destino"]) == 350.0
    assert body["evolution_entry_id"] == evo_id
    assert body["allocations"]
    assert float(body["allocations"][0]["a_cuenta_after"]) == 50.0
    assert float(body["allocations"][0]["saldo_after"]) == 350.0

    evos = client.get(
        f"/api/clinical/{patient['id']}/evolution",
        headers=admin_headers,
    )
    row = next(x for x in evos.json() if x["id"] == evo_id)
    assert float(row["a_cuenta"]) == 50.0
    assert float(row["costo"]) == 400.0

    record = client.get(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
    )
    plan_item = next(
        i
        for i in record.json()["plan_tratamiento"]["alternatives"][0]["items"]
        if i["id"] == "pi_corona11"
    )
    assert float(plan_item["a_cuenta"]) == 50.0

    targets = client.get(
        f"/api/clinical/{patient['id']}/payment-targets",
        headers=admin_headers,
    )
    tgt = next(t for t in targets.json()["targets"] if t["id"] == evo_id)
    assert float(tgt["saldo"]) == 350.0
    assert float(tgt["a_cuenta"]) == 50.0
    assert float(tgt["costo"]) == 400.0

    fin = client.get(
        f"/api/clinical/{patient['id']}/financial",
        headers=admin_headers,
    )
    f = fin.json()
    assert float(f["pagado_total"]) == 50.0
    assert float(f["a_cuenta_clinico"]) == 50.0
    assert float(f["plan_a_cuenta"]) == 50.0
    assert float(f["plan_saldo"]) == 350.0


def test_payment_auto_opens_caja_when_closed(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    """Registrar pago must work even if no caja session was opened first."""
    sess = client.get("/api/cash/session", headers=admin_headers)
    assert sess.status_code == 200
    assert sess.json() is None

    pay = client.post(
        "/api/cash/transactions",
        headers=admin_headers,
        json={
            "patient_id": patient["id"],
            "tipo": "ingreso",
            "concepto": "Abono sin caja previa",
            "monto": 25.0,
            "metodo_pago": "efectivo",
            "allocate": True,
        },
    )
    assert pay.status_code == 201, pay.text
    assert pay.json()["cash_session_id"]

    opened = client.get("/api/cash/session", headers=admin_headers)
    assert opened.status_code == 200
    assert opened.json() is not None
    assert opened.json()["estado"] == "abierta"
    assert float(opened.json()["monto_inicial"]) == 0.0

    fin = client.get(
        f"/api/clinical/{patient['id']}/financial",
        headers=admin_headers,
    )
    assert fin.status_code == 200
    assert float(fin.json()["pagado_total"]) == 25.0
