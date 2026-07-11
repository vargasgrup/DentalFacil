"""Extend odontogram_entries for anatomical chart (surfaces + dentition).

Revision ID: e2b3c4d5e6f7
Revises: d1a7e8f9b0c1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e2b3c4d5e6f7"
down_revision: Union[str, None] = "d1a7e8f9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "odontogram_entries",
        sa.Column("denticion", sa.String(length=20), nullable=False, server_default="permanente"),
    )
    op.add_column(
        "odontogram_entries",
        sa.Column(
            "superficies",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{\"M\": null, \"D\": null, \"V\": null, \"L\": null, \"O\": null}'::jsonb"),
        ),
    )
    # Normalize legacy estado values
    op.execute(
        """
        UPDATE odontogram_entries SET estado = CASE estado
            WHEN 'obturado' THEN 'obturacion'
            WHEN 'a_extraer' THEN 'extraccion_indicada'
            ELSE estado
        END
        """
    )
    op.create_index(
        "ix_odontogram_patient_pieza_denticion",
        "odontogram_entries",
        ["patient_id", "pieza_fdi", "denticion"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_odontogram_patient_pieza_denticion", table_name="odontogram_entries")
    op.drop_column("odontogram_entries", "superficies")
    op.drop_column("odontogram_entries", "denticion")
