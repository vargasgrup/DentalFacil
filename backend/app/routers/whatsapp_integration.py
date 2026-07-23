"""Integración WhatsApp Cloud API — endpoints usados por DocumentSender (frontend).

POST /api/integrations/whatsapp/share
POST /api/integrations/whatsapp/send-document  (reintento)
GET  /api/integrations/whatsapp/status
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.services.whatsapp_cloud import MAX_DOCUMENT_BYTES, whatsapp_cloud_service

logger = logging.getLogger("dentalfacil.whatsapp.router")

router = APIRouter(prefix="/api/integrations/whatsapp", tags=["whatsapp-integration"])

_MAX_RETRIES = 3


class WhatsAppStatusOut(BaseModel):
    configured: bool
    enabled: bool
    api_version: str
    max_file_bytes: int = MAX_DOCUMENT_BYTES
    max_retries: int = _MAX_RETRIES


class WhatsAppShareOut(BaseModel):
    success: bool
    strategy: str = "cloud_api"
    message_id: str | None = None
    media_id: str | None = None
    error: str | None = None
    error_code: str | None = None
    attempt: int = 1


class WhatsAppMetricsNote(BaseModel):
    """Cliente puede reportar métricas de fallback (opcional, auditoría ligera)."""

    strategy: str
    success: bool
    document_type: str | None = None
    duration_ms: int | None = None
    error_code: str | None = None


@router.get("/status", response_model=WhatsAppStatusOut)
def whatsapp_status(
    user: User = Depends(get_current_user),
):
    configured = whatsapp_cloud_service.configured
    return WhatsAppStatusOut(
        configured=configured,
        enabled=configured,
        api_version=whatsapp_cloud_service.api_version,
    )


async def _read_pdf_upload(file: UploadFile) -> bytes:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")
    content_type = (file.content_type or "").lower()
    name = (file.filename or "").lower()
    if "pdf" not in content_type and not name.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se aceptan PDF")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="PDF vacío")
    if len(data) > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"El PDF supera el límite de {MAX_DOCUMENT_BYTES // (1024 * 1024)} MB",
        )
    return data


@router.post("/share", response_model=WhatsAppShareOut)
async def share_document(
    file: UploadFile = File(...),
    phone_number: str = Form(...),
    message: str = Form(""),
    file_name: str = Form("documento.pdf"),
    document_type: str = Form("documento"),
    attempt: int = Form(1),
    metadata_json: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Envía PDF vía Cloud API (RAM). attempt se usa para logging de reintentos."""
    _ = db  # reserved for future audit row
    if attempt < 1 or attempt > _MAX_RETRIES + 1:
        raise HTTPException(status_code=400, detail="attempt fuera de rango")

    if not whatsapp_cloud_service.configured:
        return WhatsAppShareOut(
            success=False,
            error="WhatsApp Cloud API no configurada en el servidor",
            error_code="CLOUD_API_NOT_CONFIGURED",
            attempt=attempt,
        )

    pdf_bytes = await _read_pdf_upload(file)
    meta: dict[str, Any] = {
        "document_type": document_type,
        "user_id": user.id,
        "attempt": attempt,
    }
    if metadata_json.strip():
        import json

        try:
            extra = json.loads(metadata_json)
            if isinstance(extra, dict):
                meta.update(extra)
        except json.JSONDecodeError:
            pass

    result = await whatsapp_cloud_service.send_document(
        pdf_bytes=pdf_bytes,
        file_name=file_name or file.filename or "documento.pdf",
        phone=phone_number,
        message=message or None,
        metadata=meta,
    )
    logger.info(
        "share attempt=%s type=%s ok=%s code=%s user=%s",
        attempt,
        document_type,
        result.ok,
        result.error_code,
        user.id,
    )
    return WhatsAppShareOut(
        success=result.ok,
        message_id=result.message_id,
        media_id=result.media_id,
        error=result.error,
        error_code=result.error_code,
        attempt=attempt,
    )


@router.post("/send-document", response_model=WhatsAppShareOut)
async def send_document_retry(
    file: UploadFile = File(...),
    phone_number: str = Form(...),
    message: str = Form(""),
    file_name: str = Form("documento.pdf"),
    document_type: str = Form("documento"),
    attempt: int = Form(2),
    metadata_json: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reintento explícito (máx. 3) — mismo pipeline Cloud API."""
    if attempt > _MAX_RETRIES:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Máximo {_MAX_RETRIES} reintentos Cloud API",
        )
    return await share_document(
        file=file,
        phone_number=phone_number,
        message=message,
        file_name=file_name,
        document_type=document_type,
        attempt=attempt,
        metadata_json=metadata_json,
        db=db,
        user=user,
    )


@router.post("/metrics", status_code=status.HTTP_204_NO_CONTENT)
def report_client_metrics(
    payload: WhatsAppMetricsNote,
    user: User = Depends(get_current_user),
):
    """Logging estructurado de fallbacks del cliente (Web Share / descarga)."""
    logger.info(
        "client_metric strategy=%s success=%s type=%s duration_ms=%s error=%s user=%s",
        payload.strategy,
        payload.success,
        payload.document_type,
        payload.duration_ms,
        payload.error_code,
        user.id,
    )
    return None
