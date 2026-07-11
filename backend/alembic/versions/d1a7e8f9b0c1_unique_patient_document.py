"""Unique patient document constraint

Revision ID: d1a7e8f9b0c1
Revises: c9f2a1b3d4e5
Create Date: 2026-07-11
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d1a7e8f9b0c1"
down_revision: Union[str, None] = "c9f2a1b3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # One patient per document number (when provided). Empty/null allowed for minors without DNI yet.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_patients_tipo_numero_documento
        ON patients (tipo_documento, numero_documento)
        WHERE numero_documento IS NOT NULL AND btrim(numero_documento) <> '';
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_patients_tipo_numero_documento;")
