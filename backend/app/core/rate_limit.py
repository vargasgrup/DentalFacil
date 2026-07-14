"""Simple in-memory sliding-window rate limiter (no SlowAPI dependency at request time)."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status

from app.config import settings

_lock = Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(request: Request, *, limit_per_minute: int, scope: str) -> None:
    """Raise HTTP 429 when the client exceeds limit_per_minute within a 60s window."""
    if limit_per_minute <= 0:
        return
    key = f"{scope}:{_client_key(request)}"
    now = time.monotonic()
    window = 60.0
    with _lock:
        q = _hits[key]
        while q and (now - q[0]) > window:
            q.popleft()
        if len(q) >= limit_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Por favor espere un momento e intente de nuevo.",
            )
        q.append(now)


def enforce_login_rate_limit(request: Request) -> None:
    enforce_rate_limit(
        request,
        limit_per_minute=settings.RATE_LIMIT_LOGIN_PER_MINUTE,
        scope="login",
    )


def enforce_setup_rate_limit(request: Request) -> None:
    enforce_rate_limit(
        request,
        limit_per_minute=settings.RATE_LIMIT_SETUP_PER_MINUTE,
        scope="setup",
    )
