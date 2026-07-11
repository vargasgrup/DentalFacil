from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
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
    """Run Alembic in a daemon thread so HTTP can bind immediately (Railway healthcheck)."""
    try:
        from alembic import command
        from alembic.config import Config

        print("[dentalfacil] running migrations...", flush=True)
        command.upgrade(Config("alembic.ini"), "head")
        print("[dentalfacil] migrations ok", flush=True)
    except Exception as exc:  # noqa: BLE001 — boot must not die on migrate errors
        print(f"[dentalfacil] WARNING: migrations failed: {exc}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.clinic_profile import ensure_uploads_dir

    print("[dentalfacil] lifespan start", flush=True)
    ensure_uploads_dir()
    threading.Thread(target=_run_migrations, daemon=True, name="alembic").start()

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
    db_ok = settings.DATABASE_URL.startswith("postgresql+psycopg://") and "@127.0.0.1:1/" not in settings.DATABASE_URL
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "database_url_configured": db_ok,
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
