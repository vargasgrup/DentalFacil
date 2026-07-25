"""Upload / scan / list / preview historical physical clinical documents."""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import Patient, User
from app.models.historical_documents import HistoricalDocument
from app.services.audit import log_audit
from app.services.patient_access import get_active_patient_or_404

router = APIRouter(prefix="/api/historical-documents", tags=["historical-documents"])

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = Path(
    os.environ.get(
        "HISTORICAL_DOCUMENTS_ROOT",
        str(_BACKEND_ROOT / "data" / "historical_documents"),
    )
)

TIPOS = {
    "ficha_clinica": "Ficha clínica física",
    "odontograma": "Odontograma dibujado",
    "evolucion": "Evolución / seguimiento",
    "radiografia": "Radiografía impresa",
    "consentimiento": "Consentimiento firmado",
    "presupuesto": "Presupuesto / plan",
    "otro": "Otro documento",
}

SOURCES = {"upload", "scan"}

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
}
PDF_EXTS = {".pdf"}
MAX_BYTES = 25 * 1024 * 1024  # 25 MB


class HistoricalDocumentOut(BaseModel):
    id: str
    patient_id: str
    tipo: str
    tipo_label: str
    titulo: str
    filename: str
    content_type: str
    size_bytes: int
    source: str
    document_date: date | None
    notas: str | None
    uploaded_by: str | None
    created_at: datetime
    url: str

    model_config = {"from_attributes": True}


class TipoOption(BaseModel):
    id: str
    label: str


class MetaOut(BaseModel):
    tipos: list[TipoOption] = Field(default_factory=list)
    max_bytes: int = MAX_BYTES
    accept: str = "image/*,application/pdf"


def _to_out(row: HistoricalDocument) -> HistoricalDocumentOut:
    return HistoricalDocumentOut(
        id=row.id,
        patient_id=row.patient_id,
        tipo=row.tipo,
        tipo_label=TIPOS.get(row.tipo, row.tipo),
        titulo=(row.titulo or "").strip() or TIPOS.get(row.tipo, "Documento"),
        filename=row.filename,
        content_type=row.content_type,
        size_bytes=row.size_bytes or 0,
        source=row.source or "upload",
        document_date=row.document_date,
        notas=row.notas,
        uploaded_by=row.uploaded_by,
        created_at=row.created_at,
        url=f"/api/historical-documents/file/{row.id}",
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
    size = 0
    with dest.open("wb") as out:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    400,
                    f"El archivo supera el límite de {MAX_BYTES // (1024 * 1024)} MB",
                )
            out.write(chunk)
    return size


def _resolve_stored_path(stored_path: str) -> Path | None:
    path = Path(stored_path)
    if path.is_file():
        return path
    name = path.name
    if name:
        matches = list(UPLOAD_ROOT.rglob(name))
        if len(matches) == 1 and matches[0].is_file():
            return matches[0]
    return None


def _safe_download_name(filename: str | None, content_type: str | None) -> str:
    raw = (filename or "documento").strip() or "documento"
    safe = "".join(ch if ord(ch) < 128 and ch not in '"\\' else "_" for ch in raw)
    if not Path(safe).suffix:
        if content_type == "application/pdf":
            safe = f"{safe}.pdf"
        elif content_type and content_type.startswith("image/"):
            ext = content_type.split("/", 1)[-1].split(";")[0].strip() or "img"
            if ext == "jpeg":
                ext = "jpg"
            safe = f"{safe}.{ext}"
    return safe or "documento.bin"


def _parse_document_date(raw: str | None) -> date | None:
    if not raw or not str(raw).strip():
        return None
    try:
        return date.fromisoformat(str(raw).strip()[:10])
    except ValueError as exc:
        raise HTTPException(400, "Fecha del documento inválida (use AAAA-MM-DD)") from exc


@router.get("/meta", response_model=MetaOut)
def meta(_: User = Depends(get_current_user)):
    return MetaOut(
        tipos=[TipoOption(id=k, label=v) for k, v in TIPOS.items()],
        max_bytes=MAX_BYTES,
    )


@router.get("/file/{file_id}")
def get_file(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(HistoricalDocument, file_id)
    if not row:
        raise HTTPException(404, "Documento no encontrado")
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


@router.get("/{patient_id}", response_model=list[HistoricalDocumentOut])
def list_documents(
    patient_id: str,
    tipo: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.get(Patient, patient_id):
        raise HTTPException(404, "Paciente no encontrado")
    q = db.query(HistoricalDocument).filter(HistoricalDocument.patient_id == patient_id)
    if tipo:
        if tipo not in TIPOS:
            raise HTTPException(400, "Tipo de documento inválido")
        q = q.filter(HistoricalDocument.tipo == tipo)
    return [
        _to_out(m)
        for m in q.order_by(HistoricalDocument.created_at.desc()).all()
    ]


@router.post("/{patient_id}", response_model=HistoricalDocumentOut, status_code=201)
async def upload_document(
    patient_id: str,
    tipo: str = Form(...),
    source: str = Form("upload"),
    titulo: str | None = Form(None),
    notas: str | None = Form(None),
    document_date: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_active_patient_or_404(db, patient_id)
    if tipo not in TIPOS:
        raise HTTPException(400, "Tipo de documento inválido")
    src = (source or "upload").strip().lower()
    if src not in SOURCES:
        raise HTTPException(400, "Origen inválido (upload | scan)")
    if not _is_allowed_file(file.filename, file.content_type):
        raise HTTPException(400, "Solo se permiten imágenes o archivos PDF")

    parsed_date = _parse_document_date(document_date)
    title = (titulo or "").strip()[:200]
    note = (notas or "").strip() or None

    dest_dir = UPLOAD_ROOT / str(patient_id) / tipo
    dest_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "documento.bin").suffix.lower()
    if not ext:
        if (file.content_type or "").endswith("pdf"):
            ext = ".pdf"
        elif (file.content_type or "").startswith("image/"):
            mime_ext = (file.content_type or "").split("/", 1)[-1]
            ext = ".jpg" if mime_ext == "jpeg" else f".{mime_ext or 'bin'}"
        else:
            ext = ".bin"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = dest_dir / stored_name

    try:
        size = await _stream_to_disk(file, dest)
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(500, f"No se pudo guardar el archivo: {exc}") from exc

    if size <= 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "El archivo está vacío")

    row = HistoricalDocument(
        patient_id=patient_id,
        tipo=tipo,
        titulo=title,
        filename=file.filename or stored_name,
        stored_path=str(dest),
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size,
        source=src,
        document_date=parsed_date,
        notas=note,
        uploaded_by=user.id,
    )
    db.add(row)
    log_audit(
        db,
        patient_id=patient_id,
        entity_type="historical_document",
        entity_id=tipo,
        action="upload",
        user_id=user.id,
        detail={
            "source": src,
            "filename": row.filename,
            "size_bytes": size,
            "titulo": title or None,
        },
    )
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/file/{file_id}", status_code=204)
def delete_document(
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(HistoricalDocument, file_id)
    if not row:
        raise HTTPException(404, "Documento no encontrado")
    path = Path(row.stored_path)
    if path.exists():
        path.unlink(missing_ok=True)
    log_audit(
        db,
        patient_id=row.patient_id,
        entity_type="historical_document",
        entity_id=str(file_id),
        action="delete",
        user_id=user.id,
    )
    db.delete(row)
    db.commit()
