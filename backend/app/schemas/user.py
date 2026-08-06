from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.modules import ALL_MODULES, normalize_modules


def _optional_email(v: object) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s.lower()


class UserCreate(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    username: str = Field(..., min_length=3, max_length=40)
    email: Optional[EmailStr] = None  # recovery only
    password: str = Field(..., min_length=6)
    rol: str = Field(default="DOCTOR")
    modulos_acceso: Optional[list[str]] = None

    @field_validator("email", mode="before")
    @classmethod
    def _email_empty(cls, v: object) -> object:
        return _optional_email(v)

    @field_validator("modulos_acceso")
    @classmethod
    def _mods(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return None
        return normalize_modules(v)


class UserOut(BaseModel):
    id: str
    nombre: str
    username: str
    email: Optional[str] = None
    rol: str
    activo: bool
    modulos_acceso: list[str] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    username: Optional[str] = Field(None, min_length=3, max_length=40)
    email: Optional[EmailStr] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    modulos_acceso: Optional[list[str]] = None

    @field_validator("email", mode="before")
    @classmethod
    def _email_empty(cls, v: object) -> object:
        return _optional_email(v)

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


class AccountUpdate(BaseModel):
    """Self-service: display name, login username, recovery email and/or password."""

    current_password: str = Field(..., min_length=1)
    nombre: Optional[str] = Field(None, min_length=2, max_length=120)
    username: Optional[str] = Field(None, min_length=3, max_length=40)
    email: Optional[EmailStr] = None
    new_password: Optional[str] = Field(None, min_length=6)
    confirm_new_password: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def _email_empty(cls, v: object) -> object:
        return _optional_email(v)

    @model_validator(mode="after")
    def _validate_account_update(self) -> "AccountUpdate":
        nombre = (self.nombre or "").strip() if self.nombre is not None else None
        username = (self.username or "").strip() if self.username is not None else None
        email = self.email
        new_pwd = (self.new_password or "").strip() if self.new_password else ""
        confirm = (self.confirm_new_password or "").strip() if self.confirm_new_password else ""

        if self.nombre is not None:
            object.__setattr__(self, "nombre", nombre)
        if self.username is not None:
            object.__setattr__(self, "username", username)

        if not nombre and username is None and email is None and not new_pwd:
            raise ValueError(
                "Indique un cambio: nombre, usuario de acceso, correo de recuperación o contraseña"
            )

        if new_pwd or confirm:
            if len(new_pwd) < 6:
                raise ValueError("La nueva contraseña debe tener al menos 6 caracteres")
            if new_pwd != confirm:
                raise ValueError("Las contraseñas nuevas no coinciden")
            object.__setattr__(self, "new_password", new_pwd)
            object.__setattr__(self, "confirm_new_password", confirm)
        else:
            object.__setattr__(self, "new_password", None)
            object.__setattr__(self, "confirm_new_password", None)
        return self


class SetupRequest(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=120)
    username: str = Field(..., min_length=3, max_length=40)
    email: Optional[EmailStr] = None  # recovery only
    password: str = Field(..., min_length=6)

    @field_validator("email", mode="before")
    @classmethod
    def _email_empty(cls, v: object) -> object:
        return _optional_email(v)


class LoginRequest(BaseModel):
    """Login with username (+ password). `email` accepted as legacy alias for username or recovery lookup."""

    username: Optional[str] = Field(None, max_length=80)
    email: Optional[str] = Field(None, max_length=180)  # legacy clients may still send this
    password: str

    @model_validator(mode="after")
    def _resolve_login_id(self) -> "LoginRequest":
        u = (self.username or "").strip()
        e = (self.email or "").strip()
        login_id = u or e
        if not login_id:
            raise ValueError("Indique el usuario de acceso")
        object.__setattr__(self, "username", login_id)
        return self


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
    demo_mode: bool = False
    demo_admin_credentials_locked: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    ok: bool = True
    message: str
    delivery: str = "none"  # email | admin | none
    # Present only when PASSWORD_RESET_INLINE_CODE=true (local installs)
    reset_code: str | None = None


class ValidateResetRequest(BaseModel):
    token: str | None = None
    code: str | None = None
    email: EmailStr | None = None


class ValidateResetResponse(BaseModel):
    valid: bool
    email: str | None = None
    nombre: str | None = None


class ResetPasswordWithTokenRequest(BaseModel):
    new_password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)
    token: str | None = None
    code: str | None = None
    email: EmailStr | None = None

    @model_validator(mode="after")
    def _passwords_match(self) -> "ResetPasswordWithTokenRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Las contraseñas no coinciden")
        if not (self.token or "").strip() and not (
            (self.code or "").strip() and self.email
        ):
            raise ValueError("Debe indicar el enlace (token) o el código con su correo")
        return self


# Re-export for docs / admin UI
MODULE_CATALOG = list(ALL_MODULES)
