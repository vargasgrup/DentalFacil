"""WhatsApp Cloud API (Meta Graph) — envío de documentos desde el backend.

Los PDF se procesan en memoria (bytes); no se persisten en disco.
Si WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID no están configurados,
el servicio reporta enabled=False y el frontend usa Web Share / descarga.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger("dentalfacil.whatsapp")

MAX_DOCUMENT_BYTES = 25 * 1024 * 1024  # límite práctico Cloud API / UX


@dataclass
class WhatsAppSendResult:
    ok: bool
    message_id: str | None = None
    media_id: str | None = None
    error: str | None = None
    error_code: str | None = None
    raw: dict[str, Any] | None = None


class WhatsAppCloudService:
    def __init__(self) -> None:
        self.api_version = (settings.WHATSAPP_API_VERSION or "v17.0").strip()
        self.phone_number_id = (settings.WHATSAPP_PHONE_NUMBER_ID or "").strip()
        self.access_token = (settings.WHATSAPP_ACCESS_TOKEN or "").strip()
        self.timeout = float(settings.WHATSAPP_REQUEST_TIMEOUT_SECONDS or 30)

    @property
    def configured(self) -> bool:
        return bool(self.phone_number_id and self.access_token)

    def _base_url(self) -> str:
        return f"https://graph.facebook.com/{self.api_version}/{self.phone_number_id}"

    def _headers_json(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def normalize_phone(self, phone: str) -> str:
        digits = "".join(c for c in (phone or "") if c.isdigit())
        if not digits:
            raise ValueError("Número de teléfono inválido")
        if not digits.startswith("51") and len(digits) <= 9:
            digits = "51" + digits
        return digits

    async def upload_document(
        self,
        pdf_bytes: bytes,
        file_name: str,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> str:
        """Sube el PDF a Meta Media API y retorna media_id. Todo en RAM."""
        if len(pdf_bytes) > MAX_DOCUMENT_BYTES:
            raise ValueError(
                f"El archivo supera el límite de {MAX_DOCUMENT_BYTES // (1024 * 1024)} MB"
            )
        url = f"{self._base_url()}/media"
        files = {
            "file": (file_name, pdf_bytes, "application/pdf"),
        }
        data = {
            "messaging_product": "whatsapp",
            "type": "application/pdf",
        }
        headers = {"Authorization": f"Bearer {self.access_token}"}

        async def _do(c: httpx.AsyncClient) -> str:
            resp = await c.post(url, headers=headers, data=data, files=files)
            body = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                err = body.get("error", {}) if isinstance(body, dict) else {}
                msg = err.get("message") or resp.text or "Error al subir documento"
                logger.warning("whatsapp media upload failed: %s", msg)
                raise RuntimeError(msg)
            media_id = body.get("id") if isinstance(body, dict) else None
            if not media_id:
                raise RuntimeError("Meta no devolvió media_id")
            return str(media_id)

        if client:
            return await _do(client)
        async with httpx.AsyncClient(timeout=self.timeout) as owned:
            return await _do(owned)

    async def send_document_message(
        self,
        *,
        phone: str,
        media_id: str,
        file_name: str,
        caption: str | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> str:
        to = self.normalize_phone(phone)
        url = f"{self._base_url()}/messages"
        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "document",
            "document": {
                "id": media_id,
                "filename": file_name,
            },
        }
        if caption:
            payload["document"]["caption"] = caption[:1024]

        async def _do(c: httpx.AsyncClient) -> str:
            resp = await c.post(url, headers=self._headers_json(), json=payload)
            body = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                err = body.get("error", {}) if isinstance(body, dict) else {}
                msg = err.get("message") or resp.text or "Error al enviar mensaje"
                code = str(err.get("code") or "CLOUD_API_ERROR")
                logger.warning("whatsapp send failed [%s]: %s", code, msg)
                raise RuntimeError(f"{code}: {msg}")
            messages = body.get("messages") if isinstance(body, dict) else None
            if not messages:
                raise RuntimeError("Meta no devolvió message id")
            return str(messages[0].get("id") or "")

        if client:
            return await _do(client)
        async with httpx.AsyncClient(timeout=self.timeout) as owned:
            return await _do(owned)

    async def send_document(
        self,
        *,
        pdf_bytes: bytes,
        file_name: str,
        phone: str,
        message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> WhatsAppSendResult:
        if not self.configured:
            return WhatsAppSendResult(
                ok=False,
                error="WhatsApp Cloud API no configurada",
                error_code="CLOUD_API_NOT_CONFIGURED",
            )
        try:
            safe_name = (file_name or "documento.pdf").strip() or "documento.pdf"
            if not safe_name.lower().endswith(".pdf"):
                safe_name = f"{safe_name}.pdf"
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                media_id = await self.upload_document(
                    pdf_bytes, safe_name, client=client
                )
                message_id = await self.send_document_message(
                    phone=phone,
                    media_id=media_id,
                    file_name=safe_name,
                    caption=message,
                    client=client,
                )
            logger.info(
                "whatsapp document sent phone=*** media=%s message=%s meta=%s",
                media_id,
                message_id,
                metadata or {},
            )
            return WhatsAppSendResult(
                ok=True,
                message_id=message_id,
                media_id=media_id,
            )
        except ValueError as exc:
            return WhatsAppSendResult(
                ok=False,
                error=str(exc),
                error_code="VALIDATION_ERROR",
            )
        except Exception as exc:  # noqa: BLE001
            return WhatsAppSendResult(
                ok=False,
                error=str(exc),
                error_code="CLOUD_API_ERROR",
            )


whatsapp_cloud_service = WhatsAppCloudService()
