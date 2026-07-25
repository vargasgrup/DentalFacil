"""Ensure historical_documents exists on already-stamped local DBs."""

from __future__ import annotations

from sqlalchemy import inspect

from app.database import engine
from app.models.historical_documents import HistoricalDocument  # noqa: F401
from app.logging_config import get_logger

logger = get_logger("ensure_historical_documents_schema")


def ensure_historical_documents_schema() -> None:
    insp = inspect(engine)
    if "historical_documents" in set(insp.get_table_names()):
        return
    HistoricalDocument.__table__.create(bind=engine, checkfirst=True)
    logger.info("[dentalfacil] created historical_documents")
