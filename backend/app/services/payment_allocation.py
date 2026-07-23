"""Allocate cash ingresos onto clinical evolution / plan lines (single money flow).

Source of truth for real money: cash_transactions (Caja).
a_cuenta on evolution/plan is the clinical allocation mirror of those payments —
updated here so Plan, Evolución and Resumen stay symmetrical.

Partial abonos (e.g. pay S/ 100 of S/ 120) leave saldo on the same line so the
next visit shows remaining balance in “Aplicar a”.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models import ClinicalEvolutionEntry, ClinicalRecord
from app.odontogram.plans import normalize_plans


@dataclass
class AllocationApplied:
    kind: str  # evolution | plan
    id: str
    amount: float
    label: str
    saldo_after: float = 0.0
    costo: float = 0.0
    a_cuenta_after: float = 0.0


class AllocationError(ValueError):
    """Explicit clinical target could not receive the payment."""


def _evo_saldo(entry: ClinicalEvolutionEntry) -> float:
    costo = float(entry.costo or 0)
    paid = float(entry.a_cuenta or 0)
    return max(0.0, round(costo - paid, 2))


def _plan_item_subtotal(it: dict) -> float:
    return float(it.get("cantidad") or 0) * float(it.get("costo_unitario") or 0)


def _plan_item_saldo(it: dict) -> float:
    return max(0.0, round(_plan_item_subtotal(it) - float(it.get("a_cuenta") or 0), 2))


def reconcile_plan_evolution_costs(db: Session, patient_id: str) -> None:
    """Align linked evolution costs with plan subtotals; backfill plan_item_id.

    Common desync: plan shows S/ 120 but evolution.costo stayed 0 → payment
    targets disappear and Plan never receives a_cuenta updates.
    """
    record = (
        db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).first()
    )
    if not record or not record.plan_tratamiento:
        return

    plans = normalize_plans(record.plan_tratamiento)
    changed_plan = False

    for alt in plans.get("alternatives") or []:
        for it in alt.get("items") or []:
            item_id = str(it.get("id") or "").strip()
            if not item_id:
                continue
            plan_sub = round(_plan_item_subtotal(it), 2)
            evo_id = str(it.get("evolution_entry_id") or "").strip() or None

            entry: ClinicalEvolutionEntry | None = None
            if evo_id:
                entry = db.get(ClinicalEvolutionEntry, evo_id)
                if entry and entry.patient_id != patient_id:
                    entry = None
            if entry is None:
                entry = (
                    db.query(ClinicalEvolutionEntry)
                    .filter(
                        ClinicalEvolutionEntry.patient_id == patient_id,
                        ClinicalEvolutionEntry.plan_item_id == item_id,
                    )
                    .first()
                )

            if entry is None:
                continue

            if not entry.plan_item_id:
                entry.plan_item_id = item_id

            # Plan drives list price; never shrink below already allocated a_cuenta
            evo_ac = float(entry.a_cuenta or 0)
            if plan_sub > 0 and float(entry.costo or 0) + 0.009 < plan_sub:
                entry.cantidad = float(it.get("cantidad") or 1) or 1.0
                entry.costo_unitario = float(it.get("costo_unitario") or 0)
                entry.costo = max(plan_sub, evo_ac)

            if not it.get("evolution_entry_id"):
                it["evolution_entry_id"] = entry.id
                changed_plan = True

            # Prefer clinical a_cuenta (from Caja) over stale plan JSON
            if evo_ac > float(it.get("a_cuenta") or 0) + 0.009:
                it["a_cuenta"] = evo_ac
                changed_plan = True
            elif float(it.get("a_cuenta") or 0) > evo_ac + 0.009:
                # Plan edited manually higher — keep max without exceeding cost
                costo = float(entry.costo or 0)
                entry.a_cuenta = min(costo, float(it.get("a_cuenta") or 0))

    if changed_plan:
        record.plan_tratamiento = plans
        flag_modified(record, "plan_tratamiento")


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
    if _evo_saldo(entry) <= 0.009 and (entry.estado or "") == "pendiente":
        entry.estado = "en_proceso"
    _sync_plan_from_entry(db, entry)
    return apply


def _apply_to_plan_item(
    db: Session, patient_id: str, item_id: str, amount: float
) -> float:
    if amount <= 0:
        return 0.0

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
            evo_id = it.get("evolution_entry_id")
            if evo_id:
                entry = db.get(ClinicalEvolutionEntry, evo_id)
                if entry and entry.patient_id == patient_id:
                    if not entry.plan_item_id:
                        entry.plan_item_id = item_id
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
    reconcile_plan_evolution_costs(db, patient_id)

    targets: list[dict] = []
    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .order_by(ClinicalEvolutionEntry.fecha.asc())
        .all()
    )
    linked_plan_ids: set[str] = set()
    for e in entries:
        saldo = _evo_saldo(e)
        if e.plan_item_id and saldo > 0:
            linked_plan_ids.add(str(e.plan_item_id))
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
        alts = plans.get("alternatives") or []
        for alt in alts:
            alt_name = (alt.get("nombre") or "Plan").strip() or "Plan"
            is_active = (not active_id) or alt.get("id") == active_id
            for it in alt.get("items") or []:
                pid = str(it.get("id") or "")
                if not pid or pid in linked_plan_ids:
                    continue
                # Skip plan row only if linked evolution still has open saldo
                # (already listed above). If evolution is missing/closed but plan
                # still shows saldo, expose the plan target.
                evo_link = str(it.get("evolution_entry_id") or "").strip()
                if evo_link:
                    entry = db.get(ClinicalEvolutionEntry, evo_link)
                    if entry and entry.patient_id == patient_id and _evo_saldo(entry) > 0:
                        continue
                saldo = _plan_item_saldo(it)
                if saldo <= 0:
                    continue
                item_label = it.get("item") or "Ítem del plan"
                if len(alts) > 1:
                    suffix = " · activo" if is_active else ""
                    item_label = f"{alt_name}{suffix}: {item_label}"
                targets.append(
                    {
                        "kind": "plan",
                        "id": pid,
                        "plan_item_id": pid,
                        "label": item_label,
                        "pieza_fdi": it.get("pieza_fdi"),
                        "costo": _plan_item_subtotal(it),
                        "a_cuenta": float(it.get("a_cuenta") or 0),
                        "saldo": saldo,
                        "plan_activo": is_active,
                    }
                )
    targets.sort(
        key=lambda t: (
            0 if t.get("kind") == "evolution" else 1,
            0 if t.get("plan_activo", True) else 1,
            str(t.get("label") or ""),
        )
    )
    return targets


def _pack_applied(
    kind: str,
    target_id: str,
    amount: float,
    label: str,
    *,
    saldo_after: float,
    costo: float,
    a_cuenta_after: float,
) -> AllocationApplied:
    return AllocationApplied(
        kind=kind,
        id=target_id,
        amount=amount,
        label=label,
        saldo_after=saldo_after,
        costo=costo,
        a_cuenta_after=a_cuenta_after,
    )


def allocate_ingreso(
    db: Session,
    *,
    patient_id: str,
    monto: float,
    evolution_entry_id: str | None = None,
    plan_item_id: str | None = None,
    require_target: bool = False,
) -> list[AllocationApplied]:
    """Distribute an ingreso across clinical lines. Returns applications made.

    If require_target and an explicit evolution/plan id is given but nothing
    can be applied, raises AllocationError (Caja should surface 400).
    """
    reconcile_plan_evolution_costs(db, patient_id)

    remaining = round(float(monto), 2)
    if remaining <= 0:
        return []

    applied: list[AllocationApplied] = []
    explicit = bool(evolution_entry_id or plan_item_id)

    if evolution_entry_id:
        entry = db.get(ClinicalEvolutionEntry, evolution_entry_id)
        if not entry or entry.patient_id != patient_id:
            if require_target or explicit:
                raise AllocationError(
                    "El destino de evolución no existe o no pertenece al paciente."
                )
            return []
        got = _apply_to_evolution(db, entry, remaining)
        if got:
            applied.append(
                _pack_applied(
                    "evolution",
                    entry.id,
                    got,
                    entry.tratamiento_descripcion,
                    saldo_after=_evo_saldo(entry),
                    costo=float(entry.costo or 0),
                    a_cuenta_after=float(entry.a_cuenta or 0),
                )
            )
        elif require_target or explicit:
            raise AllocationError(
                f"«{entry.tratamiento_descripcion}» no tiene saldo pendiente "
                f"(costo S/ {float(entry.costo or 0):.2f}, a cuenta S/ {float(entry.a_cuenta or 0):.2f})."
            )
        return applied

    if plan_item_id:
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
                    _pack_applied(
                        "evolution",
                        entry.id,
                        got,
                        entry.tratamiento_descripcion,
                        saldo_after=_evo_saldo(entry),
                        costo=float(entry.costo or 0),
                        a_cuenta_after=float(entry.a_cuenta or 0),
                    )
                )
            elif require_target or explicit:
                raise AllocationError(
                    f"El ítem del plan no tiene saldo pendiente "
                    f"(a cuenta S/ {float(entry.a_cuenta or 0):.2f})."
                )
            return applied
        got = _apply_to_plan_item(db, patient_id, plan_item_id, remaining)
        if got:
            # Re-read saldo after apply
            saldo_after = 0.0
            costo = got
            a_cuenta_after = got
            record = (
                db.query(ClinicalRecord)
                .filter(ClinicalRecord.patient_id == patient_id)
                .first()
            )
            if record and record.plan_tratamiento:
                for alt in normalize_plans(record.plan_tratamiento).get("alternatives") or []:
                    for it in alt.get("items") or []:
                        if str(it.get("id") or "") == str(plan_item_id):
                            saldo_after = _plan_item_saldo(it)
                            costo = _plan_item_subtotal(it)
                            a_cuenta_after = float(it.get("a_cuenta") or 0)
                            break
            applied.append(
                _pack_applied(
                    "plan",
                    plan_item_id,
                    got,
                    plan_item_id,
                    saldo_after=saldo_after,
                    costo=costo,
                    a_cuenta_after=a_cuenta_after,
                )
            )
        elif require_target or explicit:
            raise AllocationError(
                "El ítem del plan no existe o ya está saldado."
            )
        return applied

    # Auto FIFO
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
                    _pack_applied(
                        "evolution",
                        entry.id,
                        got,
                        entry.tratamiento_descripcion,
                        saldo_after=_evo_saldo(entry),
                        costo=float(entry.costo or 0),
                        a_cuenta_after=float(entry.a_cuenta or 0),
                    )
                )
                remaining = round(remaining - got, 2)
        else:
            got = _apply_to_plan_item(db, patient_id, target["id"], remaining)
            if got:
                applied.append(
                    _pack_applied(
                        "plan",
                        target["id"],
                        got,
                        str(target.get("label") or target["id"]),
                        saldo_after=max(0.0, round(float(target["saldo"]) - got, 2)),
                        costo=float(target.get("costo") or 0),
                        a_cuenta_after=float(target.get("a_cuenta") or 0) + got,
                    )
                )
                remaining = round(remaining - got, 2)

    return applied
