"""Add clinic_settings.maintenance_cycle_started_at for vendor 6-month cycle.

Revision ID: q8maint_cycle
Revises: q7patient_activo
Create Date: 2026-07-25
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision: str = "q8maint_cycle"
down_revision: Union[str, None] = "q7patient_activo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "clinic_settings",
        sa.Column("maintenance_cycle_started_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    drop_column_if_exists("clinic_settings", "maintenance_cycle_started_at")
