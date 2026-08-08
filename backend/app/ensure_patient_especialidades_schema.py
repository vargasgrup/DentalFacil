"""Ensure patients.especialidades (JSON list) exists; backfill from especialidad."""

from __future__ import annotations

import json

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_patient_especialidades_schema")


def ensure_patient_especialidades_schema() -> None:
    insp = inspect(engine)
    if "patients" not in set(insp.get_table_names()):
        return
    cols = {c["name"] for c in insp.get_columns("patients")}
    dialect = engine.dialect.name
    if "especialidades" not in cols:
        with engine.begin() as conn:
            if dialect == "sqlite":
                conn.execute(text("ALTER TABLE patients ADD COLUMN especialidades TEXT"))
            else:
                conn.execute(
                    text(
                        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS especialidades JSONB"
                    )
                )
            logger.info("[dentalfacil] added patients.especialidades")

    # Backfill: single especialidad → JSON array when multi column empty
    with engine.begin() as conn:
        if dialect == "sqlite":
            rows = conn.execute(
                text(
                    "SELECT id, especialidad, especialidades FROM patients "
                    "WHERE especialidad IS NOT NULL AND trim(especialidad) != '' "
                    "AND (especialidades IS NULL OR especialidades = '' OR especialidades = 'null')"
                )
            ).fetchall()
            for pid, esp, _ in rows:
                payload = json.dumps([str(esp).strip()], ensure_ascii=False)
                conn.execute(
                    text("UPDATE patients SET especialidades = :j WHERE id = :id"),
                    {"j": payload, "id": pid},
                )
            if rows:
                logger.info(
                    "[dentalfacil] backfilled especialidades for %s patient(s)",
                    len(rows),
                )
        else:
            # PostgreSQL: build jsonb array from varchar column when empty
            result = conn.execute(
                text(
                    """
                    UPDATE patients
                       SET especialidades = jsonb_build_array(especialidad)
                     WHERE especialidad IS NOT NULL
                       AND btrim(especialidad) <> ''
                       AND (especialidades IS NULL OR especialidades = 'null'::jsonb
                            OR especialidades = '[]'::jsonb)
                    """
                )
            )
            if result.rowcount:
                logger.info(
                    "[dentalfacil] backfilled especialidades for %s patient(s)",
                    result.rowcount,
                )
