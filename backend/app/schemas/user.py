from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.modules import ALL_MODULES, normalize_modules


class UserCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6)
    rol: str = Field(default="DOCTOR")
    modulos_acceso: Optional[list[str]] = None

    @field_validator("modulos_acceso")
    @classmethod
    def _mods(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        return normalize_modules(v)


class UserOut(BaseModel):
    id: str
    nombre: str
    email: str
    rol: str
    activo: bool
    modulos_acceso: list[str] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[EmailStr] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    modulos_acceso: Optional[list[str]] = None

    @field_validator("modulos_acceso")
    @classmethod
    def _mods(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        return normalize_modules(v)


class PasswordReset(BaseModel):
    new_password: str = Field(..., min_length=6)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)


class SetupRequest(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class SetupStatus(BaseModel):
    needs_setup: bool


# Re-export for docs / admin UI
MODULE_CATALOG = list(ALL_MODULES)
