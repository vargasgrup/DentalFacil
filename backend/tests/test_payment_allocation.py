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
