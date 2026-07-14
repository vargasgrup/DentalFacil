"""Allocate cash ingresos onto clinical evolution / plan lines (single money flow).

Source of truth for real money: cash_transactions (Caja).
a_cuenta on evolution/plan is the clinical allocation mirror of those payments —
updated here so Plan, Evolución and Resumen stay symmetrical.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import ClinicalEvolutionEntry, ClinicalRecord
from app.odontogram.plans import normalize_plans


@dataclass
class AllocationApplied:
    kind: str  # evolution | plan
    id: str
    amount: float
    label: str


def _evo_saldo(entry: ClinicalEvolutionEntry) -> float:
    costo = float(entry.costo or 0)
    paid = float(entry.a_cuenta or 0)
    return max(0.0, round(costo - paid, 2))


def _plan_item_subtotal(it: dict) -> float:
    return float(it.get("cantidad") or 0) * float(it.get("costo_unitario") or 0)


def _plan_item_saldo(it: dict) -> float:
    return max(0.0, round(_plan_item_subtotal(it) - float(it.get("a_cuenta") or 0), 2))


def _sync_plan_from_entry(db: Session, entry: ClinicalEvolutionEntry) -> None:
    from app.routers.clinical import _sync_plan_item_from_evolution

    _sync_plan_item_from_evolution(db, entry.patient_id, entry)


def _apply_to_evolution(
    db: Session, entry: ClinicalEvolutionEntry, amount: float
) -> float:
    if amount <= 0:
        return 0.0
    apply = min(amount, _evo_saldo(entry))
    if apply <= 0:
        return 0.0
    entry.a_cuenta = round(float(entry.a_cuenta or 0) + apply, 2)
    # Completar ítem si quedó saldado
    if _evo_saldo(entry) <= 0.009 and (entry.estado or "") == "pendiente":
        entry.estado = "en_proceso"
    _sync_plan_from_entry(db, entry)
    return apply


def _apply_to_plan_item(
    db: Session, patient_id: str, item_id: str, amount: float
) -> float:
    if amount <= 0:
        return 0.0
    from sqlalchemy.orm.attributes import flag_modified

    record = (
        db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).first()
    )
    if not record or not record.plan_tratamiento:
        return 0.0
    plans = normalize_plans(record.plan_tratamiento)
    applied = 0.0
    for alt in plans.get("alternatives") or []:
        for it in alt.get("items") or []:
            if str(it.get("id") or "") != str(item_id):
                continue
            # Prefer allocating via linked evolution if present
            evo_id = it.get("evolution_entry_id")
            if evo_id:
                entry = db.get(ClinicalEvolutionEntry, evo_id)
                if entry and entry.patient_id == patient_id:
                    return _apply_to_evolution(db, entry, amount)
            saldo = _plan_item_saldo(it)
            apply = min(amount, saldo)
            if apply <= 0:
                return 0.0
            it["a_cuenta"] = round(float(it.get("a_cuenta") or 0) + apply, 2)
            if _plan_item_saldo(it) <= 0.009 and (it.get("estado") or "") == "pendiente":
                it["estado"] = "en_proceso"
            applied = apply
            break
        if applied:
            break
    if applied:
        record.plan_tratamiento = plans
        flag_modified(record, "plan_tratamiento")
    return applied


def list_payment_targets(db: Session, patient_id: str) -> list[dict]:
    """Open clinical lines (evolution first, then plan-only) with remaining saldo."""
    targets: list[dict] = []
    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .order_by(ClinicalEvolutionEntry.fecha.asc())
        .all()
    )
    linked_plan_ids: set[str] = set()
    for e in entries:
        if e.plan_item_id:
            linked_plan_ids.add(str(e.plan_item_id))
        saldo = _evo_saldo(e)
        if saldo <= 0:
            continue
        targets.append(
            {
                "kind": "evolution",
                "id": e.id,
                "plan_item_id": e.plan_item_id,
                "label": e.tratamiento_descripcion,
                "pieza_fdi": e.pieza_fdi,
                "costo": float(e.costo or 0),
                "a_cuenta": float(e.a_cuenta or 0),
                "saldo": saldo,
            }
        )

    record = (
        db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).first()
    )
    if record and record.plan_tratamiento:
        plans = normalize_plans(record.plan_tratamiento)
        active_id = plans.get("active_id")
        for alt in plans.get("alternatives") or []:
            if active_id and alt.get("id") != active_id:
                continue
            for it in alt.get("items") or []:
                pid = str(it.get("id") or "")
                if not pid or pid in linked_plan_ids:
                    continue
                if it.get("evolution_entry_id"):
                    continue
                saldo = _plan_item_saldo(it)
                if saldo <= 0:
                    continue
                targets.append(
                    {
                        "kind": "plan",
                        "id": pid,
                        "plan_item_id": pid,
                        "label": it.get("item") or "Ítem del plan",
                        "pieza_fdi": it.get("pieza_fdi"),
                        "costo": _plan_item_subtotal(it),
                        "a_cuenta": float(it.get("a_cuenta") or 0),
                        "saldo": saldo,
                    }
                )
    return targets


def allocate_ingreso(
    db: Session,
    *,
    patient_id: str,
    monto: float,
    evolution_entry_id: str | None = None,
    plan_item_id: str | None = None,
) -> list[AllocationApplied]:
    """Distribute an ingreso across clinical lines. Returns applications made."""
    remaining = round(float(monto), 2)
    if remaining <= 0:
        return []

    applied: list[AllocationApplied] = []

    if evolution_entry_id:
        entry = db.get(ClinicalEvolutionEntry, evolution_entry_id)
        if not entry or entry.patient_id != patient_id:
            return []
        got = _apply_to_evolution(db, entry, remaining)
        if got:
            applied.append(
                AllocationApplied(
                    kind="evolution",
                    id=entry.id,
                    amount=got,
                    label=entry.tratamiento_descripcion,
                )
            )
        return applied

    if plan_item_id:
        # Resolve to evolution if already registered
        entry = (
            db.query(ClinicalEvolutionEntry)
            .filter(
                ClinicalEvolutionEntry.patient_id == patient_id,
                ClinicalEvolutionEntry.plan_item_id == plan_item_id,
            )
            .first()
        )
        if entry:
            got = _apply_to_evolution(db, entry, remaining)
            if got:
                applied.append(
                    AllocationApplied(
                        kind="evolution",
                        id=entry.id,
                        amount=got,
                        label=entry.tratamiento_descripcion,
                    )
                )
            return applied
        got = _apply_to_plan_item(db, patient_id, plan_item_id, remaining)
        if got:
            applied.append(
                AllocationApplied(
                    kind="plan",
                    id=plan_item_id,
                    amount=got,
                    label=plan_item_id,
                )
            )
        return applied

    # Auto FIFO: evolutions with saldo, then plan-only items
    for target in list_payment_targets(db, patient_id):
        if remaining <= 0:
            break
        if target["kind"] == "evolution":
            entry = db.get(ClinicalEvolutionEntry, target["id"])
            if not entry:
                continue
            got = _apply_to_evolution(db, entry, remaining)
            if got:
                applied.append(
                    AllocationApplied(
                        kind="evolution",
                        id=entry.id,
                        amount=got,
                        label=entry.tratamiento_descripcion,
                    )
                )
                remaining = round(remaining - got, 2)
        else:
            got = _apply_to_plan_item(db, patient_id, target["id"], remaining)
            if got:
                applied.append(
                    AllocationApplied(
                        kind="plan",
                        id=target["id"],
                        amount=got,
                        label=str(target.get("label") or target["id"]),
                    )
                )
                remaining = round(remaining - got, 2)

    return applied
