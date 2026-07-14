"""Upload / list tooth-linked images (radiografías, fotos)."""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Patient, User
from app.models.periodontogram import ToothMedia
from app.services.audit import log_audit

router = APIRouter(prefix="/api/tooth-media", tags=["tooth-media"])

UPLOAD_ROOT = Path(os.environ.get("TOOTH_MEDIA_ROOT", "/app/uploads/tooth_media"))


class MediaOut(BaseModel):
    id: str
    patient_id: str
    pieza_fdi: str
    tipo: str
    filename: str
    content_type: str
    notas: str | None
    uploaded_by: str | None
    created_at: datetime
    url: str

    model_config = {"from_attributes": True}


def _to_out(m: ToothMedia) -> MediaOut:
    return MediaOut(
        id=m.id,
        patient_id=m.patient_id,
        pieza_fdi=m.pieza_fdi,
        tipo=m.tipo,
        filename=m.filename,
        content_type=m.content_type,
        notas=m.notas,
        uploaded_by=m.uploaded_by,
        created_at=m.created_at,
        url=f"/api/tooth-media/file/{m.id}",
    )


@router.get("/{patient_id}", response_model=list[MediaOut])
def list_media(
    patient_id: str,
    pieza_fdi: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    q = db.query(ToothMedia).filter(ToothMedia.patient_id == patient_id)
    if pieza_fdi:
        q = q.filter(ToothMedia.pieza_fdi == pieza_fdi)
    return [_to_out(m) for m in q.order_by(ToothMedia.created_at.desc()).all()]


@router.post("/{patient_id}", response_model=MediaOut, status_code=201)
async def upload_media(
    patient_id: str,
    pieza_fdi: str = Form(...),
    tipo: str = Form("foto"),
    notas: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Solo se permiten imágenes")

    dest_dir = UPLOAD_ROOT / str(patient_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "img.jpg").suffix or ".jpg"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = dest_dir / stored_name
    content = await file.read()
    if len(content) > 12 * 1024 * 1024:
        raise HTTPException(400, "Archivo demasiado grande (máx. 12 MB)")
    dest.write_bytes(content)

    row = ToothMedia(
        patient_id=patient_id,
        pieza_fdi=pieza_fdi,
        tipo=tipo if tipo in ("foto", "radiografia", "panoramica") else "foto",
        filename=file.filename or stored_name,
        stored_path=str(dest),
        content_type=file.content_type or "image/jpeg",
        notas=notas,
        uploaded_by=user.id,
    )
    db.add(row)
    log_audit(
        db,
        patient_id=patient_id,
        entity_type="media",
        entity_id=pieza_fdi,
        action="upload",
        user_id=user.id,
        detail={"tipo": row.tipo, "filename": row.filename},
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/file/{media_id}")
def get_file(
    media_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(ToothMedia, media_id)
    if not row:
        raise HTTPException(404, "Archivo no encontrado")
    path = Path(row.stored_path)
    if not path.exists():
        raise HTTPException(404, "Archivo no disponible en disco")
    return FileResponse(path, media_type=row.content_type, filename=row.filename)


@router.delete("/{media_id}", status_code=204)
def delete_media(
    media_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(ToothMedia, media_id)
    if not row:
        raise HTTPException(404, "Archivo no encontrado")
    path = Path(row.stored_path)
    if path.exists():
        path.unlink(missing_ok=True)
    log_audit(
        db,
        patient_id=row.patient_id,
        entity_type="media",
        entity_id=str(media_id),
        action="delete",
        user_id=user.id,
    )
    db.delete(row)
    db.commit()
