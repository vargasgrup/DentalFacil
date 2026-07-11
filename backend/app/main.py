from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import Base, engine
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.clinic_profile import ensure_uploads_dir

    ensure_uploads_dir()
    scheduler = BackgroundScheduler()
    scheduler.add_job(generate_reminders_job, "interval", minutes=5, id="reminders", next_run_time=datetime.now())
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}


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
