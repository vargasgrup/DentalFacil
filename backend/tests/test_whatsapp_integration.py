"""WhatsApp Cloud API integration tests (mocked HTTP)."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_whatsapp_status_not_configured(
    client: TestClient,
    admin_headers: dict[str, str],
):
    with patch("app.routers.whatsapp_integration.whatsapp_cloud_service") as svc:
        svc.configured = False
        svc.api_version = "v17.0"
        resp = client.get("/api/integrations/whatsapp/status", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is False
    assert body["enabled"] is False


def test_whatsapp_share_not_configured_returns_flag(
    client: TestClient,
    admin_headers: dict[str, str],
):
    pdf = BytesIO(b"%PDF-1.4 fake")
    with patch("app.routers.whatsapp_integration.whatsapp_cloud_service") as svc:
        svc.configured = False
        resp = client.post(
            "/api/integrations/whatsapp/share",
            headers=admin_headers,
            data={
                "phone_number": "987654321",
                "message": "Hola",
                "file_name": "comprobante.pdf",
                "document_type": "comprobante",
                "attempt": "1",
            },
            files={"file": ("comprobante.pdf", pdf, "application/pdf")},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert body["error_code"] == "CLOUD_API_NOT_CONFIGURED"


def test_whatsapp_share_success(
    client: TestClient,
    admin_headers: dict[str, str],
):
    from app.services.whatsapp_cloud import WhatsAppSendResult

    pdf = BytesIO(b"%PDF-1.4 content")
    with patch("app.routers.whatsapp_integration.whatsapp_cloud_service") as svc:
        svc.configured = True
        svc.send_document = AsyncMock(
            return_value=WhatsAppSendResult(
                ok=True, message_id="wamid.TEST", media_id="media.1"
            )
        )
        resp = client.post(
            "/api/integrations/whatsapp/share",
            headers=admin_headers,
            data={
                "phone_number": "51987654321",
                "message": "Comprobante",
                "file_name": "comprobante.pdf",
                "document_type": "comprobante",
                "attempt": "1",
            },
            files={"file": ("comprobante.pdf", pdf, "application/pdf")},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["message_id"] == "wamid.TEST"


def test_whatsapp_retry_too_many(
    client: TestClient,
    admin_headers: dict[str, str],
):
    pdf = BytesIO(b"%PDF-1.4")
    resp = client.post(
        "/api/integrations/whatsapp/send-document",
        headers=admin_headers,
        data={
            "phone_number": "51987654321",
            "message": "x",
            "file_name": "a.pdf",
            "document_type": "documento",
            "attempt": "9",
        },
        files={"file": ("a.pdf", pdf, "application/pdf")},
    )
    assert resp.status_code == 429


def test_whatsapp_metrics(
    client: TestClient,
    admin_headers: dict[str, str],
):
    resp = client.post(
        "/api/integrations/whatsapp/metrics",
        headers=admin_headers,
        json={
            "strategy": "web_share",
            "success": True,
            "document_type": "comprobante",
            "duration_ms": 120,
        },
    )
    assert resp.status_code == 204
