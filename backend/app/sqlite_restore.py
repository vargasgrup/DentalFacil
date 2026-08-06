"""Staged SQLite restore + clinical data merge (safe at engine boot)."""

from __future__ import annotations

import logging
import os
import shutil
import sqlite3
from pathlib import Path
from typing import Any

from app.paths import resolve_sqlite_file

logger = logging.getLogger("dentalfacil.sqlite_restore")

# Operational clinic data (patients, finances, clinical charting, users).
# Never wholesale-replaces live schema / alembic / backup module tables.
CLINICAL_DATA_TABLES: tuple[str, ...] = (
    "users",
    "patients",
    "clinic_settings",
    "clinical_records",
    "clinical_evolution_entries",
    "odontogram_entries",
    "odontogram_change_log",
    "odontogram_snapshots",
    "periodontogram_entries",
    "tooth_media",
    "complementary_test_files",
    "historical_documents",
    "appointments",
    "appointment_reminders",
    "cash_sessions",
    "cash_transactions",
    "documents_generated",
    "clinical_audit_log",
    "password_reset_tokens",
)

SYSTEM_TABLES_NEVER_RESTORE: frozenset[str] = frozenset(
    {
        "alembic_version",
        "backup_settings",
        "backup_history",
        "revoked_tokens",
    }
)


