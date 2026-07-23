"""Unique composite key for odontogram / periodontogram entries."""

from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import OdontogramEntry, PeriodontogramEntry
from app.models.ids import new_uuid


def test_odontogram_rejects_duplicate_patient_pieza_denticion(
    db: Session,
    patient: dict,
):
    pid = patient["id"]
    db.add(
        OdontogramEntry(
            id=new_uuid(),
            patient_id=pid,
            pieza_fdi="11",
            denticion="permanente",
            estado="sano",
        )
    )
    db.commit()

    db.add(
        OdontogramEntry(
            id=new_uuid(),
            patient_id=pid,
            pieza_fdi="11",
            denticion="permanente",
            estado="caries",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_periodontogram_rejects_duplicate_patient_pieza_denticion(
    db: Session,
    patient: dict,
):
    pid = patient["id"]
    db.add(
        PeriodontogramEntry(
            id=new_uuid(),
            patient_id=pid,
            pieza_fdi="16",
            denticion="permanente",
        )
    )
    db.commit()

    db.add(
        PeriodontogramEntry(
            id=new_uuid(),
            patient_id=pid,
            pieza_fdi="16",
            denticion="permanente",
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_ensure_odontogram_unique_indexes_idempotent():
    from app.ensure_odontogram_unique import ensure_odontogram_unique_indexes

    ensure_odontogram_unique_indexes()
    ensure_odontogram_unique_indexes()
