"""Add users.modulos_acceso (JSON list of enabled app modules).

Revision ID: p5user_modulos
Revises: p4patient_especialidad
Create Date: 2026-07-23
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision: str = "p5user_modulos"
down_revision: Union[str, None] = "p4patient_especialidad"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "users",
        sa.Column("modulos_acceso", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    drop_column_if_exists("users", "modulos_acceso")
