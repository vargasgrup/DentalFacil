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
            "Replace it with Variable Reference → Postgres → DATABASE_URL "
            "(postgresql://user:pass@host:5432/db).",
            flush=True,
        )
    elif not db:
        print("[dentalfacil] WARNING: DATABASE_URL is empty", flush=True)
    else:
        safe = db.split("@")[-1] if "@" in db else "(set)"
        print(f"[dentalfacil] DATABASE_URL host/db = {safe}", flush=True)
        from app.migrate import run_migrations_blocking

        run_migrations_blocking()

    try:
        import uvicorn

        uvicorn.run("app.main:app", host="0.0.0.0", port=port, log_level="info")
    except Exception:
        print("[dentalfacil] uvicorn failed to start:", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
