"""Railway/Docker boot — migrate DB, then bind HTTP."""
from __future__ import annotations

import os
import sys
import traceback


def _warn_railway_misconfig() -> None:
    """Log loud warnings when Railway is missing production wiring (do not crash soft clinics)."""
    railway = (os.environ.get("RAILWAY_ENVIRONMENT") or "").strip()
    if not railway:
        return
    app_env = (os.environ.get("APP_ENV") or "").strip().lower()
    db = (os.environ.get("DATABASE_URL") or "").strip()
    public = (os.environ.get("PUBLIC_APP_URL") or "").strip()
    cors = (os.environ.get("CORS_ORIGINS") or "").strip()

    print(
        f"[dentalfacil] Railway guard: RAILWAY_ENVIRONMENT={railway!r} APP_ENV={app_env!r}",
        flush=True,
    )

    if app_env not in ("production", "prod"):
        print(
            "[dentalfacil] RAILWAY WARNING: set APP_ENV=production on the Backend service "
            "(Variables). Health currently reports development defaults.",
            flush=True,
        )

    if not db:
        print(
            "[dentalfacil] RAILWAY WARNING: DATABASE_URL empty — falling back to local sqlite. "
            "With a Postgres service in the canvas, set "
            "DATABASE_URL=${{Postgres.DATABASE_URL}} on Backend.",
            flush=True,
        )
    elif db.lower().startswith("sqlite") and "/data/" not in db.replace("\\", "/"):
        print(
            "[dentalfacil] RAILWAY WARNING: SQLite path is not under /data — "
            "container disk is ephemeral; data can vanish on redeploy. "
            "Prefer Postgres (${{Postgres.DATABASE_URL}}) or sqlite:////data/clinica.db + Volume.",
            flush=True,
        )

    if not public or "localhost" in public.lower():
        print(
            "[dentalfacil] RAILWAY WARNING: PUBLIC_APP_URL missing or localhost. "
            "Set https://mdodontologia.up.railway.app (Frontend domain).",
            flush=True,
        )
    if not cors or "localhost" in cors.lower():
        print(
            "[dentalfacil] RAILWAY WARNING: CORS_ORIGINS should include the Frontend HTTPS URL.",
            flush=True,
        )


def main() -> None:
    port = int(os.environ.get("PORT") or "8000")
    print(f"[dentalfacil] boot.py starting on 0.0.0.0:{port}", flush=True)
    print(f"[dentalfacil] RAILWAY_ENVIRONMENT={os.environ.get('RAILWAY_ENVIRONMENT', '')}", flush=True)
    _warn_railway_misconfig()
    db = os.environ.get("DATABASE_URL", "")
    if db.lower().startswith("http"):
        print(
            "[dentalfacil] FATAL CONFIG: DATABASE_URL is an https:// URL. "
            "For Railway use postgresql from Postgres.DATABASE_URL or "
            "sqlite:////data/clinica.db (see docs/RAILWAY.md). "
            "Do not paste the public HTTPS site URL.",
            flush=True,
        )
        sys.exit(1)
    elif not db:
        print(
            "[dentalfacil] WARNING: DATABASE_URL empty — using Settings default "
            "(sqlite:///./data/clinica.db). On Railway set Postgres or sqlite:////data/clinica.db + Volume.",
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
        from app.ensure_clinical_schema import ensure_clinical_evolution_schema
        from app.schema_guard import assert_schema_compatible_with_uuid_models

        run_migrations_blocking()
        try:
            ensure_auth_schema()
            ensure_clinical_evolution_schema()
        except Exception as exc:  # noqa: BLE001
            print(f"[dentalfacil] ensure_* schema FAILED: {exc}", flush=True)
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
