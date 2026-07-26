"""System / LAN health endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_system_health_public(client: TestClient):
    r = client.get("/api/system/health")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "status" in body
    assert "version" in body
    assert "app_env" in body


def test_system_version_public(client: TestClient):
    r = client.get("/api/system/version")
    assert r.status_code == 200
    assert r.json()["version"]


def test_system_env_check_requires_admin(client: TestClient, admin_headers: dict[str, str]):
    denied = client.get("/api/system/env-check")
    assert denied.status_code in (401, 403)
    ok = client.get("/api/system/env-check", headers=admin_headers)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert "jwt_secret_ok" in body
    assert "checks" in body


def test_legacy_health_still_works(client: TestClient):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert "status" in r.json()
