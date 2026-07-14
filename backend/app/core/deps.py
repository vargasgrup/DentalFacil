from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.roles import Rol
from app.core.security import decode_token, is_token_revoked
from app.database import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise cred_exc
        user_id = int(payload["sub"])
    except HTTPException:
        raise
    except Exception:
        raise cred_exc

    if is_token_revoked(db, payload.get("jti")):
        raise cred_exc

    user = db.get(User, user_id)
    if not user or not user.activo:
        raise cred_exc

    token_ver = int(payload.get("ver") or 0)
    if token_ver != int(user.token_version or 0):
        raise cred_exc

    return user


def require_roles(*roles: Rol):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.rol not in [r.value for r in roles]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permisos insuficientes")
        return user
    return checker
