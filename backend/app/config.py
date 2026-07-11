from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str) -> str:
    """Railway delivers postgres:// or postgresql://; SQLAlchemy+psycopg needs +psycopg.

    Rejects http(s) hosts that users sometimes paste from the Postgres public domain.
    """
    raw = url.strip()
    lower = raw.lower()
    if lower.startswith(("http://", "https://")):
        raise ValueError(
            "DATABASE_URL must be a Postgres connection string "
            "(postgresql://...), not an https:// URL. "
            "In Railway → Backend → Variables → Add Variable → "
            "Variable Reference → Postgres → DATABASE_URL."
        )
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]
    if not raw.startswith("postgresql+psycopg://"):
        raise ValueError(
            "DATABASE_URL must start with postgresql:// or postgres://. "
            "Use Railway Variable Reference to Postgres.DATABASE_URL."
        )
    return raw


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+psycopg://dentalsimple:dentalsimple@db:5432/dentalsimple"

    # JWT
    JWT_SECRET: str = "change-me-in-production-please-use-a-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # App
    APP_NAME: str = "M&D Odontología Especializada"
    CORS_ORIGINS: list[str] = ["http://localhost:3001"]
    BACKEND_PORT: int = 8001
    CLINIC_NAME: str = "M&D Odontología Especializada"
    CLINIC_PHONE: str = ""
    CLINIC_ADDRESS: str = ""
    CLINIC_RUC: str = ""
    CLINIC_EMAIL: str = ""
    CLINIC_TICKET_SERIE: str = "T001"
    # Public base URL for QR verification links (optional)
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

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        """Accept JSON list or comma-separated URLs (Railway-friendly)."""
        if not isinstance(v, str):
            return v
        raw = v.strip()
        if not raw:
            return []
        if raw.startswith("["):
            import json

            return json.loads(raw)
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


def load_settings() -> Settings:
    """Load settings; never crash the process on bad Railway env (healthcheck needs HTTP)."""
    try:
        return Settings()
    except Exception as exc:  # noqa: BLE001
        print(f"[dentalfacil] ERROR loading settings: {exc}", flush=True)
        print(
            "[dentalfacil] Fix DATABASE_URL: use Variable Reference → Postgres → DATABASE_URL "
            "(must look like postgresql://user:pass@host:5432/db, NOT https://...)",
            flush=True,
        )
        # Fall back so uvicorn can still bind and /api/health responds
        return Settings(
            DATABASE_URL="postgresql+psycopg://invalid:invalid@127.0.0.1:1/invalid",
            CORS_ORIGINS=["*"],
        )


settings = load_settings()
