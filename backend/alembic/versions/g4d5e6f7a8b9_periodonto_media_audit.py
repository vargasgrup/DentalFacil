"""Periodontogram + tooth media + clinical audit (Fases 2 y 5).

Revision ID: g4d5e6f7a8b9
Revises: f3c4d5e6f7a8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g4d5e6f7a8b9"
down_revision: Union[str, None] = "f3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "periodontogram_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("pieza_fdi", sa.String(4), nullable=False),
        sa.Column("denticion", sa.String(20), nullable=False, server_default="permanente"),
        sa.Column("movilidad", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("recesion_mm", sa.Numeric(4, 1), nullable=False, server_default="0"),
        sa.Column("sondaje_v", sa.Numeric(4, 1), nullable=False, server_default="0"),
        sa.Column("sondaje_l", sa.Numeric(4, 1), nullable=False, server_default="0"),
        sa.Column("sondaje_m", sa.Numeric(4, 1), nullable=False, server_default="0"),
        sa.Column("sondaje_d", sa.Numeric(4, 1), nullable=False, server_default="0"),
        sa.Column("sangrado", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("placa", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_periodontogram_patient", "periodontogram_entries", ["patient_id"])
    op.create_index(
        "ix_periodontogram_pieza",
        "periodontogram_entries",
        ["patient_id", "pieza_fdi", "denticion"],
        unique=True,
    )

    op.create_table(
        "tooth_media",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("pieza_fdi", sa.String(4), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False, server_default="foto"),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False, server_default="image/jpeg"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_tooth_media_patient", "tooth_media", ["patient_id"])
    op.create_index("ix_tooth_media_pieza", "tooth_media", ["patient_id", "pieza_fdi"])

    op.create_table(
        "clinical_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("entity_type", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.String(60), nullable=True),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_clinical_audit_patient", "clinical_audit_log", ["patient_id"])

    # Vincular plan_item / factura en caja
    op.add_column(
        "cash_transactions",
        sa.Column("plan_item_ref", sa.String(80), nullable=True),
    )
    op.add_column(
        "cash_transactions",
        sa.Column("pieza_fdi", sa.String(4), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cash_transactions", "pieza_fdi")
    op.drop_column("cash_transactions", "plan_item_ref")
    op.drop_index("ix_clinical_audit_patient", table_name="clinical_audit_log")
    op.drop_table("clinical_audit_log")
    op.drop_index("ix_tooth_media_pieza", table_name="tooth_media")
    op.drop_index("ix_tooth_media_patient", table_name="tooth_media")
    op.drop_table("tooth_media")
    op.drop_index("ix_periodontogram_pieza", table_name="periodontogram_entries")
    op.drop_index("ix_periodontogram_patient", table_name="periodontogram_entries")
    op.drop_table("periodontogram_entries")
