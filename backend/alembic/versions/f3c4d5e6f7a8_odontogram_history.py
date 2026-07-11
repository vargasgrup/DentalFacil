"""Odontogram change log + visit snapshots.

Revision ID: f3c4d5e6f7a8
Revises: e2b3c4d5e6f7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f3c4d5e6f7a8"
down_revision: Union[str, None] = "e2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "odontogram_change_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("pieza_fdi", sa.String(4), nullable=False, server_default=""),
        sa.Column("denticion", sa.String(20), nullable=False, server_default="permanente"),
        sa.Column("estado_antes", sa.String(40), nullable=True),
        sa.Column("estado_despues", sa.String(40), nullable=True),
        sa.Column("superficies_antes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("superficies_despues", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("accion", sa.String(20), nullable=False, server_default="upsert"),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_odontogram_change_log_patient_id", "odontogram_change_log", ["patient_id"])
    op.create_index(
        "ix_odontogram_change_log_pieza",
        "odontogram_change_log",
        ["patient_id", "pieza_fdi", "denticion"],
    )

    op.create_table(
        "odontogram_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("denticion", sa.String(20), nullable=False, server_default="permanente"),
        sa.Column("label", sa.String(120), nullable=False, server_default="Estado de cita"),
        sa.Column("entries", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("taken_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "evolution_entry_id",
            sa.Integer(),
            sa.ForeignKey("clinical_evolution_entries.id"),
            nullable=True,
        ),
        sa.Column(
            "taken_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_odontogram_snapshots_patient_id", "odontogram_snapshots", ["patient_id"])


def downgrade() -> None:
    op.drop_index("ix_odontogram_snapshots_patient_id", table_name="odontogram_snapshots")
    op.drop_table("odontogram_snapshots")
    op.drop_index("ix_odontogram_change_log_pieza", table_name="odontogram_change_log")
    op.drop_index("ix_odontogram_change_log_patient_id", table_name="odontogram_change_log")
    op.drop_table("odontogram_change_log")
