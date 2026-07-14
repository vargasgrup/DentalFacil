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
from app.routers.appointments import router as appointments_router, config_router, generate_reminders_job
from app.routers.cash import router as cash_router
from app.routers.documents import router as documents_router
from app.routers.reports import router as reports_router
from app.routers.audit import router as audit_router


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
    url_ok = settings.DATABASE_URL.startswith("postgresql+psycopg://") and "@127.0.0.1:1/" not in settings.DATABASE_URL
    ready = url_ok and db_connected and mig["ok"] and tables_ok
    return {
        "status": "ok" if ready else "degraded",
        "app": settings.APP_NAME,
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
app.include_router(audit_router)
app.include_router(appointments_router)
app.include_router(config_router)
app.include_router(cash_router)
app.include_router(documents_router)
app.include_router(reports_router)
