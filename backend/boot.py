"""Railway/Docker boot — migrate DB, then bind HTTP."""
from __future__ import annotations

import os
import sys
import traceback


def _warn_railway_misconfig() -> None:
    """Log loud warnings when Railway is missing production wiring."""
    railway = (os.environ.get("RAILWAY_ENVIRONMENT") or "").strip()
    if not railway:
        return
    app_env = (os.environ.get("APP_ENV") or "").strip().lower()
    db = (os.environ.get("DATABASE_URL") or "").strip()
    public = (os.environ.get("PUBLIC_APP_URL") or "").strip()
    cors = (os.environ.get("CORS_ORIGINS") or "").strip()
    jwt = (os.environ.get("JWT_SECRET") or "").strip()
    maint = (os.environ.get("MAINTENANCE_ACCESS_KEY") or "").strip()

    print(
        f"[dentalfacil] Railway guard: RAILWAY_ENVIRONMENT={railway!r} APP_ENV={app_env!r}",
        flush=True,
    )

    if app_env in ("production", "prod"):
        missing = []
        if len(jwt) < 32:
            missing.append("JWT_SECRET (>=32 chars, openssl rand -hex 32)")
        if len(maint) < 16 or maint == "Solo,yo1532":
            missing.append("MAINTENANCE_ACCESS_KEY (>=16 chars, not Solo,yo1532)")
        if missing:
            print(
                "[dentalfacil] FATAL: APP_ENV=production requires: "
                + "; ".join(missing)
                + ". Healthcheck will fail until these Variables exist.",
                flush=True,
            )
        if db.lower().startswith("postgres"):
            print(
                "[dentalfacil] RAILWAY WARNING: DATABASE_URL points at Postgres. "
                "If users.id is INTEGER this image will exit (UUID schema). "
                "Prefer sqlite:////data/clinica.db + Volume, or see docs/RAILWAY.md.",
                flush=True,
            )
    elif app_env not in ("production", "prod"):
        print(
            "[dentalfacil] RAILWAY WARNING: APP_ENV is not production "
            "(current defaults look like development).",
            flush=True,
        )

    if not db:
        print(
            "[dentalfacil] RAILWAY WARNING: DATABASE_URL empty — Settings default sqlite. "
            "For durable data set sqlite:////data/clinica.db + Volume on /data.",
            flush=True,
        )
    elif db.lower().startswith("sqlite") and "/data/" not in db.replace("\\", "/"):
        print(
            "[dentalfacil] RAILWAY WARNING: SQLite path is not under /data "
            "(ephemeral disk on redeploy).",
            flush=True,
        )

    if not public or "localhost" in public.lower():
        print(
            "[dentalfacil] RAILWAY WARNING: set PUBLIC_APP_URL="
            "https://mdodontologia.up.railway.app",
            flush=True,
        )
    if not cors or "localhost" in cors.lower():
        print(
            "[dentalfacil] RAILWAY WARNING: set CORS_ORIGINS to the Frontend HTTPS URL.",
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
            "Use postgresql:// from Postgres or sqlite:////data/clinica.db "
            "(see docs/RAILWAY.md). Do not paste the public site URL.",
            flush=True,
        )
        sys.exit(1)
    elif not db:
        print(
            "[dentalfacil] WARNING: DATABASE_URL empty — using Settings default "
            "(sqlite:///./data/clinica.db).",
            flush=True,
        )
    else:
        if db.strip().lower().startswith("sqlite"):
            print(f"[dentalfacil] DATABASE_URL = sqlite ({db})", flush=True)
        else:
            safe = db.split("@")[-1] if "@" in db else "(set)"
            print(f"[dentalfacil] DATABASE_URL host/db = {safe}", flush=True)

        try:
            from app.migrate import run_migrations_blocking
            from app.ensure_auth_schema import ensure_auth_schema
            from app.ensure_clinical_schema import ensure_clinical_evolution_schema
            from app.schema_guard import assert_schema_compatible_with_uuid_models

            run_migrations_blocking()
            ensure_auth_schema()
            ensure_clinical_evolution_schema()
            assert_schema_compatible_with_uuid_models()
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001
            print(f"[dentalfacil] DB/schema boot FAILED: {exc}", flush=True)
            traceback.print_exc()
            sys.exit(1)

    try:
        import uvicorn

        print(f"[dentalfacil] starting uvicorn on 0.0.0.0:{port}", flush=True)
        uvicorn.run("app.main:app", host="0.0.0.0", port=port, log_level="info")
    except Exception:
        print("[dentalfacil] uvicorn failed to start:", flush=True)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
