"""Add patients.especialidad (specialty for care tracking / filters).

Revision ID: p4patient_especialidad
Revises: p3odonto_unique
Create Date: 2026-07-23
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision: str = "p4patient_especialidad"
down_revision: Union[str, None] = "p3odonto_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "patients",
        sa.Column("especialidad", sa.String(length=80), nullable=True),
    )
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "patients" in insp.get_table_names():
        indexes = {ix["name"] for ix in insp.get_indexes("patients")}
        if "ix_patients_especialidad" not in indexes:
            op.create_index("ix_patients_especialidad", "patients", ["especialidad"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "patients" in insp.get_table_names():
        indexes = {ix["name"] for ix in insp.get_indexes("patients")}
        if "ix_patients_especialidad" in indexes:
            op.drop_index("ix_patients_especialidad", table_name="patients")
    drop_column_if_exists("patients", "especialidad")
