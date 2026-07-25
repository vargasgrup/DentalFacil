"""Backup generate / validate / RBAC tests (SQLite)."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient


def test_backup_generate_contains_manifest_and_db(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setenv("BACKUP_DIRECTORY", str(tmp_path / "backups"))
    r = client.post("/api/backup/generate", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "success"
    assert body["filename"].endswith(".zip")
    path = Path(body.get("abs_path") or "")
    # abs_path may not be in response schema — fetch from history
    hist = client.get("/api/backup/history", headers=admin_headers)
    assert hist.status_code == 200
    row = hist.json()[0]
    assert row["status"] == "success"

    # Download and inspect zip
    dl = client.get(f"/api/backup/{row['id']}/download", headers=admin_headers)
    assert dl.status_code == 200
    with zipfile.ZipFile(io.BytesIO(dl.content)) as zf:
        names = zf.namelist()
        assert "manifest.json" in names
        assert "database/clinica.db" in names


def test_backup_rbac_non_admin_forbidden(
    client: TestClient,
    admin_headers: dict[str, str],
):
    # Create asistente
    created = client.post(
        "/api/users",
        headers=admin_headers,
        json={
            "email": "asist.backup@example.com",
            "password": "AsistBackup123!",
            "nombre": "Asist Backup",
            "rol": "ASISTENTE",
        },
    )
    assert created.status_code == 201, created.text
    login = client.post(
        "/api/auth/login",
        json={"email": "asist.backup@example.com", "password": "AsistBackup123!"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/backup/settings", headers=headers).status_code == 403
    assert client.post("/api/backup/generate", headers=headers).status_code == 403


def test_backup_validate_rejects_bad_zip(
    client: TestClient,
    admin_headers: dict[str, str],
):
    files = {"file": ("bad.zip", b"not-a-zip", "application/zip")}
    r = client.post("/api/backup/validate", headers=admin_headers, files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert body["errors"]


def test_backup_restore_requires_confirm(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setenv("BACKUP_DIRECTORY", str(tmp_path / "backups2"))
    gen = client.post("/api/backup/generate", headers=admin_headers)
    assert gen.status_code == 200
    hist = client.get("/api/backup/history", headers=admin_headers).json()[0]
    dl = client.get(f"/api/backup/{hist['id']}/download", headers=admin_headers)
    assert dl.status_code == 200

    files = {"file": ("restore.zip", dl.content, "application/zip")}
    data = {"confirm_token": "NO"}
    bad = client.post(
        "/api/backup/restore",
        headers=admin_headers,
        files=files,
        data=data,
    )
    assert bad.status_code == 400
