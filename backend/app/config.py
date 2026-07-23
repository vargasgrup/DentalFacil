from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # JWT
    JWT_SECRET: str = "change-me-in-production-please-use-a-long-random-string"
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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: object) -> object:
        if isinstance(v, str) and v.strip():
            return normalize_database_url(v)
        return v

    @property
    def cors_origins(self) -> list[str]:
        return parse_cors_origins(self.CORS_ORIGINS)

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.strip().lower().startswith("sqlite")


settings = Settings()
