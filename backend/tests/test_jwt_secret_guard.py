"""JWT_SECRET production guard."""

from __future__ import annotations

import pytest

from app.config import (
    JWT_SECRET_INSECURE_DEFAULT,
    Settings,
)


def test_development_allows_default_jwt_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    s = Settings(
        APP_ENV="development",
        JWT_SECRET=JWT_SECRET_INSECURE_DEFAULT,
    )
    assert s.is_production is False
    s.require_secure_jwt_in_production()  # no raise


def test_production_rejects_default_jwt_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    s = Settings(
        APP_ENV="production",
        JWT_SECRET=JWT_SECRET_INSECURE_DEFAULT,
    )
    assert s.is_production is True
    assert s.jwt_secret_is_secure is False
    with pytest.raises(RuntimeError, match="JWT_SECRET inseguro"):
        s.require_secure_jwt_in_production()


def test_production_rejects_short_jwt_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    s = Settings(APP_ENV="production", JWT_SECRET="short-secret")
    with pytest.raises(RuntimeError, match="JWT_SECRET inseguro"):
        s.require_secure_jwt_in_production()


def test_production_accepts_strong_jwt_secret(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    secret = "a" * 32
    s = Settings(APP_ENV="production", JWT_SECRET=secret)
    assert s.jwt_secret_is_secure is True
    s.require_secure_jwt_in_production()
