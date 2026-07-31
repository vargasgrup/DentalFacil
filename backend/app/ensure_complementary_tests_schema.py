"""Ensure complementary_test_files exists on already-stamped local DBs."""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.database import engine
from app.models.complementary_tests import ComplementaryTestFile  # noqa: F401

from app.logging_config import get_logger

logger = get_logger("ensure_complementary_tests_schema")


def ensure_complementary_tests_schema() -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    if "complementary_test_files" not in tables:
        ComplementaryTestFile.__table__.create(bind=engine, checkfirst=True)
        logger.info("[dentalfacil] created complementary_test_files")
        return

    # Widen stored_path for long Windows ProgramData paths
    try:
        cols = {c["name"]: c for c in insp.get_columns("complementary_test_files")}
        col = cols.get("stored_path")
        if col is not None:
            typ = str(col.get("type") or "")
            # SQLite reports VARCHAR(500) etc.; widen when clearly short
            if "500" in typ or typ.upper() in {"VARCHAR", "STRING"}:
                with engine.begin() as conn:
                    # SQLite ignores length, but keep DDL consistent for migrations/tools
                    if engine.dialect.name == "sqlite":
                        pass  # SQLite affinity is TEXT; no ALTER needed
                    else:
                        conn.execute(
                            text(
                                "ALTER TABLE complementary_test_files "
                                "ALTER COLUMN stored_path TYPE VARCHAR(1024)"
                            )
                        )
                        logger.info("[dentalfacil] widened complementary_test_files.stored_path")
    except Exception as exc:  # noqa: BLE001
        logger.warning("complementary_test_files stored_path check skipped: %s", exc)
