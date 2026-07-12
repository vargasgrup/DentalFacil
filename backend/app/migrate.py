"""Alembic migrations — must complete before patient/clinical writes."""

from __future__ import annotations

import time

_migrations_ok = False
_migrations_error: str | None = None


def migrations_status() -> dict:
    return {"ok": _migrations_ok, "error": _migrations_error}


def run_migrations_blocking(retries: int = 3) -> bool:
    """Apply all Alembic revisions. Safe to call multiple times (no-op at head)."""
    global _migrations_ok, _migrations_error
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            from alembic import command
            from alembic.config import Config

            print(f"[dentalfacil] running migrations (attempt {attempt}/{retries})...", flush=True)
            command.upgrade(Config("alembic.ini"), "head")
            _migrations_ok = True
            _migrations_error = None
            print("[dentalfacil] migrations ok", flush=True)
            return True
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            _migrations_ok = False
            _migrations_error = str(exc)
            print(f"[dentalfacil] migrations FAILED (attempt {attempt}): {exc}", flush=True)
            if attempt < retries:
                time.sleep(2 * attempt)
    return False
