"""System maintenance cycle — status for clinic users; reset for vendor only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.rate_limit import enforce_rate_limit
from app.database import get_db
from app.models import User
from app.services.audit import log_audit
from app.services.maintenance_cycle import get_maintenance_status, reset_maintenance_cycle

router = APIRouter(prefix="/api/system/maintenance", tags=["system-maintenance"])


class MaintenanceResetIn(BaseModel):
    access_key: str = Field(..., min_length=8, max_length=256)


@router.get("/status")
def maintenance_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Authenticated users may see whether the preventive cycle is due (alert only)."""
    _ = user
    return get_maintenance_status(db)


@router.post("/reset")
def maintenance_reset(
    payload: MaintenanceResetIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Restart the 6-month cycle. Requires MAINTENANCE_ACCESS_KEY — not clinic roles.
    No product navigation exposes this control; vendor staff use the hidden ops page.
    """
    enforce_rate_limit(request, limit_per_minute=5, scope="maintenance-reset")
    result = reset_maintenance_cycle(db, access_key=payload.access_key)
    log_audit(
        db,
        patient_id=None,
        entity_type="system",
        entity_id="maintenance_cycle",
        action="reset",
        user_id=None,
        detail={"due_at": result.get("due_at"), "source_ip": request.client.host if request.client else None},
    )
    db.commit()
    return result
