from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.rate_limit import enforce_login_rate_limit, enforce_setup_rate_limit
from app.core.roles import MAX_ADMINS, VALID_ROLES, Rol
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_token_revoked,
    revoke_token_payload,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas.user import (
    LoginRequest,
    LogoutRequest,
    PasswordChange,
    PasswordReset,
    RefreshRequest,
    SetupRequest,
    SetupStatus,
    TokenResponse,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_tokens(user: User) -> TokenResponse:
    ver = int(getattr(user, "token_version", 0) or 0)
    access = create_access_token(str(user.id), user.rol, ver)
    refresh = create_refresh_token(str(user.id), ver)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserOut.model_validate(user),
    )


def _bump_token_version(user: User) -> None:
    user.token_version = int(getattr(user, "token_version", 0) or 0) + 1


def _safe_decode(token: str) -> dict | None:
    try:
        return decode_token(token)
    except Exception:
        return None


@router.get("/setup-status", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)):
    """Check if the system needs initial setup (no users exist)."""
    count = db.query(User).count()
    return SetupStatus(needs_setup=count == 0)


@router.post("/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def setup(request: Request, payload: SetupRequest, db: Session = Depends(get_db)):
    """Create the first ADMIN user. Only works when no users exist."""
    enforce_setup_rate_limit(request)
    if db.query(User).count() > 0:
        raise HTTPException(status_code=400, detail="El sistema ya está configurado")
    user = User(
        nombre=payload.nombre,
        email=payload.email,
        password_hash=hash_password(payload.password),
        rol=Rol.ADMIN.value,
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_tokens(user)


@router.post("/login", response_model=TokenResponse)
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    enforce_login_rate_limit(request)
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    if not user.activo:
        raise HTTPException(status_code=403, detail="Usuario inactivo")
    return _user_tokens(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        token_data = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token de refresco inválido")

    if token_data.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Token inválido")

    if is_token_revoked(db, token_data.get("jti")):
        raise HTTPException(status_code=401, detail="Token de refresco inválido")

    user = db.get(User, token_data["sub"])
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario inválido")

    token_ver = int(token_data.get("ver") or 0)
    if token_ver != int(user.token_version or 0):
        raise HTTPException(status_code=401, detail="Token de refresco inválido")

    revoke_token_payload(db, token_data, user_id=user.id, reason="refresh_rotated")
    db.commit()
    return _user_tokens(user)


@router.post("/logout", status_code=204)
def logout(
    payload: LogoutRequest = LogoutRequest(),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Revoke access/refresh JTIs. Auth optional if refresh_token is sent in body."""
    revoked_any = False

    if authorization and authorization.lower().startswith("bearer "):
        access_token = authorization.split(" ", 1)[1].strip()
        access_payload = _safe_decode(access_token)
        if access_payload and access_payload.get("type") == "access":
            revoke_token_payload(db, access_payload, reason="logout")
            revoked_any = True

    if payload.refresh_token:
        refresh_payload = _safe_decode(payload.refresh_token)
        if refresh_payload and refresh_payload.get("type") == "refresh":
            revoke_token_payload(db, refresh_payload, reason="logout")
            revoked_any = True

    if revoked_any:
        db.commit()
    return None


@router.post("/change-password", status_code=204)
def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    user.password_hash = hash_password(payload.new_password)
    _bump_token_version(user)
    db.commit()


def _count_admins(db: Session, *, exclude_id: str | None = None) -> int:
    q = db.query(User).filter(User.rol == Rol.ADMIN.value)
    if exclude_id is not None:
        q = q.filter(User.id != exclude_id)
    return q.count()


def _count_active_admins(db: Session, *, exclude_id: str | None = None) -> int:
    q = db.query(User).filter(User.rol == Rol.ADMIN.value, User.activo == True)  # noqa: E712
    if exclude_id is not None:
        q = q.filter(User.id != exclude_id)
    return q.count()


def _assert_admin_slot_available(db: Session, *, exclude_id: str | None = None) -> None:
    if _count_admins(db, exclude_id=exclude_id) >= MAX_ADMINS:
        raise HTTPException(
            status_code=400,
            detail=f"El centro permite como máximo {MAX_ADMINS} administradores",
        )


# --- User management (ADMIN only) ---

users_router = APIRouter(prefix="/api/users", tags=["users"])


class DoctorBrief(BaseModel):
    id: str
    nombre: str

    model_config = {"from_attributes": True}


@users_router.get("/doctors", response_model=list[DoctorBrief])
def list_doctors(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active doctors for calendar columns — available to any authenticated user."""
    return (
        db.query(User)
        .filter(User.rol == Rol.DOCTOR.value, User.activo == True)  # noqa: E712
        .order_by(User.nombre)
        .all()
    )


@users_router.get("", response_model=list[UserOut])
def list_users(
    admin: User = Depends(require_roles(Rol.ADMIN)),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@users_router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    admin: User = Depends(require_roles(Rol.ADMIN)),
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    nombre = payload.nombre.strip()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if payload.rol not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Rol inválido. Use: {', '.join(sorted(VALID_ROLES))}",
        )
    if payload.rol == Rol.ADMIN.value:
        _assert_admin_slot_available(db)
    user = User(
        nombre=nombre,
        email=email,
        password_hash=hash_password(payload.password),
        rol=payload.rol,
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@users_router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    admin: User = Depends(require_roles(Rol.ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if payload.nombre is not None:
        user.nombre = payload.nombre.strip()
    if payload.email is not None:
        email = payload.email.strip().lower()
        existing = (
            db.query(User)
            .filter(func.lower(User.email) == email, User.id != user_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email ya registrado")
        user.email = email
    if payload.rol is not None:
        if payload.rol not in VALID_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Rol inválido. Use: {', '.join(sorted(VALID_ROLES))}",
            )
        if payload.rol == Rol.ADMIN.value and user.rol != Rol.ADMIN.value:
            _assert_admin_slot_available(db)
        # No dejar el centro sin al menos un ADMIN
        if (
            user.rol == Rol.ADMIN.value
            and payload.rol != Rol.ADMIN.value
            and _count_admins(db, exclude_id=user.id) < 1
        ):
            raise HTTPException(
                status_code=400,
                detail="Debe quedar al menos un administrador en el centro",
            )
        user.rol = payload.rol
    if payload.activo is not None:
        if (
            user.rol == Rol.ADMIN.value
            and user.activo
            and payload.activo is False
            and _count_active_admins(db, exclude_id=user.id) < 1
        ):
            raise HTTPException(
                status_code=400,
                detail="No se puede desactivar el último administrador activo",
            )
        user.activo = payload.activo
    db.commit()
    db.refresh(user)
    return user


@users_router.post("/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: str,
    payload: PasswordReset,
    admin: User = Depends(require_roles(Rol.ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.password_hash = hash_password(payload.new_password)
    _bump_token_version(user)
    db.commit()


@users_router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
