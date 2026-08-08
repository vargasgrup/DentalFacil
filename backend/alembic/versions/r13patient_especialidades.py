"""patients.especialidades JSON list (multi-specialty); backfill from especialidad.

Revision ID: r13patient_especialidades
Revises: r12user_username
Create Date: 2026-08-08
"""

from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

from app.alembic_helpers import add_column_if_missing, drop_column_if_exists

revision: str = "r13patient_especialidades"
down_revision: Union[str, None] = "r12user_username"
branch_labels = None
depends_on = None


def upgrade() -> None:
    add_column_if_missing(
        "patients",
        sa.Column("especialidades", sa.JSON(), nullable=True),
    )
    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "sqlite":
        # SQLite: copy single specialty into JSON text array
        rows = bind.execute(
            sa.text(
                "SELECT id, especialidad FROM patients "
                "WHERE especialidad IS NOT NULL AND trim(especialidad) != ''"
            )
        ).fetchall()
        for pid, esp in rows:
            import json

            bind.execute(
                sa.text(
                    "UPDATE patients SET especialidades = :j "
                    "WHERE id = :id AND (especialidades IS NULL OR especialidades = '')"
                ),
                {"j": json.dumps([str(esp).strip()], ensure_ascii=False), "id": pid},
            )
    else:
        bind.execute(
            sa.text(
                """
                UPDATE patients
                   SET especialidades = jsonb_build_array(especialidad)
                 WHERE especialidad IS NOT NULL
                   AND btrim(especialidad) <> ''
                   AND (especialidades IS NULL OR especialidades::text IN ('null', '[]'))
                """
            )
        )


def downgrade() -> None:
    drop_column_if_exists("patients", "especialidades")
