"""Batch prefetch helpers — evita N+1 sin exigir relationship() en todos los modelos."""

from __future__ import annotations

from typing import Iterable, TypeVar

from sqlalchemy.orm import Session

from app.models import Patient, User

T = TypeVar("T")


def prefetch_by_ids(db: Session, model: type[T], ids: Iterable[str | None]) -> dict[str, T]:
    """Carga entidades por PK en una sola query. Retorna mapa id → fila."""
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = db.query(model).filter(model.id.in_(clean)).all()  # type: ignore[attr-defined]
    return {row.id: row for row in rows}  # type: ignore[attr-defined]


def prefetch_patients(db: Session, ids: Iterable[str | None]) -> dict[str, Patient]:
    return prefetch_by_ids(db, Patient, ids)


def prefetch_users(db: Session, ids: Iterable[str | None]) -> dict[str, User]:
    return prefetch_by_ids(db, User, ids)
