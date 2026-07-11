from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.roles import Rol
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas.user import (
    LoginRequest,
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
    access = create_access_token(str(user.id), user.rol)
    refresh = create_refresh_token(str(user.id))
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserOut.model_validate(user),
    )


@router.get("/setup-status", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)):
    """Check if the system needs initial setup (no users exist)."""
    count = db.query(User).count()
    return SetupStatus(needs_setup=count == 0)


@router.post("/setup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def setup(payload: SetupRequest, db: Session = Depends(get_db)):
    """Create the first ADMIN user. Only works when no users exist."""
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
def login(payload: LoginRequest, db: Session = Depends(get_db)):
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
        if token_data.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = db.get(User, int(token_data["sub"]))
        if not user or not user.activo:
            raise HTTPException(status_code=401, detail="Usuario inválido")
    except Exception:
        raise HTTPException(status_code=401, detail="Token de refresco inválido")
    return _user_tokens(user)


@router.post("/logout", status_code=204)
def logout():
    # Stateless JWT: client just discards the token.
    # No server-side session to invalidate.
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
    db.commit()


# --- User management (ADMIN only) ---

users_router = APIRouter(prefix="/api/users", tags=["users"])


class DoctorBrief(BaseModel):
    id: int
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
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if payload.rol not in [r.value for r in Rol]:
        raise HTTPException(status_code=400, detail="Rol inválido")
    user = User(
        nombre=payload.nombre,
        email=payload.email,
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
    user_id: int,
    payload: UserUpdate,
    admin: User = Depends(require_roles(Rol.ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if payload.nombre is not None:
        user.nombre = payload.nombre
    if payload.email is not None:
        existing = db.query(User).filter(User.email == payload.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email ya registrado")
        user.email = payload.email
    if payload.rol is not None:
        if payload.rol not in [r.value for r in Rol]:
            raise HTTPException(status_code=400, detail="Rol inválido")
        user.rol = payload.rol
    if payload.activo is not None:
        user.activo = payload.activo
    db.commit()
    db.refresh(user)
    return user


@users_router.post("/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: int,
    payload: PasswordReset,
    admin: User = Depends(require_roles(Rol.ADMIN)),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.password_hash = hash_password(payload.new_password)
    db.commit()


@users_router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
