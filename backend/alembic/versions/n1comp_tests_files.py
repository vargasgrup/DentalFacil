"""Add complementary_test_files for Rx, clinical photos and lab reports.

Revision ID: n1comp_tests_files
Revises: m0sqlite_uuid_baseline
Create Date: 2026-07-22
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "n1comp_tests_files"
down_revision: Union[str, None] = "m0sqlite_uuid_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "complementary_test_files",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("patient_id", sa.String(length=36), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("categoria", sa.String(length=40), nullable=False),
        sa.Column("subtipo", sa.String(length=60), nullable=False, server_default="general"),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("stored_path", sa.String(length=500), nullable=False),
        sa.Column(
            "content_type",
            sa.String(length=120),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_complementary_test_files_patient_id",
        "complementary_test_files",
        ["patient_id"],
    )
    op.create_index(
        "ix_complementary_test_files_categoria",
        "complementary_test_files",
        ["categoria"],
    )


def downgrade() -> None:
    op.drop_index("ix_complementary_test_files_categoria", table_name="complementary_test_files")
    op.drop_index("ix_complementary_test_files_patient_id", table_name="complementary_test_files")
    op.drop_table("complementary_test_files")
