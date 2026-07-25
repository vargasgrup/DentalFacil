"""Add backup_directory to backup_settings.

Revision ID: q11backup_dir
Revises: q10pwd_reset
Create Date: 2026-07-25
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "q11backup_dir"
down_revision: Union[str, None] = "q10pwd_reset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "backup_settings" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("backup_settings")}
    if "backup_directory" not in cols:
        with op.batch_alter_table("backup_settings") as batch:
            batch.add_column(sa.Column("backup_directory", sa.String(500), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "backup_settings" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("backup_settings")}
    if "backup_directory" in cols:
        with op.batch_alter_table("backup_settings") as batch:
            batch.drop_column("backup_directory")
