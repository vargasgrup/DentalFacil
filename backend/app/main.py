from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.migrate import migrations_status, run_migrations_blocking
from app.routers.auth import router as auth_router, users_router
from app.routers.patients import router as patients_router
from app.routers.clinical import router as clinical_router
from app.routers.odontogram import router as odontogram_router
from app.routers.periodontogram import router as periodontogram_router
from app.routers.tooth_media import router as tooth_media_router
from app.routers.complementary_tests import router as complementary_tests_router
from app.routers.appointments import router as appointments_router, config_router, generate_reminders_job
from app.routers.cash import router as cash_router
from app.routers.documents import router as documents_router
from app.routers.reports import router as reports_router
from app.routers.audit import router as audit_router
from app.routers.whatsapp_integration import router as whatsapp_integration_router


def _run_migrations() -> None:
    """Fallback when not started via boot.py (e.g. local start.sh)."""
    if not migrations_status()["ok"]:
        run_migrations_blocking()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.clinic_profile import ensure_uploads_dir
    from app.ensure_auth_schema import ensure_auth_schema

    print("[dentalfacil] lifespan start", flush=True)
    ensure_uploads_dir()
    _run_migrations()
    # Guarantees JWT revocation columns even if Alembic stamped head without applying them.
    try:
        ensure_auth_schema()
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ensure_auth_schema FAILED: {exc}", flush=True)
        raise
    try:
        from app.ensure_clinical_schema import ensure_clinical_evolution_schema

        ensure_clinical_evolution_schema()
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ensure_clinical_schema FAILED: {exc}", flush=True)
        raise
    try:
        from app.ensure_complementary_tests_schema import ensure_complementary_tests_schema

        ensure_complementary_tests_schema()
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ensure_complementary_tests_schema FAILED: {exc}", flush=True)
        raise
    try:
        from app.ensure_alta_retroactiva_schema import ensure_alta_retroactiva_schema

        ensure_alta_retroactiva_schema()
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ensure_alta_retroactiva_schema FAILED: {exc}", flush=True)
        raise
    try:
        from app.ensure_odontogram_unique import ensure_odontogram_unique_indexes

        ensure_odontogram_unique_indexes()
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ensure_odontogram_unique FAILED: {exc}", flush=True)
        raise

    scheduler = BackgroundScheduler()
    # Delay first run so boot/healthcheck are not competing with DB work
    scheduler.add_job(
        generate_reminders_job,
        "interval",
        minutes=5,
        id="reminders",
        next_run_time=datetime.now() + timedelta(minutes=1),
    )
    scheduler.start()
    print("[dentalfacil] lifespan ready", flush=True)
    yield
    scheduler.shutdown()


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    from app.db_health import ping_database, schema_ready

    mig = migrations_status()
    db_connected = ping_database()
    tables_ok, tables_err = schema_ready() if db_connected else (False, None)
    url = settings.DATABASE_URL or ""
    url_ok = (
        (
            url.startswith("postgresql+psycopg://")
            or url.startswith("postgresql://")
            or url.startswith("sqlite:")
        )
        and "@127.0.0.1:1/" not in url
    )
    engine_kind = "sqlite" if settings.is_sqlite else "postgres"
    user_count = None
    if db_connected and tables_ok:
        try:
            from sqlalchemy import text

            from app.database import engine

            with engine.connect() as conn:
                user_count = int(conn.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0)
        except Exception:  # noqa: BLE001
            user_count = None
    ready = url_ok and db_connected and mig["ok"] and tables_ok
    return {
        "status": "ok" if ready else "degraded",
        "app": settings.APP_NAME,
        "engine": engine_kind,
        "user_count": user_count,
        "database_url_configured": url_ok,
        "database_connected": db_connected,
        "migrations_ok": mig["ok"],
        "migrations_error": mig["error"],
        "schema_ready": tables_ok,
        "schema_error": tables_err,
    }


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(patients_router)
app.include_router(clinical_router)
app.include_router(odontogram_router)
app.include_router(periodontogram_router)
app.include_router(tooth_media_router)
app.include_router(complementary_tests_router)
app.include_router(audit_router)
app.include_router(appointments_router)
app.include_router(config_router)
app.include_router(cash_router)
app.include_router(documents_router)
app.include_router(reports_router)
app.include_router(whatsapp_integration_router)
