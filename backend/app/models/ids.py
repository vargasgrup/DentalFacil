"""Shared UUID helpers for primary keys (sync-ready, engine-agnostic)."""

from __future__ import annotations

import uuid

# Fixed singleton row for clinic_settings (replaces integer id=1).
CLINIC_SETTINGS_ID = "00000000-0000-4000-8000-000000000001"


def new_uuid() -> str:
    return str(uuid.uuid4())
