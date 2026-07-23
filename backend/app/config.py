from __future__ import annotations

import os

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


JWT_SECRET_INSECURE_DEFAULT = "change-me-in-production-please-use-a-long-random-string"
JWT_SECRET_MIN_LENGTH = 32


def normalize_database_url(url: str) -> str:
    """Normalize DATABASE_URL for SQLAlchemy (SQLite default, Postgres still supported)."""
    raw = url.strip()
    lower = raw.lower()
    if lower.startswith(("http://", "https://")):
        raise ValueError(
            "DATABASE_URL must be sqlite:///... or postgresql://... — not an https:// URL."
        )
    if lower.startswith("sqlite:"):
        # Prefer Absolute / relative file URLs as-is (sqlite:///./data/clinica.db)
        return raw
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]
    if raw.startswith("postgresql+psycopg://"):
        return raw
    raise ValueError(
        "DATABASE_URL must start with sqlite:/// or postgresql:// (or postgres://)"
    )


def parse_cors_origins(value: str | list[str]) -> list[str]:
    """Accept JSON list, comma-separated URLs, or a single URL (Railway-friendly)."""
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    raw = (value or "").strip()
    if not raw:
        return []
    if raw.startswith("["):
        import json

        parsed = json.loads(raw)
        return [str(v).strip() for v in parsed if str(v).strip()]
    return [part.strip() for part in raw.split(",") if part.strip()]


class Settings(BaseSettings):
    # Local default: SQLite file (no Docker / no Postgres daemon required)
    DATABASE_URL: str = "sqlite:///./data/clinica.db"

    # development | production | test — en production JWT_SECRET débil aborta el arranque
    APP_ENV: str = "development"

    # JWT — generar único por entorno: openssl rand -hex 32
    JWT_SECRET: str = JWT_SECRET_INSECURE_DEFAULT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720  # 12 h — jornada clínica de escritorio
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # multi-PC / reinicios sin re-login diario

    # Rate limiting (auth endpoints)
    RATE_LIMIT_LOGIN_PER_MINUTE: int = 10
    RATE_LIMIT_SETUP_PER_MINUTE: int = 3

    # App
    APP_NAME: str = "M&D Odontología Especializada"
    CORS_ORIGINS: str = "http://localhost:3001"
    BACKEND_PORT: int = 8001
    CLINIC_NAME: str = "M&D Odontología Especializada"
    CLINIC_PHONE: str = ""
    CLINIC_ADDRESS: str = ""
    CLINIC_RUC: str = ""
    CLINIC_EMAIL: str = ""
    CLINIC_TICKET_SERIE: str = "T001"
    PUBLIC_APP_URL: str = "http://localhost:3001"

    # Reminder scheduler
    REMINDER_HOURS_BEFORE: int = 24

    # WhatsApp Cloud API (Meta) — opcional; sin credenciales el frontend usa Web Share / descarga
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_API_VERSION: str = "v17.0"
    WHATSAPP_REQUEST_TIMEOUT_SECONDS: int = 30
    PDF_CACHE_MAX_SIZE: int = 50
    MAX_RETRY_ATTEMPTS: int = 3

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: object) -> object:
        if isinstance(v, str) and v.strip():
            return normalize_database_url(v)
        return v

    @property
    def is_production(self) -> bool:
        env = (self.APP_ENV or "").strip().lower()
        if env in ("production", "prod"):
            return True
        # Railway / hosts comunes
        railway = (os.environ.get("RAILWAY_ENVIRONMENT") or "").strip().lower()
        if railway in ("production", "prod"):
            return True
        return False

    @property
    def jwt_secret_is_secure(self) -> bool:
        secret = (self.JWT_SECRET or "").strip()
        if not secret or secret == JWT_SECRET_INSECURE_DEFAULT:
            return False
        return len(secret) >= JWT_SECRET_MIN_LENGTH

    def require_secure_jwt_in_production(self) -> None:
        """Abortar arranque en producción si el secreto es el default o demasiado corto."""
        if not self.is_production:
            return
        if self.jwt_secret_is_secure:
            return
        raise RuntimeError(
            "JWT_SECRET inseguro en producción: genera un valor único "
            f"(mín. {JWT_SECRET_MIN_LENGTH} caracteres), p.ej. `openssl rand -hex 32`, "
            "y define APP_ENV=production + JWT_SECRET en las variables de entorno. "
            "No uses el valor por defecto del código."
        )

    @property
    def cors_origins(self) -> list[str]:
        return parse_cors_origins(self.CORS_ORIGINS)

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.strip().lower().startswith("sqlite")


settings = Settings()
settings.require_secure_jwt_in_production()
