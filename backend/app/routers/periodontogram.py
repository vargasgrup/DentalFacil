from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Patient, User
from app.models.periodontogram import PeriodontogramEntry
from app.services.audit import log_audit

router = APIRouter(prefix="/api/periodontogram", tags=["periodontogram"])


class PerioIn(BaseModel):
    denticion: str = "permanente"
    movilidad: int = Field(0, ge=0, le=3)
    recesion_mm: float = 0
    sondaje_v: float = 0
    sondaje_l: float = 0
    sondaje_m: float = 0
    sondaje_d: float = 0
    sangrado: bool = False
    placa: bool = False
    notas: str | None = None


class PerioOut(BaseModel):
    id: str
    patient_id: str
    pieza_fdi: str
    denticion: str
    movilidad: int
    recesion_mm: float
    sondaje_v: float
    sondaje_l: float
    sondaje_m: float
    sondaje_d: float
    sangrado: bool
    placa: bool
    notas: str | None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


@router.get("/{patient_id}", response_model=list[PerioOut])
def list_perio(
    patient_id: str,
    denticion: str = Query("permanente"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    return (
        db.query(PeriodontogramEntry)
        .filter(
            PeriodontogramEntry.patient_id == patient_id,
            PeriodontogramEntry.denticion == denticion,
        )
        .order_by(PeriodontogramEntry.pieza_fdi)
        .all()
    )


@router.put("/{patient_id}/{pieza_fdi}", response_model=PerioOut)
def upsert_perio(
    patient_id: str,
    pieza_fdi: str,
    payload: PerioIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    denticion = payload.denticion if payload.denticion in ("permanente", "temporal", "mixta") else "permanente"
    row = (
        db.query(PeriodontogramEntry)
        .filter(
            PeriodontogramEntry.patient_id == patient_id,
            PeriodontogramEntry.pieza_fdi == pieza_fdi,
            PeriodontogramEntry.denticion == denticion,
        )
        .first()
    )
    data = payload.model_dump()
    data["denticion"] = denticion
    if row:
        for k, v in data.items():
            setattr(row, k, v)
        row.updated_by = user.id
    else:
        row = PeriodontogramEntry(
            patient_id=patient_id,
            pieza_fdi=pieza_fdi,
            updated_by=user.id,
            **data,
        )
        db.add(row)
    log_audit(
        db,
        patient_id=patient_id,
        entity_type="periodontogram",
        entity_id=pieza_fdi,
        action="upsert",
        user_id=user.id,
        detail={"movilidad": payload.movilidad, "sangrado": payload.sangrado},
    )
    db.commit()
    db.refresh(row)
    return row
