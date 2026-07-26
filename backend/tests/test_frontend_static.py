"""Tests for static UI path resolution (Next.js export embed)."""

from __future__ import annotations

from pathlib import Path

from app.frontend_static import pick_ui_relpath


def test_pick_ui_relpath_index_and_patient_fallback(tmp_path: Path):
    (tmp_path / "index.html").write_text("home", encoding="utf-8")
    (tmp_path / "dashboard").mkdir()
    (tmp_path / "dashboard" / "index.html").write_text("dash", encoding="utf-8")
    (tmp_path / "pacientes" / "_").mkdir(parents=True)
    (tmp_path / "pacientes" / "_" / "index.html").write_text("ficha", encoding="utf-8")
    (tmp_path / "pacientes" / "nuevo").mkdir()
    (tmp_path / "pacientes" / "nuevo" / "index.html").write_text("nuevo", encoding="utf-8")

    assert pick_ui_relpath(tmp_path, "/") == "index.html"
    assert pick_ui_relpath(tmp_path, "/dashboard/") == "dashboard/index.html"
    assert pick_ui_relpath(tmp_path, "/pacientes/nuevo/") == "pacientes/nuevo/index.html"
    assert pick_ui_relpath(tmp_path, "/pacientes/abc-uuid-1/") == "pacientes/_/index.html"
    assert pick_ui_relpath(tmp_path, "/missing-asset.js") is None


def test_pick_ui_relpath_next_static_chunk(tmp_path: Path):
    chunk = tmp_path / "_next" / "static" / "chunks"
    chunk.mkdir(parents=True)
    f = chunk / "main-app.js"
    f.write_text("/*js*/", encoding="utf-8")
    assert pick_ui_relpath(tmp_path, "/_next/static/chunks/main-app.js") == "_next/static/chunks/main-app.js"
