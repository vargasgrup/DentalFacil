"""Saving a plan auto-creates linked evolution rows and payment targets."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_saving_plan_syncs_evolution_and_payment_targets(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
):
    plan = {
        "active_id": "plan_a",
        "alternatives": [
            {
                "id": "plan_a",
                "nombre": "Plan A",
                "items": [
                    {
                        "id": "pi_autosync01",
                        "item": "Curación / obturación con resina",
                        "cantidad": 1,
                        "costo_unitario": 115,
                        "a_cuenta": 50,
                        "estado": "pendiente",
                        "origen": "manual",
                    },
                    {
                        "id": "pi_autosync02",
                        "item": "Curación / obturación con resina",
                        "pieza_fdi": "25",
                        "cantidad": 1,
                        "costo_unitario": 180,
                        "a_cuenta": 50,
                        "estado": "pendiente",
                        "origen": "manual",
                    },
                ],
            }
        ],
    }
    saved = client.patch(
        f"/api/clinical/{patient['id']}/record",
        headers=admin_headers,
        json={"plan_tratamiento": plan},
    )
    assert saved.status_code == 200, saved.text
    items = saved.json()["plan_tratamiento"]["alternatives"][0]["items"]
    assert all(it.get("evolution_entry_id") for it in items)

    evos = client.get(
        f"/api/clinical/{patient['id']}/evolution",
        headers=admin_headers,
    )
    assert evos.status_code == 200
    assert len(evos.json()) >= 2
    by_plan = {e["plan_item_id"]: e for e in evos.json()}
    assert float(by_plan["pi_autosync01"]["costo"]) == 115.0
    assert float(by_plan["pi_autosync01"]["a_cuenta"]) == 50.0
    assert float(by_plan["pi_autosync02"]["costo"]) == 180.0

    fin = client.get(
        f"/api/clinical/{patient['id']}/financial",
        headers=admin_headers,
    )
    assert fin.status_code == 200
    assert float(fin.json()["costo_total"]) == 295.0
    assert float(fin.json()["a_cuenta_clinico"]) == 100.0

    targets = client.get(
        f"/api/clinical/{patient['id']}/payment-targets",
        headers=admin_headers,
    )
    assert targets.status_code == 200
    open_targets = targets.json()["targets"]
    assert len(open_targets) >= 2
    assert sum(t["saldo"] for t in open_targets) == 195.0
