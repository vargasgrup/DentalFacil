"""Add especialidad to appointments.

Revision ID: h5e6f7a8b9c0
Revises: g4d5e6f7a8b9
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision = "h5e6f7a8b9c0"
down_revision = "g4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "appointments",
        sa.Column("especialidad", sa.String(length=80), nullable=True),
    )


def downgrade() -> None:
    drop_column_if_exists("appointments", "especialidad")
