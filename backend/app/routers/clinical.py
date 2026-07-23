from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import (
    CashTransaction,
    ClinicalEvolutionEntry,
    ClinicalRecord,
    Patient,
    User,
)
from app.schemas.clinical import (
    ClinicalEvolutionEntryCreate,
    ClinicalEvolutionEntryOut,
    ClinicalEvolutionEntryUpdate,
    ClinicalRecordOut,
    ClinicalRecordUpdate,
    ConsentimientoUpdate,
    FinancialSummary,
)
from app.services.audit import log_audit
from app.odontogram.plans import normalize_plans

router = APIRouter(prefix="/api/clinical", tags=["clinical"])


def _get_or_create_record(db: Session, patient_id: str) -> ClinicalRecord:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    record = db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).first()
    if not record:
        record = ClinicalRecord(patient_id=patient_id)
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


def _sync_plan_item_from_evolution(
    db: Session, patient_id: str, entry: ClinicalEvolutionEntry
) -> None:
    """Mirror evolution economics back onto the linked plan item (presupuesto ↔ atención)."""
    from sqlalchemy.orm.attributes import flag_modified

    record = (
        db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).first()
    )
    if not record or not record.plan_tratamiento:
        return
    plans = normalize_plans(record.plan_tratamiento)
    changed = False
    plan_item_id = str(entry.plan_item_id or "").strip() or None

    for alt in plans.get("alternatives") or []:
        for it in alt.get("items") or []:
            it_id = str(it.get("id") or "")
            evo_link = str(it.get("evolution_entry_id") or "")
            matched = False
            if plan_item_id and it_id == plan_item_id:
                matched = True
            elif evo_link and evo_link == str(entry.id):
                matched = True
                # Backfill missing plan_item_id on evolution for next syncs
                if not entry.plan_item_id and it_id:
                    entry.plan_item_id = it_id
                    plan_item_id = it_id
            if not matched:
                continue
            it["evolution_entry_id"] = entry.id
            if plan_item_id:
                it["id"] = plan_item_id
            it["a_cuenta"] = float(entry.a_cuenta or 0)
            it["estado"] = entry.estado or it.get("estado") or "pendiente"
            it["cantidad"] = float(entry.cantidad or it.get("cantidad") or 1)
            it["costo_unitario"] = float(
                entry.costo_unitario or it.get("costo_unitario") or 0
            )
            if entry.pieza_fdi:
                it["pieza_fdi"] = entry.pieza_fdi
            changed = True
            break
        if changed:
            break

    if changed:
        record.plan_tratamiento = plans
        flag_modified(record, "plan_tratamiento")


