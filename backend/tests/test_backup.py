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


def test_backup_restore_succeeds_on_windows_paths(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
):
    """Full restore must release SQLite handles and replace WAL sidecars safely."""
    monkeypatch.setenv("BACKUP_DIRECTORY", str(tmp_path / "backups3"))
    gen = client.post("/api/backup/generate", headers=admin_headers)
    assert gen.status_code == 200, gen.text
    hist = client.get("/api/backup/history", headers=admin_headers).json()[0]
    dl = client.get(f"/api/backup/{hist['id']}/download", headers=admin_headers)
    assert dl.status_code == 200

    files = {"file": ("restore.zip", dl.content, "application/zip")}
    ok = client.post(
        "/api/backup/restore",
        headers=admin_headers,
        files=files,
        data={"confirm_token": "CONFIRMAR"},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["ok"] is True
    assert body.get("restart_required") is True
    # Hot apply or same-process pending apply both count as success on Windows
    assert body.get("db_applied") is True or body.get("files_restored") is not None


def test_backup_settings_custom_directory(
    client: TestClient,
    admin_headers: dict[str, str],
    tmp_path: Path,
):
    custom = tmp_path / "clinic_backups"
    r = client.patch(
        "/api/backup/settings",
        headers=admin_headers,
        json={"backup_directory": str(custom)},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert Path(body["backup_directory"]) == custom.resolve()
    assert Path(body["effective_backup_directory"]) == custom.resolve()
    assert custom.is_dir()

    gen = client.post("/api/backup/generate", headers=admin_headers)
    assert gen.status_code == 200, gen.text
    zips = list(custom.glob("*.zip"))
    assert len(zips) >= 1

    # Clear custom path → falls back to env/default
    cleared = client.patch(
        "/api/backup/settings",
        headers=admin_headers,
        json={"backup_directory": ""},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["backup_directory"] == ""
    assert cleared.json()["effective_backup_directory"]


def test_backup_settings_rejects_unwritable_directory(
    client: TestClient,
    admin_headers: dict[str, str],
    tmp_path: Path,
):
    # File path (not a directory) — mkdir/write probe must fail
    blocker = tmp_path / "not_a_dir"
    blocker.write_text("x", encoding="utf-8")
    r = client.patch(
        "/api/backup/settings",
        headers=admin_headers,
        json={"backup_directory": str(blocker)},
    )
    assert r.status_code == 400


def test_backup_settings_heals_missing_directory_column(
    client: TestClient,
    admin_headers: dict[str, str],
):
    """Clinics stamped at head without q11 must still load settings (no 500)."""
    from sqlalchemy import text

    from app.database import engine

    with engine.begin() as conn:
        # Simulate pre-q11 schema: drop column if present (SQLite rebuild)
        cols = {
            str(r[1])
            for r in conn.execute(text("PRAGMA table_info(backup_settings)")).fetchall()
        }
        if "backup_directory" in cols:
            conn.execute(text("ALTER TABLE backup_settings RENAME TO backup_settings_old"))
            conn.execute(
                text(
                    """
                    CREATE TABLE backup_settings (
                        id VARCHAR(36) PRIMARY KEY,
                        auto_backup_enabled BOOLEAN NOT NULL DEFAULT 0,
                        frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
                        preferred_hour VARCHAR(5) NOT NULL DEFAULT '22:00',
                        retention_count INTEGER NOT NULL DEFAULT 10,
                        keep_manual BOOLEAN NOT NULL DEFAULT 1,
                        last_backup_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO backup_settings (
                        id, auto_backup_enabled, frequency, preferred_hour,
                        retention_count, keep_manual, last_backup_at, updated_at
                    )
                    SELECT id, auto_backup_enabled, frequency, preferred_hour,
                           retention_count, keep_manual, last_backup_at, updated_at
                    FROM backup_settings_old
                    """
                )
            )
            conn.execute(text("DROP TABLE backup_settings_old"))

    r = client.get("/api/backup/settings", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "effective_backup_directory" in body
    assert "backup_directory" in body

    # Column must exist again
    with engine.connect() as conn:
        cols = {
            str(r[1])
            for r in conn.execute(text("PRAGMA table_info(backup_settings)")).fetchall()
        }
    assert "backup_directory" in cols


def test_backup_choose_directory_saves_path(
    client: TestClient,
    admin_headers: dict[str, str],
    tmp_path: Path,
    monkeypatch,
):
    chosen = tmp_path / "picked_backups"
    chosen.mkdir()

    def _fake_pick(*, title: str = "", initial_dir: str | None = None):
        _ = title, initial_dir
        return str(chosen)

    monkeypatch.setattr(
        "app.services.backup_service.native_folder_picker_available",
        lambda: {"available": True, "platform": "test", "reason": ""},
    )
    monkeypatch.setattr(
        "app.services.backup_service.pick_backup_directory_interactive",
        _fake_pick,
    )
    r = client.post("/api/backup/choose-directory", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cancelled"] is False
    assert body.get("picker_unavailable") is False
    assert Path(body["path"]) == chosen.resolve()
    assert body["settings"]["backup_directory"]
    assert Path(body["settings"]["effective_backup_directory"]) == chosen.resolve()


def test_backup_choose_directory_cancelled(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
):
    monkeypatch.setattr(
        "app.services.backup_service.native_folder_picker_available",
        lambda: {"available": True, "platform": "test", "reason": ""},
    )
    monkeypatch.setattr(
        "app.services.backup_service.pick_backup_directory_interactive",
        lambda **_: None,
    )
    r = client.post("/api/backup/choose-directory", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert r.json()["cancelled"] is True
    assert r.json()["settings"] is None


def test_backup_choose_directory_picker_unavailable(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
):
    monkeypatch.setattr(
        "app.services.backup_service.native_folder_picker_available",
        lambda: {
            "available": False,
            "platform": "linux",
            "reason": "El servidor no tiene escritorio gráfico (DISPLAY).",
        },
    )
    r = client.post("/api/backup/choose-directory", headers=admin_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["picker_unavailable"] is True
    assert body["path"] is None
    assert body["settings"] is None
    assert isinstance(body.get("suggestions"), list)
    assert len(body["suggestions"]) >= 1
    assert body.get("message")


def test_backup_history_timestamps_are_utc_aware(
    client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch,
    tmp_path: Path,
):
    monkeypatch.setenv("BACKUP_DIRECTORY", str(tmp_path / "backups_tz"))
    gen = client.post("/api/backup/generate", headers=admin_headers)
    assert gen.status_code == 200, gen.text
    created = gen.json()["created_at"]
    assert isinstance(created, str)
    # Must carry explicit UTC designator so the UI does not treat naive as local
    assert created.endswith("Z") or "+" in created[10:] or created.endswith("+00:00")
    assert gen.json()["filename"].startswith("nkdentalsoft_backup_")


def test_backup_suggested_and_apply_directory(
    client: TestClient,
    admin_headers: dict[str, str],
    tmp_path: Path,
    monkeypatch,
):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "LocalAppData"))
    rows = client.get("/api/backup/suggested-directories", headers=admin_headers)
    assert rows.status_code == 200, rows.text
    body = rows.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    target = body[0]["path"]
    applied = client.post(
        "/api/backup/apply-directory",
        headers=admin_headers,
        json={"path": target},
    )
    assert applied.status_code == 200, applied.text
    assert Path(applied.json()["effective_backup_directory"]) == Path(target).resolve()


def test_backup_rejects_program_files_path(
    client: TestClient,
    admin_headers: dict[str, str],
):
    r = client.patch(
        "/api/backup/settings",
        headers=admin_headers,
        json={"backup_directory": r"C:\Program Files\DentalSimple\backups"},
    )
    assert r.status_code == 400
    assert "Program Files" in r.json()["detail"]


def test_windows_powershell_resolved_absolutely():
    from pathlib import Path

    from app.services.backup_service import _windows_powershell_exe

    exe = _windows_powershell_exe()
    assert Path(exe).is_file()
    assert exe.lower().endswith("powershell.exe")
