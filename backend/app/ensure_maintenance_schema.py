"""Ensure clinic_settings.maintenance_cycle_started_at exists."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.logging_config import get_logger

logger = get_logger("ensure_maintenance_schema")


def ensure_maintenance_schema() -> None:
    insp = inspect(engine)
    if "clinic_settings" not in set(insp.get_table_names()):
        return
    cols = {c["name"] for c in insp.get_columns("clinic_settings")}
    if "maintenance_cycle_started_at" in cols:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE clinic_settings "
                "ADD COLUMN maintenance_cycle_started_at TIMESTAMP WITH TIME ZONE"
            )
            if engine.dialect.name != "sqlite"
            else text(
                "ALTER TABLE clinic_settings "
                "ADD COLUMN maintenance_cycle_started_at DATETIME"
            )
        )
    logger.info("[dentalfacil] added clinic_settings.maintenance_cycle_started_at")
