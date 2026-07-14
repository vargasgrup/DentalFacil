"""Add revoked_tokens table and users.token_version for JWT revocation.

Revision ID: l9c0d1e2f3a4
Revises: k8b9c0d1e2f3
Create Date: 2026-07-13
"""

from alembic import op
import sqlalchemy as sa

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision = "l9c0d1e2f3a4"
down_revision = "k8b9c0d1e2f3"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    return name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    if not _table_exists("revoked_tokens"):
        op.create_table(
            "revoked_tokens",
            sa.Column("jti", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("reason", sa.String(length=100), nullable=True),
            sa.Column(
                "revoked_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("jti"),
        )
        op.create_index("ix_revoked_tokens_expires_at", "revoked_tokens", ["expires_at"])
        op.create_index("ix_revoked_tokens_user_id", "revoked_tokens", ["user_id"])

    add_column_if_missing(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    drop_column_if_exists("users", "token_version")
    if _table_exists("revoked_tokens"):
        op.drop_index("ix_revoked_tokens_user_id", table_name="revoked_tokens")
        op.drop_index("ix_revoked_tokens_expires_at", table_name="revoked_tokens")
        op.drop_table("revoked_tokens")
