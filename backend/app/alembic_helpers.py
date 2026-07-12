"""Helpers for idempotent Alembic upgrades on Railway (schema may already exist)."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


def column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return any(c["name"] == column for c in insp.get_columns(table))


def add_column_if_missing(table: str, column: sa.Column) -> None:
    if not column_exists(table, column.name):
        op.add_column(table, column)


def drop_column_if_exists(table: str, column: str) -> None:
    if column_exists(table, column):
        op.drop_column(table, column)
