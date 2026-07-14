"""Railway/Docker boot — migrate DB, then bind HTTP."""
from __future__ import annotations

import os
import sys
import traceback


def main() -> None:
    port = int(os.environ.get("PORT") or "8000")
    print(f"[dentalfacil] boot.py starting on 0.0.0.0:{port}", flush=True)
    print(f"[dentalfacil] RAILWAY_ENVIRONMENT={os.environ.get('RAILWAY_ENVIRONMENT', '')}", flush=True)
    db = os.environ.get("DATABASE_URL", "")
    if db.lower().startswith("http"):
        print(
            "[dentalfacil] FATAL CONFIG: DATABASE_URL is an https:// URL. "
            "For Railway SQLite staging use sqlite:////data/clinica.db "
            "(see docs/RAILWAY.md). Do not paste the public HTTPS site URL.",
            flush=True,
        )
        sys.exit(1)
    elif not db:
        print(
            "[dentalfacil] WARNING: DATABASE_URL empty — using Settings default "
            "(sqlite:///./data/clinica.db). On Railway set sqlite:////data/clinica.db + Volume.",
            flush=True,
        )
    else:
        if db.strip().lower().startswith("sqlite"):
            print(f"[dentalfacil] DATABASE_URL = sqlite ({db})", flush=True)
        else:
            safe = db.split("@")[-1] if "@" in db else "(set)"
            print(f"[dentalfacil] DATABASE_URL host/db = {safe}", flush=True)

        from app.migrate import run_migrations_blocking
        from app.ensure_auth_schema import ensure_auth_schema
        from app.schema_guard import assert_schema_compatible_with_uuid_models

        run_migrations_blocking()
        try:
            ensure_auth_schema()
        except Exception as exc:  # noqa: BLE001
            print(f"[dentalfacil] ensure_auth_schema FAILED: {exc}", flush=True)
            traceback.print_exc()
            sys.exit(1)
        assert_schema_compatible_with_uuid_models()

    try:
        import uvicorn

        uvicorn.run("app.main:app", host="0.0.0.0", port=port, log_level="info")
    except Exception:
        print("[dentalfacil] uvicorn failed to start:", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
