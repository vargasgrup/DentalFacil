"""Complementary tests (Rx / photos / lab) — storage, multi-file, CRUD."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.paths import resolve_media_root


@pytest.fixture()
def comp_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "complementary_tests"
    root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("COMPLEMENTARY_TESTS_ROOT", str(root))
    return root


def test_resolve_media_root_honors_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    target = tmp_path / "clinic_media" / "complementary_tests"
    monkeypatch.setenv("COMPLEMENTARY_TESTS_ROOT", str(target))
    assert resolve_media_root("COMPLEMENTARY_TESTS_ROOT", "complementary_tests") == target.resolve()


def test_resolve_media_root_expands_vars(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setenv(
        "COMPLEMENTARY_TESTS_ROOT",
        r"%LOCALAPPDATA%\NKDentalSoft\complementary_tests",
    )
    got = resolve_media_root("COMPLEMENTARY_TESTS_ROOT", "complementary_tests")
    assert got == (tmp_path / "NKDentalSoft" / "complementary_tests").resolve()


def _png_bytes() -> bytes:
    # Minimal valid 1x1 PNG
    import struct
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = zlib.compress(b"\x00\xff\x00\x00")
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", raw)
        + chunk(b"IEND", b"")
    )


def test_complementary_upload_list_multi_delete(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    comp_root: Path,
):
    pid = patient["id"]

    # Empty list
    empty = client.get(f"/api/complementary-tests/{pid}", headers=admin_headers)
    assert empty.status_code == 200, empty.text
    assert empty.json() == []

    # Upload two panorámicas + one intraoral
    png = _png_bytes()
    ids: list[str] = []
    uploads = [
        ("radiografia", "ortopantomografia", "pano_a.png"),
        ("radiografia", "ortopantomografia", "pano_b.png"),
        ("fotografia_clinica", "intraoral", "foto.png"),
    ]
    for i, (cat, sub, name) in enumerate(uploads, start=1):
        resp = client.post(
            f"/api/complementary-tests/{pid}",
            headers=admin_headers,
            data={"categoria": cat, "subtipo": sub, "notas": f"nota-{i}"},
            files={"file": (name, io.BytesIO(png), "image/png")},
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body["categoria"] == cat
        assert body["subtipo"] == sub
        assert body["size_bytes"] > 0
        assert Path(body["url"]).name  # has file id in path
        ids.append(body["id"])
        # File landed under patient/categoria/subtipo
        stored = list(comp_root.joinpath(pid, cat, sub).glob("*.png"))
        assert stored, f"missing disk file for {cat}/{sub}"

    listed = client.get(f"/api/complementary-tests/{pid}", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    items = listed.json()
    assert len(items) == 3
    panos = [x for x in items if x["subtipo"] == "ortopantomografia"]
    assert len(panos) == 2

    org = client.get(f"/api/complementary-tests/{pid}/organized", headers=admin_headers)
    assert org.status_code == 200, org.text
    payload = org.json()
    assert len(payload["items"]) == 3
    rx = next(t for t in payload["totals"] if t["categoria"] == "radiografia")
    assert rx["total"] == 2
    assert rx["by_subtipo"].get("ortopantomografia") == 2

    # Preview file
    file_id = ids[0]
    preview = client.get(f"/api/complementary-tests/file/{file_id}", headers=admin_headers)
    assert preview.status_code == 200, preview.text
    assert preview.content[:8] == b"\x89PNG\r\n\x1a\n"

    # Delete one
    deleted = client.delete(f"/api/complementary-tests/{file_id}", headers=admin_headers)
    assert deleted.status_code == 204, deleted.text
    after = client.get(f"/api/complementary-tests/{pid}", headers=admin_headers)
    assert len(after.json()) == 2


def test_complementary_rejects_bad_subtype(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    comp_root: Path,
):
    resp = client.post(
        f"/api/complementary-tests/{patient['id']}",
        headers=admin_headers,
        data={"categoria": "radiografia", "subtipo": "no_existe"},
        files={"file": ("x.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert resp.status_code == 400


def test_complementary_rejects_non_image_pdf_only_types(
    client: TestClient,
    admin_headers: dict[str, str],
    patient: dict,
    comp_root: Path,
):
    resp = client.post(
        f"/api/complementary-tests/{patient['id']}",
        headers=admin_headers,
        data={"categoria": "laboratorio", "subtipo": "biopsia"},
        files={"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp.status_code == 400
