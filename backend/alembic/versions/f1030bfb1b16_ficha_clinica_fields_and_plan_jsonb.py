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


revision: str = 'f1030bfb1b16'
down_revision: Union[str, None] = '2905d1e9dd7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Patients: add identification fields ---
    op.add_column('patients', sa.Column('lugar_nacimiento', sa.String(length=120), nullable=True))
    op.add_column('patients', sa.Column('ocupacion', sa.String(length=120), nullable=True))
    op.add_column('patients', sa.Column('estado_civil', sa.String(length=40), nullable=True))
    op.add_column('patients', sa.Column('nombre_responsable', sa.String(length=120), nullable=True))

    # --- Clinical records: add observaciones ---
    op.add_column('clinical_records', sa.Column('observaciones', sa.Text(), nullable=True))

    # --- Migrate plan_tratamiento from text to JSONB ---
    # Step 1: Add new column (JSONB)
    op.add_column('clinical_records', sa.Column('plan_tratamiento_new', JSONB, nullable=True))

    # Step 2: Migrate existing text data into structured JSONB
    # Each line of the existing text becomes one item with cantidad=1
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT id, plan_tratamiento FROM clinical_records WHERE plan_tratamiento IS NOT NULL AND plan_tratamiento != ''"))
    for row in result:
        record_id, plan_text = row
        if plan_text:
            items = []
            for line in plan_text.split('\n'):
                line = line.strip()
                if line:
                    items.append({"item": line, "cantidad": 1})
            if items:
                conn.execute(
                    sa.text("UPDATE clinical_records SET plan_tratamiento_new = CAST(:data AS JSONB) WHERE id = :id"),
                    {"data": json.dumps(items), "id": record_id}
                )
    conn.commit()

    # Step 3: Drop old column and rename new one
    op.drop_column('clinical_records', 'plan_tratamiento')
    op.alter_column('clinical_records', 'plan_tratamiento_new', new_column_name='plan_tratamiento')


def downgrade() -> None:
    # --- Revert plan_tratamiento: JSONB -> text ---
    op.add_column('clinical_records', sa.Column('plan_tratamiento_old', sa.Text(), nullable=True))

    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT id, plan_tratamiento FROM clinical_records WHERE plan_tratamiento IS NOT NULL"))
    for row in result:
        record_id, plan_data = row
        if plan_data and isinstance(plan_data, list):
            lines = [f"{i.get('item', '')}" for i in plan_data if isinstance(i, dict)]
            conn.execute(
                sa.text("UPDATE clinical_records SET plan_tratamiento_old = :data WHERE id = :id"),
                {"data": '\n'.join(lines), "id": record_id}
            )
    conn.commit()

    op.drop_column('clinical_records', 'plan_tratamiento')
    op.alter_column('clinical_records', 'plan_tratamiento_old', new_column_name='plan_tratamiento')

    # --- Remove added columns ---
    op.drop_column('clinical_records', 'observaciones')
    op.drop_column('patients', 'nombre_responsable')
    op.drop_column('patients', 'estado_civil')
    op.drop_column('patients', 'ocupacion')
    op.drop_column('patients', 'lugar_nacimiento')
