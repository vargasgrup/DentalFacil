"""Extend clinic_settings with Peruvian dental center identity fields.

Revision ID: i6f7a8b9c0d1
Revises: h5e6f7a8b9c0
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa

revision = "i6f7a8b9c0d1"
down_revision = "h5e6f7a8b9c0"
branch_labels = None
depends_on = None

_COLS = [
    ("razon_social", sa.String(200)),
    ("nombre_comercial", sa.String(200)),
    ("ruc", sa.String(11)),
    ("direccion", sa.String(300)),
    ("distrito", sa.String(80)),
    ("provincia", sa.String(80)),
    ("departamento", sa.String(80)),
    ("telefono", sa.String(30)),
    ("email", sa.String(120)),
    ("ticket_serie", sa.String(10)),
    ("eslogan", sa.String(200)),
    ("director_nombre", sa.String(150)),
    ("cop_registro", sa.String(40)),
    ("logo_path", sa.String(500)),
]


def upgrade() -> None:
    for name, col_type in _COLS:
        op.add_column("clinic_settings", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLS):
        op.drop_column("clinic_settings", name)
