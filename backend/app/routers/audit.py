from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Patient, User
from app.models.periodontogram import ClinicalAuditLog

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditOut(BaseModel):
    id: str
    patient_id: str | None
    entity_type: str
    entity_id: str | None
    action: str
    detail: dict | None
    user_id: str | None
    user_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/{patient_id}", response_model=list[AuditOut])
def list_audit(
    patient_id: str,
    limit: int = Query(100, ge=1, le=500),
    entity_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    q = db.query(ClinicalAuditLog).filter(ClinicalAuditLog.patient_id == patient_id)
    if entity_type:
        q = q.filter(ClinicalAuditLog.entity_type == entity_type)
    rows = q.order_by(ClinicalAuditLog.created_at.desc()).limit(limit).all()
    out: list[AuditOut] = []
    for r in rows:
        u = db.get(User, r.user_id) if r.user_id else None
        out.append(
            AuditOut(
                id=r.id,
                patient_id=r.patient_id,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                action=r.action,
                detail=r.detail,
                user_id=r.user_id,
                user_name=(u.nombre if u else None),
                created_at=r.created_at,
            )
        )
    return out
