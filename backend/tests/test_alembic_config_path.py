"""Unit tests for alembic.ini resolution (frozen / source layouts)."""

from __future__ import annotations

from pathlib import Path

from app.migrate import alembic_config


def test_alembic_config_finds_repo_ini():
    cfg = alembic_config()
    loc = cfg.get_main_option("script_location")
    assert loc
    assert Path(loc).is_dir()
    assert (Path(loc) / "env.py").is_file()
