"""Add alta retroactiva fields (migrated historical patients).

Revision ID: o2alta_retroactiva
Revises: n1comp_tests_files
Create Date: 2026-07-23
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision: str = "o2alta_retroactiva"
down_revision: Union[str, None] = "n1comp_tests_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "patients",
        sa.Column("es_migrado", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    add_column_if_missing(
        "patients",
        sa.Column("fecha_ingreso_clinica", sa.Date(), nullable=True),
    )
    add_column_if_missing(
        "patients",
        sa.Column("resumen_historia_previa", sa.Text(), nullable=True),
    )
    add_column_if_missing(
        "clinical_evolution_entries",
        sa.Column(
            "origen",
            sa.String(length=20),
            nullable=False,
            server_default="tiempo_real",
        ),
    )
    add_column_if_missing(
        "odontogram_snapshots",
        sa.Column(
            "origen",
            sa.String(length=20),
            nullable=False,
            server_default="tiempo_real",
        ),
    )


def downgrade() -> None:
    drop_column_if_exists("odontogram_snapshots", "origen")
    drop_column_if_exists("clinical_evolution_entries", "origen")
    drop_column_if_exists("patients", "resumen_historia_previa")
    drop_column_if_exists("patients", "fecha_ingreso_clinica")
    drop_column_if_exists("patients", "es_migrado")
