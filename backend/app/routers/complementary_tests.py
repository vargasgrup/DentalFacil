"""Upload / list / preview complementary clinical tests (Rx, photos, lab)."""

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
from app.models.complementary_tests import ComplementaryTestFile
from app.services.audit import log_audit

router = APIRouter(prefix="/api/complementary-tests", tags=["complementary-tests"])

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = Path(
    os.environ.get(
        "COMPLEMENTARY_TESTS_ROOT",
        str(_BACKEND_ROOT / "data" / "complementary_tests"),
    )
)

CATEGORIAS = {
    "radiografia": {
        "ortopantomografia",
        "periapical",
        "oclusal",
        "aleta_mordida",
        "telerradiografia",
    },
    "fotografia_clinica": {"intraoral", "extraoral"},
    "laboratorio": {"laboratorio", "biopsia", "otro"},
}

IMAGE_EXTS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
    ".svg",
}
PDF_EXTS = {".pdf"}


class ComplementaryOut(BaseModel):
    id: str
    patient_id: str
    categoria: str
    subtipo: str
    filename: str
    content_type: str
    size_bytes: int
    notas: str | None
    uploaded_by: str | None
    created_at: datetime
    url: str

    model_config = {"from_attributes": True}


def _to_out(row: ComplementaryTestFile) -> ComplementaryOut:
    return ComplementaryOut(
        id=row.id,
        patient_id=row.patient_id,
        categoria=row.categoria,
        subtipo=row.subtipo,
        filename=row.filename,
        content_type=row.content_type,
        size_bytes=row.size_bytes or 0,
        notas=row.notas,
        uploaded_by=row.uploaded_by,
        created_at=row.created_at,
        url=f"/api/complementary-tests/file/{row.id}",
    )


def _is_allowed_file(filename: str | None, content_type: str | None) -> bool:
    ext = Path(filename or "").suffix.lower()
    if ext in IMAGE_EXTS or ext in PDF_EXTS:
        return True
    if content_type and (
        content_type.startswith("image/") or content_type == "application/pdf"
    ):
        return True
    return False


async def _stream_to_disk(upload: UploadFile, dest: Path) -> int:
    """Write upload to disk in chunks; no artificial size cap (local desktop)."""
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            size += len(chunk)
    return size


def _resolve_stored_path(stored_path: str) -> Path | None:
    """Resolve absolute/relative stored paths; tolerate cwd changes between deploys."""
    path = Path(stored_path)
    if path.is_file():
        return path
    name = path.name
    # Fallback: search under current upload root by filename
    if name:
        matches = list(UPLOAD_ROOT.rglob(name))
        if len(matches) == 1 and matches[0].is_file():
            return matches[0]
    return None


def _safe_download_name(filename: str | None, content_type: str | None) -> str:
    raw = (filename or "archivo").strip() or "archivo"
    # Keep ASCII-ish name for Content-Disposition (proxy-safe)
    safe = "".join(ch if ord(ch) < 128 and ch not in '"\\' else "_" for ch in raw)
    if not Path(safe).suffix:
        if content_type == "application/pdf":
            safe = f"{safe}.pdf"
        elif content_type and content_type.startswith("image/"):
            ext = content_type.split("/", 1)[-1].split(";")[0].strip() or "img"
            if ext == "jpeg":
                ext = "jpg"
            safe = f"{safe}.{ext}"
    return safe or "archivo.bin"


@router.get("/file/{file_id}")
def get_file(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(ComplementaryTestFile, file_id)
    if not row:
        raise HTTPException(404, "Archivo no encontrado")
    path = _resolve_stored_path(row.stored_path)
    if not path:
        raise HTTPException(404, "Archivo no disponible en disco")
    media_type = row.content_type or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=_safe_download_name(row.filename, media_type),
        content_disposition_type="inline",
    )


@router.get("/{patient_id}", response_model=list[ComplementaryOut])
def list_files(
    patient_id: str,
    categoria: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    q = db.query(ComplementaryTestFile).filter(
        ComplementaryTestFile.patient_id == patient_id
    )
    if categoria:
        if categoria not in CATEGORIAS:
            raise HTTPException(400, "Categoría inválida")
        q = q.filter(ComplementaryTestFile.categoria == categoria)
    return [
        _to_out(m)
        for m in q.order_by(ComplementaryTestFile.created_at.desc()).all()
    ]


@router.post("/{patient_id}", response_model=ComplementaryOut, status_code=201)
async def upload_file(
    patient_id: str,
    categoria: str = Form(...),
    subtipo: str = Form(...),
    notas: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    if categoria not in CATEGORIAS:
        raise HTTPException(400, "Categoría inválida")
    allowed_sub = CATEGORIAS[categoria]
    if subtipo not in allowed_sub:
        raise HTTPException(400, "Subtipo inválido para la categoría")
    if not _is_allowed_file(file.filename, file.content_type):
        raise HTTPException(400, "Solo se permiten imágenes o archivos PDF")

    dest_dir = UPLOAD_ROOT / str(patient_id) / categoria
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "archivo.bin").suffix or (
        ".pdf" if (file.content_type or "").endswith("pdf") else ".bin"
    )
    stored_name = f"{uuid.uuid4().hex}{ext.lower()}"
    dest = dest_dir / stored_name

    try:
        size = await _stream_to_disk(file, dest)
    except OSError as exc:
        raise HTTPException(500, f"No se pudo guardar el archivo: {exc}") from exc

    if size <= 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "El archivo está vacío")

    row = ComplementaryTestFile(
        patient_id=patient_id,
        categoria=categoria,
        subtipo=subtipo,
        filename=file.filename or stored_name,
        stored_path=str(dest),
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size,
        notas=notas,
        uploaded_by=user.id,
    )
    db.add(row)
    log_audit(
        db,
        patient_id=patient_id,
        entity_type="complementary_test",
        entity_id=categoria,
        action="upload",
        user_id=user.id,
        detail={
            "subtipo": subtipo,
            "filename": row.filename,
            "size_bytes": size,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(ComplementaryTestFile, file_id)
    if not row:
        raise HTTPException(404, "Archivo no encontrado")
    path = Path(row.stored_path)
    if path.exists():
        path.unlink(missing_ok=True)
    log_audit(
        db,
        patient_id=row.patient_id,
        entity_type="complementary_test",
        entity_id=str(file_id),
        action="delete",
        user_id=user.id,
    )
    db.delete(row)
    db.commit()
