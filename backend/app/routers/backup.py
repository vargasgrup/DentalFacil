"""Backup & restore API (ADMIN). Bootstrap restore allowed when user_count=0."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.rate_limit import enforce_rate_limit
from app.core.roles import Rol
from app.database import get_db
from app.models import User
from app.services import backup_service as svc
from fastapi import Request

router = APIRouter(prefix="/api/backup", tags=["backup"])


def _coerce_utc(value: datetime | None) -> datetime | None:
    """Naive DB timestamps are UTC — tag them so JSON includes Z and UI stays correct."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class BackupSettingsOut(BaseModel):
    auto_backup_enabled: bool
    frequency: str
    preferred_hour: str
    retention_count: int
    keep_manual: bool
    backup_directory: str = ""
    effective_backup_directory: str = ""
    last_backup_at: datetime | None = None

    @field_validator("last_backup_at", mode="before")
    @classmethod
    def _utc_last(cls, v: object) -> object:
        if isinstance(v, datetime):
            return _coerce_utc(v)
        return v


class BackupSettingsUpdate(BaseModel):
    auto_backup_enabled: bool | None = None
    frequency: str | None = None
    preferred_hour: str | None = None
    retention_count: int | None = Field(default=None, ge=1, le=100)
    # Empty string clears custom path (use default / env)
    backup_directory: str | None = Field(default=None, max_length=500)


class BackupHistoryOut(BaseModel):
    id: str
    filename: str
    triggered_by: str
    status: str
    error_message: str | None = None
    size_bytes: int | None = None
    duration_ms: int | None = None
    keep: bool
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator("created_at", mode="before")
    @classmethod
    def _utc_created(cls, v: object) -> object:
        if isinstance(v, datetime):
            return _coerce_utc(v)
        return v


@router.get("/settings", response_model=BackupSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    _ = admin
    try:
        row = svc.get_or_create_backup_settings(db)
        return BackupSettingsOut(**svc.settings_public_dict(row, db))
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        # Last-resort heal for clinics that stamped Alembic head without backup_directory
        from app.logging_config import get_logger

        get_logger("backup_router").warning("GET /settings failed (%s); healing", exc)
        svc.ensure_backup_ready()
        db.rollback()
        try:
            row = svc.get_or_create_backup_settings(db)
            return BackupSettingsOut(**svc.settings_public_dict(row, db))
        except Exception as retry_exc:  # noqa: BLE001
            raise HTTPException(
                status_code=500,
                detail=(
                    "No se pudo cargar la configuración de respaldo. "
                    f"Reinicie N&K Dental Soft. ({retry_exc})"
                ),
            ) from retry_exc


@router.patch("/settings", response_model=BackupSettingsOut)
def patch_settings(
    payload: BackupSettingsUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    _ = admin
    row = svc.get_or_create_backup_settings(db)
    data = payload.model_dump(exclude_unset=True)
    if "frequency" in data and data["frequency"] not in ("daily", "every_12h", "weekly"):
        raise HTTPException(status_code=400, detail="Frecuencia inválida")
    if "backup_directory" in data:
        raw = data["backup_directory"]
        if raw is None:
            pass
        elif not str(raw).strip():
            data["backup_directory"] = None
        else:
            # Validate writability before persisting
            resolved = svc.validate_backup_directory(str(raw), create=True)
            data["backup_directory"] = str(resolved)
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return BackupSettingsOut(**svc.settings_public_dict(row, db))


class ChooseDirectoryOut(BaseModel):
    cancelled: bool = False
    path: str | None = None
    settings: BackupSettingsOut | None = None


@router.post("/choose-directory", response_model=ChooseDirectoryOut)
def choose_directory(
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    """
    Desktop: opens the Windows folder dialog without holding a DB connection,
    then validates writability and saves the path in a fresh session.
    """
    _ = admin
    result = svc.choose_and_persist_backup_directory()
    if result.get("cancelled"):
        return ChooseDirectoryOut(cancelled=True)
    settings_dict = result.get("settings") or {}
    return ChooseDirectoryOut(
        cancelled=False,
        path=result.get("path"),
        settings=BackupSettingsOut(**settings_dict) if settings_dict else None,
    )


class SuggestedDirectoryOut(BaseModel):
    label: str
    path: str


@router.get("/suggested-directories", response_model=list[SuggestedDirectoryOut])
def suggested_directories(
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    """Writable one-click backup folders for desktop when the native dialog fails."""
    _ = admin
    return [SuggestedDirectoryOut(**row) for row in svc.list_suggested_backup_directories()]


@router.post("/apply-directory", response_model=BackupSettingsOut)
def apply_directory(
    payload: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    """Save a suggested or typed path without opening the native dialog."""
    _ = admin
    raw = str((payload or {}).get("path") or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Indique una carpeta de backup")
    resolved = svc.validate_backup_directory(raw, create=True)
    row = svc.get_or_create_backup_settings(db)
    row.backup_directory = str(resolved)
    db.commit()
    db.refresh(row)
    return BackupSettingsOut(**svc.settings_public_dict(row, db))


@router.post("/generate", response_model=BackupHistoryOut)
def generate_backup(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    row = svc.create_backup(db, triggered_by="manual", user_id=admin.id, keep=True)
    return BackupHistoryOut.model_validate(row)


@router.get("/history", response_model=list[BackupHistoryOut])
def history(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    _ = admin
    return [BackupHistoryOut.model_validate(r) for r in svc.list_history(db)]


@router.get("/{backup_id}/download")
def download(
    backup_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    _ = admin
    row = svc.get_history(db, backup_id)
    from pathlib import Path

    path = Path(row.abs_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo de backup no encontrado en disco")
    return FileResponse(path, filename=row.filename, media_type="application/zip")


@router.delete("/{backup_id}", status_code=204)
def delete_backup(
    backup_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    svc.delete_backup(db, backup_id, user_id=admin.id)


@router.post("/validate")
async def validate_backup(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    _ = db
    _ = admin
    data = await file.read()
    result = svc.validate_backup_bytes(data)
    return {
        "ok": result.ok,
        "manifest": result.manifest,
        "warnings": result.warnings,
        "errors": result.errors,
    }


@router.post("/restore")
async def restore_backup(
    request: Request,
    file: UploadFile = File(...),
    confirm_token: str = Form(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(Rol.ADMIN)),
):
    _ = request
    data = await file.read()
    # Pass session for prechecks/safety backup; service closes it before Windows file swap
    return svc.restore_backup(
        db,
        data,
        confirm_token=confirm_token,
        user_id=admin.id,
    )


@router.post("/restore-bootstrap")
async def restore_bootstrap(
    request: Request,
    file: UploadFile = File(...),
    confirm_token: str = Form(...),
    db: Session = Depends(get_db),
):
    """Allowed only on empty installs (wizard) — no ADMIN yet."""
    enforce_rate_limit(request, limit_per_minute=3, scope="backup-restore-bootstrap")
    count = int(db.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0)
    if count > 0:
        raise HTTPException(
            status_code=403,
            detail="La instalación ya tiene usuarios. Use Restaurar desde Configuración (ADMIN).",
        )
    data = await file.read()
    return svc.restore_backup(
        db,
        data,
        confirm_token=confirm_token,
        user_id=None,
        allow_empty_bootstrap=True,
    )
