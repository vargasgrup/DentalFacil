"""clinic settings horario atencion

Revision ID: b8e4f1a2c3d0
Revises: ad74dc2fd5c0
Create Date: 2026-07-10 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b8e4f1a2c3d0"
down_revision: Union[str, None] = "ad74dc2fd5c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clinic_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("hora_apertura", sa.String(length=5), nullable=False, server_default="08:00"),
        sa.Column("hora_cierre", sa.String(length=5), nullable=False, server_default="20:00"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        "INSERT INTO clinic_settings (id, hora_apertura, hora_cierre) VALUES (1, '08:00', '20:00')"
    )


def downgrade() -> None:
    op.drop_table("clinic_settings")