def _sidecars(db_path: Path) -> list[Path]:
    base = str(db_path)
    return [Path(base + "-wal"), Path(base + "-shm"), Path(base + "-journal")]


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _sqlite_table_names(conn: sqlite3.Connection, schema: str = "main") -> set[str]:
    rows = conn.execute(
        f"SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {str(r[0]) for r in rows}


def _sqlite_columns(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    rows = conn.execute(f"PRAGMA {schema}.table_info({_quote_ident(table)})").fetchall()
    return [str(r[1]) for r in rows]


def merge_clinical_sqlite_into_live(
    source_db: Path,
    dest_db: Path,
    *,
    tables: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """
    Copy clinic operational tables from source_db into dest_db.

    Destination keeps its schema tables (alembic_version, backup_settings, …).
    Only columns present in BOTH databases are copied (cross-version safe).
    """
    tables = tables or CLINICAL_DATA_TABLES
    if not source_db.is_file():
        raise FileNotFoundError(f"source DB missing: {source_db}")

    if not dest_db.is_file():
        dest_db.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_db, dest_db)
        return {
            "mode": "bootstrap_copy",
            "tables_merged": list(tables),
            "rows": {},
            "skipped": [],
        }

    dest_conn = sqlite3.connect(str(dest_db), timeout=60)
    try:
        dest_conn.execute("PRAGMA foreign_keys=OFF")
        dest_conn.execute("PRAGMA busy_timeout=60000")
        dest_conn.execute("ATTACH DATABASE ? AS src", (str(source_db),))
        src_tables = _sqlite_table_names(dest_conn, "src")
        dest_tables = _sqlite_table_names(dest_conn, "main")
        merged: dict[str, int] = {}
        skipped: list[str] = []

        for table in tables:
            if table in SYSTEM_TABLES_NEVER_RESTORE:
                skipped.append(f"{table}:system")
                continue
            if table not in src_tables:
                skipped.append(f"{table}:missing_in_backup")
                continue
            if table not in dest_tables:
                skipped.append(f"{table}:missing_in_install")
                continue
            src_cols = _sqlite_columns(dest_conn, "src", table)
            dest_cols = _sqlite_columns(dest_conn, "main", table)
            common = [c for c in dest_cols if c in src_cols]
            if not common:
                skipped.append(f"{table}:no_common_columns")
                continue
            col_sql = ", ".join(_quote_ident(c) for c in common)
            tq = _quote_ident(table)
            try:
                dest_conn.execute(f"DELETE FROM main.{tq}")
                dest_conn.execute(
                    f"INSERT INTO main.{tq} ({col_sql}) SELECT {col_sql} FROM src.{tq}"
                )
                n = dest_conn.execute(f"SELECT COUNT(*) FROM main.{tq}").fetchone()
                merged[table] = int(n[0] if n else 0)
            except sqlite3.Error as exc:
                skipped.append(f"{table}:error:{exc}")
                logger.warning("merge table %s failed: %s", table, exc)

        if "revoked_tokens" in dest_tables:
            try:
                dest_conn.execute("DELETE FROM main.revoked_tokens")
            except sqlite3.Error:
                pass

        dest_conn.commit()
        dest_conn.execute("DETACH DATABASE src")
        dest_conn.execute("PRAGMA foreign_keys=ON")
        try:
            dest_conn.execute("PRAGMA foreign_key_check")
        except sqlite3.Error as exc:
            logger.warning("foreign_key_check after merge: %s", exc)
        return {
            "mode": "merge_clinical",
            "tables_merged": list(merged.keys()),
            "rows": merged,
            "skipped": skipped,
        }
    finally:
        try:
            dest_conn.close()
        except Exception:  # noqa: BLE001
            pass


def stage_pending_restore(snap: Path, live: Path) -> None:
    """Legacy full-file staging. Prefer clinical merge."""
    pending = Path(str(live) + ".pending_restore")
    marker = Path(str(live) + ".restore_marker")
    shutil.copy2(snap, pending)
    marker.write_text("pending\n", encoding="utf-8")


def stage_pending_clinical_merge(snap: Path, live: Path) -> None:
    """Stage clinical source DB to merge after restart."""
    pending = Path(str(live) + ".pending_clinical")
    marker = Path(str(live) + ".clinical_merge_marker")
    shutil.copy2(snap, pending)
    marker.write_text("merge\n", encoding="utf-8")
    logger.info("staged pending clinical merge → %s", pending)


def apply_pending_clinical_merge(database_url: str) -> bool:
    try:
        live = resolve_sqlite_file(database_url)
    except ValueError:
        return False
    pending = Path(str(live) + ".pending_clinical")
    marker = Path(str(live) + ".clinical_merge_marker")
    if not (pending.is_file() and marker.is_file()):
        return False

    try:
        if not live.is_file():
            live.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(pending, live)
            logger.warning(
                "live DB missing — copied clinical source; migrations will heal schema"
            )
        else:
            merge_clinical_sqlite_into_live(pending, live)
        pending.unlink(missing_ok=True)
        marker.unlink(missing_ok=True)
        for side in _sidecars(live):
            try:
                side.unlink(missing_ok=True)
            except OSError:
                pass
        logger.info("applied pending clinical merge → %s", live)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("pending clinical merge failed: %s", exc, exc_info=True)
        return False


def apply_pending_sqlite_restore(database_url: str) -> bool:
    """Apply staged restore; prefer clinical merge over full replace."""
    if apply_pending_clinical_merge(database_url):
        return True

    try:
        live = resolve_sqlite_file(database_url)
    except ValueError:
        return False
    pending = Path(str(live) + ".pending_restore")
    marker = Path(str(live) + ".restore_marker")
    if not (pending.is_file() and marker.is_file()):
        return False

    for side in _sidecars(live):
        try:
            side.unlink(missing_ok=True)
        except OSError:
            logger.warning("could not remove sidecar before pending restore: %s", side)

    try:
        live.parent.mkdir(parents=True, exist_ok=True)
        if live.is_file():
            try:
                merge_clinical_sqlite_into_live(pending, live)
                pending.unlink(missing_ok=True)
                marker.unlink(missing_ok=True)
                logger.info(
                    "legacy pending restore applied as clinical merge → %s", live
                )
                return True
            except Exception as merge_exc:  # noqa: BLE001
                logger.warning(
                    "legacy pending convert-to-merge failed (%s); file replace fallback",
                    merge_exc,
                )
        os.replace(str(pending), str(live))
        marker.unlink(missing_ok=True)
        for side in _sidecars(live):
            try:
                side.unlink(missing_ok=True)
            except OSError:
                pass
        logger.info("applied legacy full pending sqlite restore → %s", live)
        return True
    except OSError as exc:
        logger.error("pending sqlite restore failed: %s", exc, exc_info=True)
        return False
