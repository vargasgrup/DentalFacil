"""Dashboard home API."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models import User
from app.services.dashboard_service import build_dashboard_home

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/home")
def dashboard_home(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Aggregated data for the modern Inicio dashboard."""
    return build_dashboard_home(db)
