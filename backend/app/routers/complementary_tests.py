"""Upload / list / preview complementary clinical tests (Rx, photos, lab)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Patient, User
from app.models.complementary_tests import ComplementaryTestFile
from app.paths import resolve_media_root
from app.services.audit import log_audit
from app.services.patient_access import get_active_patient_or_404

router = APIRouter(prefix="/api/complementary-tests", tags=["complementary-tests"])
logger = logging.getLogger(__name__)

CATEGORIAS = {
    "radiografia": {
        "ortopantomografia",
        "periapical",
        "oclusal",
        "aleta_mordida",
        "telerradiografia",
        "otro",
    },
    "fotografia_clinica": {"intraoral", "extraoral", "otro"},
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


def _upload_root() -> Path:
    """Writable root; re-resolved per request so desktop env is honored."""
    return resolve_media_root("COMPLEMENTARY_TESTS_ROOT", "complementary_tests")


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


class CategorySummary(BaseModel):
    categoria: str
    total: int
    by_subtipo: dict[str, int] = Field(default_factory=dict)


class ComplementaryListOut(BaseModel):
    """List payload with totals so the UI can organize multiple tests per subtype."""

    items: list[ComplementaryOut]
    totals: list[CategorySummary]


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
    root = _upload_root()
    if name:
        matches = list(root.rglob(name))
        if len(matches) == 1 and matches[0].is_file():
            return matches[0]
    return None


def _safe_download_name(filename: str | None, content_type: str | None) -> str:
    raw = (filename or "archivo").strip() or "archivo"
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


def _summarize(rows: list[ComplementaryTestFile]) -> list[CategorySummary]:
    buckets: dict[str, dict[str, int]] = {c: {} for c in CATEGORIAS}
    for row in rows:
        if row.categoria not in buckets:
            buckets[row.categoria] = {}
        sub = row.subtipo or "otro"
        buckets[row.categoria][sub] = buckets[row.categoria].get(sub, 0) + 1
    return [
        CategorySummary(
            categoria=cat,
            total=sum(by.values()),
            by_subtipo=by,
        )
        for cat, by in buckets.items()
    ]


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
        headers={
            "Cache-Control": "private, max-age=120",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{patient_id}/organized", response_model=ComplementaryListOut)
def list_files_organized(
    patient_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Items + counts per categoría/subtipo (several panorámicas, etc.)."""
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    try:
        rows = (
            db.query(ComplementaryTestFile)
            .filter(ComplementaryTestFile.patient_id == patient_id)
            .order_by(
                ComplementaryTestFile.categoria.asc(),
                ComplementaryTestFile.subtipo.asc(),
                ComplementaryTestFile.created_at.desc(),
            )
            .all()
        )
        return ComplementaryListOut(
            items=[_to_out(m) for m in rows],
            totals=_summarize(rows),
        )
    except OperationalError as exc:
        logger.exception("complementary_tests organized OperationalError")
        raise HTTPException(
            500,
            "No se pudo leer pruebas complementarias (tabla o base de datos).",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("complementary_tests organized failed")
        raise HTTPException(
            500, f"Error al listar pruebas complementarias: {exc}"
        ) from exc


@router.get("/{patient_id}", response_model=list[ComplementaryOut])
def list_files(
    patient_id: str,
    categoria: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Flat list (UI groups by subtype client-side)."""
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    try:
        q = db.query(ComplementaryTestFile).filter(
            ComplementaryTestFile.patient_id == patient_id
        )
        if categoria:
            if categoria not in CATEGORIAS:
                raise HTTPException(400, "Categoría inválida")
            q = q.filter(ComplementaryTestFile.categoria == categoria)
        rows = q.order_by(ComplementaryTestFile.created_at.desc()).all()
        return [_to_out(m) for m in rows]
    except HTTPException:
        raise
    except OperationalError as exc:
        logger.exception("complementary_tests list OperationalError patient=%s", patient_id)
        raise HTTPException(
            500,
            "No se pudo leer pruebas complementarias (tabla o base de datos). "
            "Reinicie el Server o restaure un respaldo.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("complementary_tests list failed patient=%s", patient_id)
        raise HTTPException(
            500, f"Error al listar pruebas complementarias: {exc}"
        ) from exc


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
    get_active_patient_or_404(db, patient_id)
    if categoria not in CATEGORIAS:
        raise HTTPException(400, "Categoría inválida")
    allowed_sub = CATEGORIAS[categoria]
    if subtipo not in allowed_sub:
        raise HTTPException(400, "Subtipo inválido para la categoría")
    if not _is_allowed_file(file.filename, file.content_type):
        raise HTTPException(400, "Solo se permiten imágenes o archivos PDF")

    root = _upload_root()
    dest_dir = root / str(patient_id) / categoria / subtipo
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.exception("complementary_tests mkdir failed root=%s", root)
        raise HTTPException(
            500,
            "No se pudo crear la carpeta de pruebas complementarias. "
            f"Verifique permisos en: {root}",
        ) from exc

    ext = Path(file.filename or "archivo.bin").suffix or (
        ".pdf" if (file.content_type or "").endswith("pdf") else ".bin"
    )
    stored_name = f"{uuid.uuid4().hex}{ext.lower()}"
    dest = dest_dir / stored_name

    try:
        size = await _stream_to_disk(file, dest)
    except OSError as exc:
        logger.exception("complementary_tests write failed dest=%s", dest)
        raise HTTPException(
            500,
            f"No se pudo guardar el archivo en disco ({root}). {exc}",
        ) from exc

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
        notas=(notas or "").strip() or None,
        uploaded_by=user.id,
    )
    try:
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
    except SQLAlchemyError as exc:
        db.rollback()
        dest.unlink(missing_ok=True)
        logger.exception("complementary_tests DB commit failed")
        raise HTTPException(
            500,
            "El archivo se escribió pero no se pudo registrar en la base de datos. "
            "Intente de nuevo.",
        ) from exc

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
    # Same write gate as upload: no mutations on discharged patients
    get_active_patient_or_404(db, row.patient_id)
    path = _resolve_stored_path(row.stored_path) or Path(row.stored_path)
    if path.is_file():
        path.unlink(missing_ok=True)
    try:
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
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("complementary_tests delete commit failed")
        raise HTTPException(500, "No se pudo eliminar el registro de la prueba.") from exc
