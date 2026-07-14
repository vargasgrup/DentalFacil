import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.revoked_token import RevokedToken


ALGORITHM = settings.JWT_ALGORITHM


def hash_password(password: str) -> str:
    pw_bytes = password.encode("utf-8")
    pw_bytes = pw_bytes[:72]  # bcrypt max 72 bytes
    return bcrypt.hashpw(pw_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    pw_bytes = plain.encode("utf-8")[:72]
    try:
        return bcrypt.checkpw(pw_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, role: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "role": role,
        "type": "access",
        "exp": expire,
        "jti": uuid.uuid4().hex,
        "ver": token_version,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def create_refresh_token(subject: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "type": "refresh",
        "exp": expire,
        "jti": uuid.uuid4().hex,
        "ver": token_version,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])


def exp_to_datetime(exp: object) -> datetime:
    if isinstance(exp, datetime):
        return exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
    return datetime.fromtimestamp(int(exp), tz=timezone.utc)


def is_token_revoked(db: Session, jti: str | None) -> bool:
    if not jti:
        return False
    return db.get(RevokedToken, jti) is not None


def revoke_token_payload(
    db: Session,
    payload: dict,
    *,
    user_id: int | None = None,
    reason: str | None = None,
) -> None:
    jti = payload.get("jti")
    if not jti or db.get(RevokedToken, jti) is not None:
        return
    exp = payload.get("exp")
    if exp is None:
        return
    uid = user_id
    if uid is None and payload.get("sub") is not None:
        try:
            uid = int(payload["sub"])
        except (TypeError, ValueError):
            uid = None
    db.add(
        RevokedToken(
            jti=jti,
            expires_at=exp_to_datetime(exp),
            user_id=uid,
            reason=reason,
        )
    )
