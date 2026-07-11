from pydantic_settings import BaseSettings, SettingsConfigDict


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


settings = Settings()
