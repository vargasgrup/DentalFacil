"""Add password_reset_tokens table.

Revision ID: q10pwd_reset
Revises: q9backup
Create Date: 2026-07-25
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "q10pwd_reset"
down_revision: Union[str, None] = "q9backup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())
    if "password_reset_tokens" not in tables:
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column("code_plain", sa.String(12), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("email_sent", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
        op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)
        op.create_index("ix_password_reset_tokens_code_hash", "password_reset_tokens", ["code_hash"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "password_reset_tokens" in insp.get_table_names():
        op.drop_table("password_reset_tokens")
