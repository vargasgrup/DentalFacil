"""Staged SQLite restore helpers (no SQLAlchemy imports — safe at engine boot)."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from app.paths import resolve_sqlite_file

logger = logging.getLogger("dentalfacil.sqlite_restore")


def _sidecars(db_path: Path) -> list[Path]:
    base = str(db_path)
    return [Path(base + "-wal"), Path(base + "-shm"), Path(base + "-journal")]


def stage_pending_restore(snap: Path, live: Path) -> None:
    pending = Path(str(live) + ".pending_restore")
    marker = Path(str(live) + ".restore_marker")
    import shutil

    shutil.copy2(snap, pending)
    marker.write_text("pending\n", encoding="utf-8")


def apply_pending_sqlite_restore(database_url: str) -> bool:
    """
    Apply a staged DB restore before/without an open engine (Windows-safe).
    """
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
        os.replace(str(pending), str(live))
        marker.unlink(missing_ok=True)
        for side in _sidecars(live):
            try:
                side.unlink(missing_ok=True)
            except OSError:
                pass
        logger.info("applied pending sqlite restore → %s", live)
        return True
    except OSError as exc:
        logger.error("pending sqlite restore failed: %s", exc, exc_info=True)
        return False
