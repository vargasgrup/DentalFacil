"""Ensure unique patient document index exists on already-stamped local DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_patient_document_unique")


def ensure_patient_document_unique() -> None:
    """
    Create ``ux_patients_tipo_numero_documento`` if missing.

    Without this index, concurrent creates can insert the same document twice
    (app-level check is TOCTOU). Safe to run on every boot.

    If the clinic already has duplicate documents, index creation is skipped
    with a warning (boot must not fail).
    """
    insp = inspect(engine)
    if "patients" not in set(insp.get_table_names()):
        return

    dialect = engine.dialect.name
    existing = {idx["name"] for idx in insp.get_indexes("patients")}
    if "ux_patients_tipo_numero_documento" in existing:
        return

    try:
        with engine.begin() as conn:
            if dialect == "sqlite":
                # SQLite allows multiple NULLs in a UNIQUE index; matches app semantics.
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_tipo_numero_documento "
                        "ON patients (tipo_documento, numero_documento)"
                    )
                )
            else:
                # Partial unique: ignore NULL / empty documento (Postgres).
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_tipo_numero_documento "
                        "ON patients (tipo_documento, numero_documento) "
                        "WHERE numero_documento IS NOT NULL AND btrim(numero_documento) <> ''"
                    )
                )
        logger.info("[dentalfacil] ensured ux_patients_tipo_numero_documento")
    except (OperationalError, ProgrammingError) as exc:
        logger.warning(
            "could not create ux_patients_tipo_numero_documento "
            "(possible duplicate documents already in DB): %s",
            exc,
        )
