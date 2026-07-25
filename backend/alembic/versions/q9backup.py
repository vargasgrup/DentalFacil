"""Add backup_settings and backup_history tables.

Revision ID: q9backup
Revises: q8maint_cycle
Create Date: 2026-07-25
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "q9backup"
down_revision: Union[str, None] = "q8maint_cycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "backup_settings" not in tables:
        op.create_table(
            "backup_settings",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("auto_backup_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("frequency", sa.String(20), nullable=False, server_default="daily"),
            sa.Column("preferred_hour", sa.String(5), nullable=False, server_default="22:00"),
            sa.Column("retention_count", sa.Integer(), nullable=False, server_default="10"),
            sa.Column("keep_manual", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("last_backup_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "backup_history" not in tables:
        op.create_table(
            "backup_history",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column("abs_path", sa.String(500), nullable=False),
            sa.Column("triggered_by", sa.String(20), nullable=False),
            sa.Column("status", sa.String(20), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("size_bytes", sa.Integer(), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("keep", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "backup_history" in tables:
        op.drop_table("backup_history")
    if "backup_settings" in tables:
        op.drop_table("backup_settings")
