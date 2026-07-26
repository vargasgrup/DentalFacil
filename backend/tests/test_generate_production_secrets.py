"""Unit tests for packaging/server/scripts/generate_production_secrets.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "packaging" / "server" / "scripts" / "generate_production_secrets.py"


def _load():
    spec = importlib.util.spec_from_file_location("gen_secrets", SCRIPT)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_generate_secrets_rejects_legacy_and_meets_length():
    mod = _load()
    jwt_secret, maint = mod.generate_secrets()
    assert len(jwt_secret) >= 32
    assert len(maint) >= 16
    assert maint != mod.LEGACY_MAINTENANCE_KEY


def test_write_env_rejects_legacy(tmp_path: Path):
    mod = _load()
    out = tmp_path / "config" / ".env"
    with pytest.raises(SystemExit):
        mod.write_env(
            out,
            jwt_secret="a" * 32,
            maintenance_key=mod.LEGACY_MAINTENANCE_KEY,
        )


def test_write_env_ok(tmp_path: Path):
    mod = _load()
    out = tmp_path / "config" / ".env"
    jwt_secret, maint = mod.generate_secrets()
    mod.write_env(out, jwt_secret=jwt_secret, maintenance_key=maint)
    text = out.read_text(encoding="utf-8")
    assert "APP_ENV=production" in text
    assert "JWT_SECRET=" in text
    assert "MAINTENANCE_ACCESS_KEY=" in text
    assert mod.LEGACY_MAINTENANCE_KEY not in text
