"""ficha clinica fields and plan jsonb

Revision ID: f1030bfb1b16
Revises: 2905d1e9dd7e
Create Date: 2026-07-10 08:45:00.000000
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from app.alembic_helpers import add_column_if_missing, column_exists, drop_column_if_exists


revision: str = "f1030bfb1b16"
down_revision: Union[str, None] = "2905d1e9dd7e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Patients: add identification fields (idempotent) ---
    add_column_if_missing("patients", sa.Column("lugar_nacimiento", sa.String(length=120), nullable=True))
    add_column_if_missing("patients", sa.Column("ocupacion", sa.String(length=120), nullable=True))
    add_column_if_missing("patients", sa.Column("estado_civil", sa.String(length=40), nullable=True))
    add_column_if_missing("patients", sa.Column("nombre_responsable", sa.String(length=120), nullable=True))

    # --- Clinical records: add observaciones ---
    add_column_if_missing("clinical_records", sa.Column("observaciones", sa.Text(), nullable=True))

    # --- Migrate plan_tratamiento from text to JSONB if still needed ---
    # If plan_tratamiento is already JSON/JSONB and no temp column, skip conversion.
    if column_exists("clinical_records", "plan_tratamiento_new"):
        # Interrupted previous run: finish rename if old column gone
        if not column_exists("clinical_records", "plan_tratamiento"):
            op.alter_column(
                "clinical_records",
                "plan_tratamiento_new",
                new_column_name="plan_tratamiento",
            )
            return

    if not column_exists("clinical_records", "plan_tratamiento"):
        add_column_if_missing(
            "clinical_records",
            sa.Column("plan_tratamiento", JSONB, nullable=True),
        )
        return

    bind = op.get_bind()
    col_type = None
    for c in sa.inspect(bind).get_columns("clinical_records"):
        if c["name"] == "plan_tratamiento":
            col_type = c["type"]
            break

    type_name = type(col_type).__name__.upper() if col_type is not None else ""
    if "JSON" in type_name:
        # Already migrated to JSON/JSONB
        return

    add_column_if_missing(
        "clinical_records",
        sa.Column("plan_tratamiento_new", JSONB, nullable=True),
    )

    result = bind.execute(
        sa.text(
            "SELECT id, plan_tratamiento FROM clinical_records "
            "WHERE plan_tratamiento IS NOT NULL AND plan_tratamiento::text != ''"
        )
    )
    for row in result:
        record_id, plan_text = row
        if plan_text:
            items = []
            for line in str(plan_text).split("\n"):
                line = line.strip()
                if line:
                    items.append({"item": line, "cantidad": 1})
            if items:
                bind.execute(
                    sa.text(
                        "UPDATE clinical_records SET plan_tratamiento_new = CAST(:data AS JSONB) WHERE id = :id"
                    ),
                    {"data": json.dumps(items), "id": record_id},
                )

    drop_column_if_exists("clinical_records", "plan_tratamiento")
    if column_exists("clinical_records", "plan_tratamiento_new"):
        op.alter_column(
            "clinical_records",
            "plan_tratamiento_new",
            new_column_name="plan_tratamiento",
        )


def downgrade() -> None:
    add_column_if_missing("clinical_records", sa.Column("plan_tratamiento_old", sa.Text(), nullable=True))

    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT id, plan_tratamiento FROM clinical_records WHERE plan_tratamiento IS NOT NULL")
    )
    for row in result:
        record_id, plan_data = row
        if plan_data and isinstance(plan_data, list):
            lines = [f"{i.get('item', '')}" for i in plan_data if isinstance(i, dict)]
            conn.execute(
                sa.text("UPDATE clinical_records SET plan_tratamiento_old = :data WHERE id = :id"),
                {"data": "\n".join(lines), "id": record_id},
            )

    drop_column_if_exists("clinical_records", "plan_tratamiento")
    if column_exists("clinical_records", "plan_tratamiento_old"):
        op.alter_column(
            "clinical_records",
            "plan_tratamiento_old",
            new_column_name="plan_tratamiento",
        )

    drop_column_if_exists("clinical_records", "observaciones")
    drop_column_if_exists("patients", "nombre_responsable")
    drop_column_if_exists("patients", "estado_civil")
    drop_column_if_exists("patients", "ocupacion")
    drop_column_if_exists("patients", "lugar_nacimiento")
