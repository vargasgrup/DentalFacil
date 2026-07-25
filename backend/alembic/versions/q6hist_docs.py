"""Add historical_documents for pre-system physical clinical archives.

Revision ID: q6hist_docs
Revises: p5user_modulos
Create Date: 2026-07-25
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "q6hist_docs"
down_revision: Union[str, None] = "p5user_modulos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "historical_documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "patient_id",
            sa.String(length=36),
            sa.ForeignKey("patients.id"),
            nullable=False,
        ),
        sa.Column("tipo", sa.String(length=40), nullable=False, server_default="ficha_clinica"),
        sa.Column("titulo", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("stored_path", sa.String(length=500), nullable=False),
        sa.Column(
            "content_type",
            sa.String(length=120),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="upload"),
        sa.Column("document_date", sa.Date(), nullable=True),
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
        "ix_historical_documents_patient_id",
        "historical_documents",
        ["patient_id"],
    )
    op.create_index(
        "ix_historical_documents_tipo",
        "historical_documents",
        ["tipo"],
    )


def downgrade() -> None:
    op.drop_index("ix_historical_documents_tipo", table_name="historical_documents")
    op.drop_index("ix_historical_documents_patient_id", table_name="historical_documents")
    op.drop_table("historical_documents")
