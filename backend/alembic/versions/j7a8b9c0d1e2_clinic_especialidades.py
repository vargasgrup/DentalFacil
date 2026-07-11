"""Add editable especialidades catalog to clinic_settings.

Revision ID: j7a8b9c0d1e2
Revises: i6f7a8b9c0d1
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "j7a8b9c0d1e2"
down_revision = "i6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clinic_settings",
        sa.Column("especialidades", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clinic_settings", "especialidades")
