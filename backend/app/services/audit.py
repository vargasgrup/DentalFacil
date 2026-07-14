"""Audit trail helper."""

from sqlalchemy.orm import Session

from app.models.periodontogram import ClinicalAuditLog


def log_audit(
    db: Session,
    *,
    patient_id: str | None,
    entity_type: str,
    action: str,
    user_id: str | None,
    entity_id: str | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        ClinicalAuditLog(
            patient_id=patient_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            detail=detail,
            user_id=user_id,
        )
    )
