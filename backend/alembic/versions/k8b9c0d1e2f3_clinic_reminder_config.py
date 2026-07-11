"""Persist reminder template/hours on clinic_settings.

Revision ID: k8b9c0d1e2f3
Revises: j7a8b9c0d1e2
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa

revision = "k8b9c0d1e2f3"
down_revision = "j7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clinic_settings",
        sa.Column("reminder_hours_before", sa.Integer(), nullable=True),
    )
    op.add_column(
        "clinic_settings",
        sa.Column("reminder_template", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clinic_settings", "reminder_template")
    op.drop_column("clinic_settings", "reminder_hours_before")
