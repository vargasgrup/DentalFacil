from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.roles import Rol
from app.core.security import decode_token, is_token_revoked
from app.database import get_db
from app.models import User

# auto_error=False: also accept session cookie / query (media <img>/<iframe> cannot send Authorization).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# Cookie written by the SPA (authCookie.ts) — same-origin desktop WebView / browser.
_AUTH_COOKIE = "ds_access_token"
_QUERY_TOKEN_KEYS = ("access_token", "token")


def _extract_access_token(request: Request, bearer: str | None) -> str | None:
    if bearer and bearer.strip():
        return bearer.strip()
    cookie = request.cookies.get(_AUTH_COOKIE)
    if cookie and cookie.strip():
        return cookie.strip()
    for key in _QUERY_TOKEN_KEYS:
        q = request.query_params.get(key)
        if q and q.strip():
            return q.strip()
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    raw = _extract_access_token(request, token)
    if not raw:
        raise cred_exc
    try:
        payload = decode_token(raw)
        if payload.get("type") != "access":
            raise cred_exc
        user_id = payload["sub"]
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


def require_module(module: str):
    """Enforce module ACL stored on the user (mirrors frontend canAccessModule)."""
    from app.core.modules import user_can_access

    def checker(user: User = Depends(get_current_user)) -> User:
        if not user_can_access(user.rol, getattr(user, "modulos_acceso", None), module):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sin acceso al módulo '{module}'",
            )
        return user

    return checker
