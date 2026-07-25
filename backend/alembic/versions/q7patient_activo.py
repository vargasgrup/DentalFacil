"""Add patients.activo for soft deactivate / reactivate.

Revision ID: q7patient_activo
Revises: q6hist_docs
Create Date: 2026-07-25
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision: str = "q7patient_activo"
down_revision: Union[str, None] = "q6hist_docs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "patients",
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    )
    # Index for list filters (idempotent via IF NOT EXISTS not in helpers — create if missing)
    from alembic import op
    from sqlalchemy import inspect

    bind = op.get_bind()
    insp = inspect(bind)
    existing = {ix["name"] for ix in insp.get_indexes("patients")}
    if "ix_patients_activo" not in existing:
        op.create_index("ix_patients_activo", "patients", ["activo"])


def downgrade() -> None:
    from alembic import op
    from sqlalchemy import inspect

    bind = op.get_bind()
    insp = inspect(bind)
    existing = {ix["name"] for ix in insp.get_indexes("patients")}
    if "ix_patients_activo" in existing:
        op.drop_index("ix_patients_activo", table_name="patients")
    drop_column_if_exists("patients", "activo")
