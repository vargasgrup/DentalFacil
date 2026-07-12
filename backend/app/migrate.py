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
            err = str(exc)
            _migrations_ok = False
            _migrations_error = err
            print(f"[dentalfacil] migrations FAILED (attempt {attempt}): {exc}", flush=True)

            # Schema already has columns but alembic_version is behind the failed revision.
            # Stamp that revision, then continue upgrading remaining ones.
            duplicate = any(
                token in err.lower()
                for token in ("duplicatecolumn", "already exists", "duplicate table")
            )
            if duplicate:
                stamp_target = None
                lower = err.lower()
                if "lugar_nacimiento" in lower or "plan_tratamiento_new" in lower:
                    stamp_target = "f1030bfb1b16"
                elif "firma_odontologo" in lower or "firma_paciente" in lower:
                    stamp_target = "c9f2a1b3d4e5"
                elif "denticion" in lower or "superficies" in lower:
                    stamp_target = "e2b3c4d5e6f7"
                try:
                    from alembic import command
                    from alembic.config import Config
                    from app.db_health import schema_ready

                    cfg = Config("alembic.ini")
                    ready, _ = schema_ready()
                    if stamp_target:
                        print(f"[dentalfacil] stamping {stamp_target} then retry upgrade", flush=True)
                        command.stamp(cfg, stamp_target)
                        command.upgrade(cfg, "head")
                        _migrations_ok = True
                        _migrations_error = None
                        print("[dentalfacil] migrations ok after stamp+upgrade", flush=True)
                        return True
                    if ready:
                        print("[dentalfacil] stamping head (schema already ready)", flush=True)
                        command.stamp(cfg, "head")
                        _migrations_ok = True
                        _migrations_error = None
                        return True
                except Exception as stamp_exc:  # noqa: BLE001
                    print(f"[dentalfacil] stamp recovery failed: {stamp_exc}", flush=True)
                    _migrations_error = f"{err} | stamp: {stamp_exc}"

            if attempt < retries:
                time.sleep(2 * attempt)
    return False
