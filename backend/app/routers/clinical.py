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
from app.odontogram.plans import normalize_plans, active_items

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
        data["plan_tratamiento"] = normalize_plans(data["plan_tratamiento"])
        log_audit(
            db,
            patient_id=patient_id,
            entity_type="plan",
            action="update",
            user_id=user.id,
            detail={"alternatives": len(data["plan_tratamiento"].get("alternatives", []))},
        )
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
    entry = ClinicalEvolutionEntry(
        patient_id=patient_id,
        doctor_id=payload.doctor_id or user.id,
        especialidad=payload.especialidad,
        tratamiento_descripcion=payload.tratamiento_descripcion,
        costo=payload.costo,
        a_cuenta=payload.a_cuenta,
        estado=payload.estado,
        proxima_cita_fecha=payload.proxima_cita_fecha,
    )
    db.add(entry)
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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
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
    - costo_total comes from evolution entries (estimated treatment cost).
    - pagado_total comes from actual cash transactions (ingresos) for this patient.
    - saldo = costo_total - pagado_total.
    This ensures the summary reflects real payments from Caja, never a stale field.
    """
    entries = (
        db.query(ClinicalEvolutionEntry)
        .filter(ClinicalEvolutionEntry.patient_id == patient_id)
        .all()
    )
    costo_total = sum(float(e.costo) for e in entries)

    transactions = (
        db.query(CashTransaction)
        .filter(
            CashTransaction.patient_id == patient_id,
            CashTransaction.tipo == "ingreso",
        )
        .all()
    )
    pagado_total = sum(float(t.monto) for t in transactions)

    return FinancialSummary(
        costo_total=costo_total,
        pagado_total=pagado_total,
        saldo=costo_total - pagado_total,
    )
