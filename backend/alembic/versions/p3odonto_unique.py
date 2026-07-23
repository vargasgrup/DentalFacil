"""Idempotent unique indexes for odontogram/periodontogram composite keys.

Revision ID: p3odonto_unique
Revises: o2alta_retroactiva
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "p3odonto_unique"
down_revision: Union[str, None] = "o2alta_retroactiva"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_unique_index(table: str, name: str, columns: list[str]) -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if table not in insp.get_table_names():
        return
    indexes = {ix["name"] for ix in insp.get_indexes(table)}
    if name in indexes:
        return
    op.create_index(name, table, columns, unique=True)


def upgrade() -> None:
    _ensure_unique_index(
        "odontogram_entries",
        "ix_odontogram_patient_pieza_denticion",
        ["patient_id", "pieza_fdi", "denticion"],
    )
    _ensure_unique_index(
        "periodontogram_entries",
        "ix_periodontogram_pieza",
        ["patient_id", "pieza_fdi", "denticion"],
    )


def downgrade() -> None:
    # No-op: indexes may pre-exist from earlier migrations; do not drop on downgrade.
    pass
