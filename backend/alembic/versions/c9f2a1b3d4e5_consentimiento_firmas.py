"""Add consentimiento signature image columns

Revision ID: c9f2a1b3d4e5
Revises: b8e4f1a2c3d0
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c9f2a1b3d4e5"
down_revision: Union[str, None] = "b8e4f1a2c3d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinical_records",
        sa.Column("firma_odontologo", sa.Text(), nullable=True),
    )
    op.add_column(
        "clinical_records",
        sa.Column("firma_paciente", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clinical_records", "firma_paciente")
    op.drop_column("clinical_records", "firma_odontologo")
