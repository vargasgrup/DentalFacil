"""Rate-limit login returns 429 when the configured limit is low."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD, _clear_rate_limiter


def test_login_rate_limit_returns_429(client: TestClient, admin_user, app, monkeypatch):
    """Uses a low dynamic limit via settings (login_limit_value reads it each hit)."""
    from app.config import settings

    monkeypatch.setattr(settings, "RATE_LIMIT_LOGIN_PER_MINUTE", 2)
    _clear_rate_limiter(app)

    statuses: list[int] = []
    for _ in range(6):
        r = client.post(
            "/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrong-password"},
        )
        statuses.append(r.status_code)

    assert 429 in statuses, f"expected 429 among {statuses}"
    assert statuses[-1] == 429
