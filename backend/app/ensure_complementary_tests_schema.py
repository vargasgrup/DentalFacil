"""Ensure complementary_test_files exists on already-stamped local DBs."""

from __future__ import annotations

from sqlalchemy import inspect

from app.database import engine
from app.models.complementary_tests import ComplementaryTestFile  # noqa: F401

from app.logging_config import get_logger

logger = get_logger('ensure_complementary_tests_schema')


def ensure_complementary_tests_schema() -> None:
    insp = inspect(engine)
    if "complementary_test_files" in set(insp.get_table_names()):
        return
    ComplementaryTestFile.__table__.create(bind=engine, checkfirst=True)
    logger.info("[dentalfacil] created complementary_test_files")
