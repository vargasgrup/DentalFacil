"""users.username for login; email optional (recovery only).

Revision ID: r12user_username
Revises: q11backup_dir
Create Date: 2026-08-06
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "r12user_username"
down_revision: Union[str, None] = "q11backup_dir"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("users")} if "users" in insp.get_table_names() else set()
    if "username" not in cols:
        op.add_column("users", sa.Column("username", sa.String(length=40), nullable=True))
    # Backfill in Python app ensure; create index if missing
    try:
        op.create_index("ix_users_username", "users", ["username"], unique=True)
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_index("ix_users_username", table_name="users")
    except Exception:
        pass
    try:
        op.drop_column("users", "username")
    except Exception:
        pass
