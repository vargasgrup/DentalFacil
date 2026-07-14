"""Application-level rate limiting via slowapi."""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(key_func=get_remote_address)


def login_limit_value(request: Request) -> str:
    return f"{settings.RATE_LIMIT_LOGIN_PER_MINUTE}/minute"


def setup_limit_value(request: Request) -> str:
    return f"{settings.RATE_LIMIT_SETUP_PER_MINUTE}/minute"


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Demasiados intentos. Por favor espere un momento e intente de nuevo.",
        },
    )
