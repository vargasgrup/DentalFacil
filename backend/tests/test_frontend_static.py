"""Tests for static UI path resolution (Next.js export embed)."""

from __future__ import annotations

from pathlib import Path

from app.frontend_static import pick_ui_file


def test_pick_ui_file_index_and_patient_fallback(tmp_path: Path):
    (tmp_path / "index.html").write_text("home", encoding="utf-8")
    (tmp_path / "dashboard").mkdir()
    (tmp_path / "dashboard" / "index.html").write_text("dash", encoding="utf-8")
    (tmp_path / "pacientes" / "_").mkdir(parents=True)
    (tmp_path / "pacientes" / "_" / "index.html").write_text("ficha", encoding="utf-8")
    (tmp_path / "pacientes" / "nuevo").mkdir()
    (tmp_path / "pacientes" / "nuevo" / "index.html").write_text("nuevo", encoding="utf-8")

    assert pick_ui_file(tmp_path, "/").name == "index.html"
    assert pick_ui_file(tmp_path, "/dashboard/").parent.name == "dashboard"
    assert pick_ui_file(tmp_path, "/pacientes/nuevo/").parent.name == "nuevo"
    assert pick_ui_file(tmp_path, "/pacientes/abc-uuid-1/").parent.name == "_"
    assert pick_ui_file(tmp_path, "/missing-asset.js") is None