@router.get("/{patient_id}/record", response_model=ClinicalRecordOut)
def get_record(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _get_or_create_record(db, patient_id)


@router.patch("/{patient_id}/record", response_model=ClinicalRecordOut)
def update_record(
    patient_id: str,
    payload: ClinicalRecordUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record = _get_or_create_record(db, patient_id)
    data = payload.model_dump(exclude_unset=True)
    if "plan_tratamiento" in data and data["plan_tratamiento"] is not None:
        from app.services.plan_evolution_sync import sync_active_plan_to_evolution
        from sqlalchemy.orm.attributes import flag_modified

        plans = normalize_plans(data["plan_tratamiento"])
        data["plan_tratamiento"] = plans
        log_audit(
            db,
            patient_id=patient_id,
            entity_type="plan",
            action="update",
            user_id=user.id,
            detail={"alternatives": len(plans.get("alternatives", []))},
        )
        for field, value in data.items():
            setattr(record, field, value)
        # Auto-create/update evolución for active plan lines → resume + pagos
        synced = sync_active_plan_to_evolution(
            db,
            patient_id=patient_id,
            plans=plans,
            doctor_id=user.id,
        )
        record.plan_tratamiento = synced
        flag_modified(record, "plan_tratamiento")
        db.commit()
        db.refresh(record)
        return record

    for field, value in data.items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@router.patch("/{patient_id}/consentimiento", response_model=ClinicalRecordOut)
def update_consentimiento(
    patient_id: str,
    payload: ConsentimientoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from datetime import datetime, timezone
    record = _get_or_create_record(db, patient_id)
    record.consentimiento_firmado = payload.firmado
    record.consentimiento_fecha = datetime.now(timezone.utc) if payload.firmado else None
    if payload.firma_odontologo is not None:
        record.firma_odontologo = payload.firma_odontologo or None
    if payload.firma_paciente is not None:
        record.firma_paciente = payload.firma_paciente or None
    if not payload.firmado:
        record.firma_odontologo = None
        record.firma_paciente = None
    log_audit(
        db,
        patient_id=patient_id,
        entity_type="consent",
        action="firmar" if payload.firmado else "revocar",
        user_id=user.id,
        detail={"vinculado_a_plan": True},
    )
    db.commit()
    db.refresh(record)
    return record


# --- Evolution entries ---

@router.get("/{patient_id}/evolution", response_model=list[ClinicalEvolutionEntryOut])
def list_evolution(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .order_by(ClinicalEvolutionEntry.fecha.desc())
        .all()
    )


@router.post(
    "/{patient_id}/evolution",
    response_model=ClinicalEvolutionEntryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_evolution(
    patient_id: str,
    payload: ClinicalEvolutionEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_or_create_record(db, patient_id)  # ensure patient + record exist
    cantidad = float(payload.cantidad or 1) or 1.0
    unit = float(payload.costo_unitario or 0)
    costo = float(payload.costo) if payload.costo is not None else cantidad * unit
    if unit == 0 and costo and cantidad:
        unit = costo / cantidad
    a_cuenta = min(float(payload.a_cuenta or 0), costo)
    entry = ClinicalEvolutionEntry(
        patient_id=patient_id,
        doctor_id=payload.doctor_id or user.id,
        especialidad=payload.especialidad,
        tratamiento_descripcion=payload.tratamiento_descripcion,
        pieza_fdi=payload.pieza_fdi,
        cantidad=cantidad,
        costo_unitario=unit,
        costo=costo,
        a_cuenta=a_cuenta,
        estado=payload.estado,
        plan_item_id=payload.plan_item_id,
        proxima_cita_fecha=payload.proxima_cita_fecha,
        origen="tiempo_real",
    )
    db.add(entry)
    db.flush()
    if payload.plan_item_id:
        _sync_plan_item_from_evolution(db, patient_id, entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/evolution/{entry_id}", response_model=ClinicalEvolutionEntryOut)
def update_evolution(
    entry_id: str,
    payload: ClinicalEvolutionEntryUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = db.get(ClinicalEvolutionEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    data = payload.model_dump(exclude_unset=True)
    # Bloquear backdating / cambio de origen aunque el cliente envíe campos extras
    data.pop("fecha", None)
    data.pop("origen", None)
    data.pop("created_at", None)
    for field, value in data.items():
        setattr(entry, field, value)
    # Keep costo coherent with qty × unit when either changes
    if any(k in data for k in ("cantidad", "costo_unitario", "costo")):
        cantidad = float(entry.cantidad or 1) or 1.0
        unit = float(entry.costo_unitario or 0)
        if "costo" in data and data["costo"] is not None and "cantidad" not in data and "costo_unitario" not in data:
            entry.costo = float(data["costo"])
            if cantidad and not unit:
                entry.costo_unitario = entry.costo / cantidad
        else:
            if unit == 0 and float(entry.costo or 0) and cantidad:
                unit = float(entry.costo) / cantidad
                entry.costo_unitario = unit
            entry.costo = cantidad * float(entry.costo_unitario or 0)
            entry.cantidad = cantidad
    entry.a_cuenta = min(float(entry.a_cuenta or 0), float(entry.costo or 0))
    if entry.plan_item_id:
        _sync_plan_item_from_evolution(db, entry.patient_id, entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{patient_id}/evolution/{entry_id}", status_code=204)
def delete_evolution(
    patient_id: str,
    entry_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = db.get(ClinicalEvolutionEntry, entry_id)
    if not entry or entry.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    db.delete(entry)
    db.commit()


# --- Financial summary (calculated from Caja, never stored) ---

@router.get("/{patient_id}/financial", response_model=FinancialSummary)
def financial_summary(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Financial summary calculated live.
    - costo_total: ∑ evolución.costo (atenciones)
    - pagado_total: ∑ Caja ingresos del paciente (dinero real)
    - saldo: costo_total - pagado_total
    - a_cuenta_clinico: ∑ evolución.a_cuenta (asignación clínica de pagos)
    - plan_*: estimado del plan activo (presupuesto)
    """
    from app.odontogram.plans import normalize_plans, estimate as plan_estimate

    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .all()
    )
    costo_total = sum(float(e.costo) for e in entries)
    a_cuenta_clinico = sum(float(e.a_cuenta or 0) for e in entries)

    transactions = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.patient_id == patient_id,
            CashTransaction.tipo == "ingreso",
        )
        .all()
    )
    pagado_total = sum(float(t.monto) for t in transactions)

    plan_estimado = 0.0
    plan_a_cuenta = 0.0
    record = (
        db.query(ClinicalRecord).filter(ClinicalRecord.patient_id == patient_id).first()
    )
    if record and record.plan_tratamiento:
        plans = normalize_plans(record.plan_tratamiento)
        active_id = plans.get("active_id")
        for alt in plans.get("alternatives") or []:
            if active_id and alt.get("id") != active_id:
                continue
            items = alt.get("items") or []
            plan_estimado = plan_estimate(items)
            plan_a_cuenta = sum(float(it.get("a_cuenta") or 0) for it in items)
            break

    return FinancialSummary(
        costo_total=costo_total,
        pagado_total=pagado_total,
        saldo=costo_total - pagado_total,
        a_cuenta_clinico=a_cuenta_clinico,
        plan_estimado=plan_estimado,
        plan_a_cuenta=plan_a_cuenta,
        plan_saldo=max(0.0, plan_estimado - plan_a_cuenta),
    )


@router.get("/{patient_id}/payment-targets")
def payment_targets(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Open plan/evolución lines with saldo — for payment allocation UI."""
    if not db.get(Patient, patient_id):
        raise HTTPException(status_code=404, detail="Paciente no encontrado")
    from app.services.payment_allocation import list_payment_targets

    return {"targets": list_payment_targets(db, patient_id)}
