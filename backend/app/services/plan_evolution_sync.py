"""Sync active treatment plan → clinical evolution (automatic clinical ledger).

Saving the plan creates/updates linked evolution rows so Evolución, Resumen and
Registrar pago see the same costs without requiring a manual «→ Evolución» click
per row. Plan remains the presupuesto editor; evolution remains the official cost trail.
"""

from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models import ClinicalEvolutionEntry, ClinicalRecord
from app.odontogram.plans import normalize_plans


def _estado(raw: object) -> str:
    v = str(raw or "pendiente").lower()
    if v in ("en_curso", "en_proceso", "proceso"):
        return "en_proceso"
    if v in ("finalizado", "completado", "completo"):
        return "completado"
    return "pendiente"


def _desc(it: dict) -> str:
    name = str(it.get("item") or "").strip()
    pieza = str(it.get("pieza_fdi") or "").strip()
    if pieza and pieza not in name:
        return f"{name} (pieza {pieza})"
    return name


def sync_active_plan_to_evolution(
    db: Session,
    *,
    patient_id: str,
    plans: dict,
    doctor_id: str | None,
) -> dict:
    """Ensure each non-empty active plan item has a linked evolution entry."""
    plans = normalize_plans(plans)
    active_id = plans.get("active_id")
    created_or_updated = 0

    for alt in plans.get("alternatives") or []:
        if active_id and alt.get("id") != active_id:
            continue
        for it in alt.get("items") or []:
            name = str(it.get("item") or "").strip()
            if not name:
                continue
            item_id = str(it.get("id") or "")
            if not item_id:
                continue

            cantidad = float(it.get("cantidad") or 1) or 1.0
            unit = float(it.get("costo_unitario") or 0)
            costo = round(cantidad * unit, 2)
            plan_ac = float(it.get("a_cuenta") or 0)
            if plan_ac > costo:
                plan_ac = costo

            entry: ClinicalEvolutionEntry | None = None
            evo_id = it.get("evolution_entry_id")
            if evo_id:
                entry = db.get(ClinicalEvolutionEntry, str(evo_id))
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

            desc = _desc(it)
            estado = _estado(it.get("estado"))
            pieza = str(it.get("pieza_fdi") or "").strip() or None

            if entry is None:
                entry = ClinicalEvolutionEntry(
                    patient_id=patient_id,
                    doctor_id=doctor_id,
                    especialidad=None,
                    tratamiento_descripcion=desc,
                    pieza_fdi=pieza,
                    cantidad=cantidad,
                    costo_unitario=unit,
                    costo=costo,
                    a_cuenta=plan_ac,
                    estado=estado,
                    plan_item_id=item_id,
                    origen="tiempo_real",
                )
                db.add(entry)
                db.flush()
                created_or_updated += 1
            else:
                # Plan drives clinical fields; a_cuenta never decreases below allocated
                entry.tratamiento_descripcion = desc
                entry.pieza_fdi = pieza
                entry.cantidad = cantidad
                entry.costo_unitario = unit
                entry.costo = costo
                entry.estado = estado
                entry.plan_item_id = item_id
                entry.a_cuenta = min(costo, max(float(entry.a_cuenta or 0), plan_ac))
                if doctor_id and not entry.doctor_id:
                    entry.doctor_id = doctor_id
                created_or_updated += 1

            it["evolution_entry_id"] = entry.id
            it["a_cuenta"] = float(entry.a_cuenta or 0)
            it["estado"] = entry.estado

    if created_or_updated:
        record = (
            db.query(ClinicalRecord)
            .filter(ClinicalRecord.patient_id == patient_id)
            .first()
        )
        if record is not None:
            record.plan_tratamiento = plans
            flag_modified(record, "plan_tratamiento")

    return plans
