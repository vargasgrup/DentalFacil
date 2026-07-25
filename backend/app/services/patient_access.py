"""Shared patient lookups with soft-delete (activo) enforcement."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Patient


def get_patient_or_404(db: Session, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrado")
    return patient


def get_active_patient_or_404(db: Session, patient_id: str) -> Patient:
    """Require an active patient for operational writes (citas, cobros, etc.)."""
    patient = get_patient_or_404(db, patient_id)
    if patient.activo is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El paciente está dado de baja. Reactívalo en Pacientes "
                "antes de agendar, cobrar o registrar movimientos clínicos."
            ),
        )
    return patient
