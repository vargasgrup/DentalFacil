"""Add editable especialidades catalog to clinic_settings.

Revision ID: j7a8b9c0d1e2
Revises: i6f7a8b9c0d1
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision = "j7a8b9c0d1e2"
down_revision = "i6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "clinic_settings",
        sa.Column("especialidades", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    drop_column_if_exists("clinic_settings", "especialidades")
