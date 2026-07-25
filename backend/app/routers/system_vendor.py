"""Vendor-only system ops (maintenance key). No clinic JWT required."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy.orm import Session

from app.core.rate_limit import enforce_rate_limit
from app.database import get_db
from app.services.audit import log_audit
from app.services.vendor_rescue import list_admin_accounts, rescue_admin_password

router = APIRouter(prefix="/api/system/vendor", tags=["system-vendor"])


class VendorKeyIn(BaseModel):
    access_key: str = Field(..., min_length=8, max_length=256)


class VendorRescueAdminIn(BaseModel):
    access_key: str = Field(..., min_length=8, max_length=256)
    admin_email: EmailStr
    new_password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)
    confirm_token: str = Field(..., min_length=1, max_length=32)

    @model_validator(mode="after")
    def _match(self) -> "VendorRescueAdminIn":
        if self.new_password != self.confirm_password:
            raise ValueError("Las contraseñas no coinciden")
        return self


@router.post("/list-admins")
def vendor_list_admins(
    payload: VendorKeyIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """List ADMIN accounts (nombre/email) for rescue — vendor key only."""
    enforce_rate_limit(request, limit_per_minute=5, scope="vendor-list-admins")
    return {"admins": list_admin_accounts(db, access_key=payload.access_key)}


@router.post("/rescue-admin-password")
def vendor_rescue_admin_password(
    payload: VendorRescueAdminIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Break-glass: set a new password for a locked ADMIN without clinic login.
    Requires fixed vendor key + typing RESCATAR. Rate-limited.
    """
    enforce_rate_limit(request, limit_per_minute=3, scope="vendor-rescue-admin")
    result = rescue_admin_password(
        db,
        access_key=payload.access_key,
        admin_email=str(payload.admin_email),
        new_password=payload.new_password,
        confirm_password=payload.confirm_password,
        confirm_token=payload.confirm_token,
    )
    log_audit(
        db,
        patient_id=None,
        entity_type="system",
        entity_id="vendor_rescue",
        action="rescue_admin_password",
        user_id=None,
        detail={
            "email": result.get("email"),
            "reactivated": result.get("reactivated"),
            "source_ip": request.client.host if request.client else None,
        },
    )
    db.commit()
    return result
